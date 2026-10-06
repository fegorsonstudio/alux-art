import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { r2ProxyUrl } from "@/lib/r2";
import {
  requireAdmin, cleanId, loadPost, publishState, readiness, withdraw, parseLagos,
  ACCOUNTS, BUCKET, type PostRow,
} from "@/lib/carousel/posts";

/**
 * One carousel post: read it, or save the owner's changes to it.
 *
 * `updated_at` is the post's CONTENT version — it moves only when something
 * that would appear on a slide changes (words, photographs, story pictures).
 * Approval is tied to it: the approve route only accepts the version the owner
 * just previewed, so nothing goes out that was not looked at. A new date, or a
 * GIF line, changes nothing on a slide and leaves it alone.
 */

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

/** A thumbnail through the media proxy, which admits the admin to any bucket. */
const thumb = (path: string | null | undefined) => (path ? `${r2ProxyUrl(BUCKET, path)}&width=800` : null);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return fail(403, "Forbidden");
  const id = cleanId((await params).id);
  const row = await loadPost(id);
  if (!row) return fail(404, "No such post.");

  const publish = await publishState(id);
  const [gif] = await sql<{ bytes: number; seconds: number; giphy_url: string | null; updated_at: Date }[]>`
    SELECT bytes, seconds, giphy_url, updated_at FROM carousel_gifs WHERE local_id = ${id}`;

  return NextResponse.json({
    post: shape(row),
    publish: publish ? { status: publish.status, error: publish.last_error, publishedAt: publish.published_at } : null,
    gif: gif ? {
      // The version in the address makes a re-made GIF show at once rather
      // than the browser's copy of the last one.
      url: `${r2ProxyUrl(BUCKET, `carousels/gifs/${id}.gif`)}&v=${new Date(gif.updated_at).getTime()}`,
      bytes: gif.bytes, seconds: gif.seconds, giphyUrl: gif.giphy_url,
    } : null,
    accounts: ACCOUNTS,
  });
}

function shape(row: PostRow) {
  const scenes = row.storyboard?.scenes ?? [];
  return {
    id: row.local_id,
    batch: row.batch,
    title: row.title,
    account: row.account,
    product: row.product,
    trigger: row.trigger_word,
    photosHint: row.photos_hint,
    cards: row.cards ?? [],
    caption: row.caption,
    buttonText: row.button_text,
    storyboard: row.storyboard,
    sceneImages: scenes.map((_s, i) => thumb(row.scene_paths?.[i])),
    before: thumb(row.before_path),
    after: thumb(row.after_path),
    gifLines: row.gif_lines ?? [],
    gifCleared: row.gif_cleared,
    scheduledFor: row.scheduled_for,
    status: row.status,
    slideCount: row.slide_count,
    approvedAt: row.approved_at,
    version: row.updated_at,
  };
}

const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return fail(403, "Forbidden");
  const id = cleanId((await params).id);
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return fail(400, "Nothing to save.");

  const pub = await publishState(id);
  if (pub && (pub.status === "publishing" || pub.status === "published")) {
    return fail(409, "This post is already on Instagram, so changing it here would change nothing there.");
  }

  type Outcome = { status: string; withdraw: boolean; row: PostRow } | { error: string; code: number };
  // Read-and-write under a row lock: two saves (or a save and a photo upload)
  // landing together must not each overwrite what the other just changed.
  const out: Outcome = await sql.begin(async (trx) => {
    const [row] = await trx<PostRow[]>`SELECT * FROM carousel_posts WHERE local_id = ${id} FOR UPDATE`;
    if (!row) return { error: "No such post.", code: 404 };

    const cards = Array.isArray(b.cards)
      ? b.cards.slice(0, 12).map((c) => {
          const card = (c ?? {}) as Record<string, unknown>;
          return { eyebrow: text(card.eyebrow, 60), headline: text(card.headline, 300), body: text(card.body, 700) };
        })
      : row.cards;
    // 2,200 characters is Instagram's caption limit; past it the post is refused.
    const caption = typeof b.caption === "string" ? b.caption.slice(0, 2200) : row.caption;
    const buttonText = typeof b.buttonText === "string" ? text(b.buttonText, 40) : row.button_text;
    const title = typeof b.title === "string" && b.title.trim() ? text(b.title, 120) : row.title;
    const account = typeof b.account === "string" && ACCOUNTS.includes(b.account) ? b.account : row.account;
    const when = "scheduledFor" in b ? parseLagos(b.scheduledFor) : row.scheduled_for;
    if (when === undefined) return { error: "That date and time could not be read.", code: 400 };
    const gifLines = Array.isArray(b.gifLines)
      ? b.gifLines.map((s) => text(s, 60)).filter(Boolean).slice(0, 6)
      : row.gif_lines;
    const gifCleared = typeof b.gifCleared === "boolean" ? b.gifCleared : row.gif_cleared;

    const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);
    // The account counts as content: approving a post approves where it goes.
    const contentChanged = !same(cards, row.cards) || caption !== row.caption ||
      buttonText !== row.button_text || account !== row.account;
    const dateChanged = (when?.getTime() ?? null) !== (row.scheduled_for ? new Date(row.scheduled_for).getTime() : null);
    const gifLinesChanged = !same(gifLines, row.gif_lines);

    // What was approved is no longer what would go out, so it is a draft
    // again. A new date alone keeps the approval, but a post already with the
    // publisher still has to come back off its queue: that row has the old time.
    let status = row.status;
    if (contentChanged) status = readiness(row);
    const unschedule = row.status === "scheduled" && (contentChanged || dateChanged);
    if (unschedule && !contentChanged) status = "approved";

    const [saved] = await trx<PostRow[]>`
      UPDATE carousel_posts SET
        title = ${title}, account = ${account}, cards = ${trx.json(cards)}, caption = ${caption},
        button_text = ${buttonText}, scheduled_for = ${when}, gif_lines = ${trx.json(gifLines)},
        gif_cleared = ${gifCleared}, status = ${status},
        approved_at = ${status === "approved" || status === "scheduled" ? row.approved_at : null},
        words_edited = words_edited OR ${contentChanged},
        date_edited = date_edited OR ${dateChanged},
        gif_lines_edited = gif_lines_edited OR ${gifLinesChanged},
        updated_at = CASE WHEN ${contentChanged} THEN NOW() ELSE updated_at END
      WHERE local_id = ${id}
      RETURNING *`;
    return { status, withdraw: unschedule, row: saved };
  });

  if ("error" in out) return fail(out.code, out.error);
  const withdrawn = out.withdraw ? await withdraw(id) : false;
  return NextResponse.json({ ok: true, post: shape(out.row), withdrawn });
}
