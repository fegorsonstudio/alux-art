import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import sql from "@/lib/db";
import { r2SignedDownloadUrl } from "@/lib/r2";
import { tellAdmin } from "@/lib/telegram";

/**
 * Publish the carousels whose time has come.
 *
 * Instagram's publishing API is three steps and all of them can fail
 * separately: a container per image, a carousel container holding them, then a
 * publish. Each image is fetched BY INSTAGRAM from a URL, which is why the
 * slides live in R2 rather than travelling as bytes.
 *
 * Runs on a cron every few minutes. A post is late rather than lost if the run
 * is missed, which is the right way round.
 */

export const maxDuration = 300;

const GRAPH = "https://graph.instagram.com/v23.0";
/** Give up after this many tries and tell a human; silence is the worst outcome. */
const MAX_ATTEMPTS = 3;

type Row = {
  id: string; ig_account: string; caption: string;
  slide_paths: string[]; attempts: number; scheduled_for: Date;
};

/** Where scripts/instagram-refresh.mjs keeps the tokens it renews every week. */
const TOKEN_STORE = `${process.env.INSTAGRAM_DATA_DIR || "/home/aluxart/instagram-data"}/tokens.json`;

/**
 * The first credentials for this account that Instagram actually accepts.
 *
 * The renewed token comes first. This used to read .env.local only — the token
 * pasted in by hand, which nothing renews and Instagram expires after 60 days —
 * while the weekly refresh job kept a living one in tokens.json that this route
 * never looked at. And the renewed one comes first but is not trusted blindly:
 * a password change killed @fegorson_studio's stored token while the hand-pasted
 * one still worked, so each candidate is checked with one read-only call and
 * the first that answers wins.
 */
async function credsFor(handle: string): Promise<{ token: string; id: string } | null> {
  const candidates: { token: string; id: string }[] = [];
  try {
    const stored = JSON.parse(await readFile(TOKEN_STORE, "utf8"))?.[handle];
    if (stored?.token && stored?.id) candidates.push({ token: stored.token, id: stored.id });
  } catch { /* no store on this machine: the environment is all there is */ }
  const key = handle.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const envToken = process.env[`IG_${key}_TOKEN`];
  const envId = process.env[`IG_${key}_ID`];
  if (envToken && envId && !candidates.some((c) => c.token === envToken)) {
    candidates.push({ token: envToken, id: envId });
  }
  for (const c of candidates) {
    const ok = await fetch(`${GRAPH}/me?fields=id&access_token=${encodeURIComponent(c.token)}`)
      .then((r) => r.json()).then((j) => Boolean(j?.id)).catch(() => false);
    if (ok) return c;
  }
  return null;
}

/** Longer than any real publish takes; past this a run has died mid-flight. */
const STUCK_MINUTES = 15;

export async function GET(request: NextRequest) {
  if (!process.env.INTERNAL_API_SECRET ||
      request.headers.get("x-internal-secret") !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // A post left at `publishing` belongs to a run that died part-way. It may
  // already be on the feed — the run can die after Instagram published it and
  // before this table heard — so it is NEVER retried automatically. A human
  // looks at the account and decides; a duplicate cannot be taken back.
  const stuck = await sql<{ id: string; ig_account: string; scheduled_for: Date }[]>`
    UPDATE scheduled_carousels
    SET status = 'failed', updated_at = NOW(),
        last_error = 'Interrupted while publishing. Check Instagram before sending it again: it may already be up.'
    WHERE status = 'publishing' AND updated_at < NOW() - make_interval(mins => ${STUCK_MINUTES})
    RETURNING id, ig_account, scheduled_for`;
  for (const s of stuck) {
    await tellAdmin(
      `⚠️ A carousel was interrupted while publishing\n\n` +
      `Account: @${s.ig_account}\nDue: ${s.scheduled_for.toISOString()}\n\n` +
      `It may or may not be on Instagram. Check the account before sending it again.`
    ).catch(() => {});
  }

  const due = await sql<Row[]>`
    SELECT id, ig_account, caption, slide_paths, attempts, scheduled_for
    FROM scheduled_carousels
    WHERE status = 'queued'
      AND scheduled_for <= NOW()
      AND attempts < ${MAX_ATTEMPTS}
    ORDER BY scheduled_for
    LIMIT 3`;

  const published: string[] = [];
  const failed: string[] = [];

  for (const post of due) {
    // Claimed before any network call, and only from `queued`: a row another
    // run has already moved to `publishing` is that run's, and matching it here
    // too is exactly how two overlapping runs would both publish it.
    const claimed = await sql`
      UPDATE scheduled_carousels
      SET status = 'publishing', attempts = attempts + 1, updated_at = NOW()
      WHERE id = ${post.id} AND status = 'queued'
      RETURNING id`;
    if (claimed.length === 0) continue;

    const creds = await credsFor(post.ig_account);
    const token = creds?.token;
    const igUserId = creds?.id;
    const fail = async (why: string) => {
      const over = post.attempts + 1 >= MAX_ATTEMPTS;
      await sql`UPDATE scheduled_carousels
                SET status = ${over ? "failed" : "queued"}, last_error = ${why.slice(0, 500)}, updated_at = NOW()
                WHERE id = ${post.id}`;
      console.error(`[carousel] ${post.id.slice(0, 8)} ${over ? "FAILED" : "will retry"}: ${why.slice(0, 200)}`);
      if (over) {
        await tellAdmin(
          `⚠️ A scheduled carousel could not be posted\n\n` +
          `Account: @${post.ig_account}\nDue: ${post.scheduled_for.toISOString()}\n` +
          `Reason: ${why.slice(0, 300)}\n\nThe slides are safe — it needs posting by hand.`
        ).catch(() => {});
      }
      failed.push(post.id);
    };

    if (!token || !igUserId) {
      await fail(`No working token for @${post.ig_account}: neither the renewed one nor the one in .env.local was accepted`);
      continue;
    }

    try {
      // 1 — one container per slide. is_carousel_item keeps them out of the feed
      // on their own.
      const childIds: string[] = [];
      for (const path of post.slide_paths) {
        // A SIGNED url, not the proxy one: r2ProxyUrl returns "/api/media?..."
        // which is relative, and Instagram fetches these itself from the open
        // internet. An hour is far longer than the fetch needs.
        const url = await r2SignedDownloadUrl("generated-4k", path, 3600);
        if (!url || !/^https?:\/\//i.test(url)) {
          throw new Error(`slide url is not publicly fetchable: ${path}`);
        }
        const r = await fetch(`${GRAPH}/${igUserId}/media`, {
          method: "POST",
          body: new URLSearchParams({ image_url: url, is_carousel_item: "true", access_token: token }),
        });
        const b = await r.json().catch(() => ({}));
        if (!b?.id) throw new Error(`slide container: ${JSON.stringify(b?.error ?? b).slice(0, 200)}`);
        childIds.push(b.id);
      }

      // 2 — the carousel itself, holding them in order.
      const parent = await fetch(`${GRAPH}/${igUserId}/media`, {
        method: "POST",
        body: new URLSearchParams({
          media_type: "CAROUSEL", children: childIds.join(","),
          caption: post.caption ?? "", access_token: token,
        }),
      }).then(r => r.json()).catch(() => ({}));
      if (!parent?.id) throw new Error(`carousel container: ${JSON.stringify(parent?.error ?? parent).slice(0, 200)}`);

      // 3 — publish. Instagram needs a moment to finish assembling the
      // container; publishing too early answers "media not ready".
      await new Promise(r => setTimeout(r, 4000));
      const out = await fetch(`${GRAPH}/${igUserId}/media_publish`, {
        method: "POST",
        body: new URLSearchParams({ creation_id: parent.id, access_token: token }),
      }).then(r => r.json()).catch(() => ({}));
      if (!out?.id) throw new Error(`publish: ${JSON.stringify(out?.error ?? out).slice(0, 200)}`);

      await sql`UPDATE scheduled_carousels
                SET status = 'published', ig_media_id = ${out.id}, published_at = NOW(),
                    last_error = NULL, updated_at = NOW()
                WHERE id = ${post.id}`;
      console.log(`[carousel] published ${post.id.slice(0, 8)} to @${post.ig_account} as ${out.id}`);
      published.push(post.id);
    } catch (e) {
      await fail((e as Error).message);
    }
  }

  return NextResponse.json({ ok: true, due: due.length, published: published.length, failed: failed.length });
}
