import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { signedMediaUrl } from "@/lib/media-url";
import { r2SignedDownloadUrl } from "@/lib/r2";
import { SITE_URL } from "@/lib/site-url";
import { sendText, sendImage, windowOpen, credsForAccount, type IgCreds } from "@/lib/instagram";
import { tellAdmin } from "@/lib/telegram";
import { needsContactEmail, CONTACT_EMAIL_ASK } from "@/lib/chat-contact-email";
import { instagramReadyCopy } from "@/lib/instagram-image";
import { sendWithLinkFallback } from "@/lib/instagram-bot";
import { RETOUCH_PRICE_PER_IMAGE_NGN } from "@/lib/retouch-pricing";
import { gifPublishOffer } from "@/lib/instagram-gif";
import { CONSENT_ASK, markAsked } from "@/lib/post-consent";

/**
 * Sends finished shoots back into the Instagram chat that ordered them.
 *
 * Sibling of /api/whatsapp/deliver and a poller for the same reasons: nothing
 * in lib/generate.ts is touched, delivery survives a restart mid-shoot, and it
 * retries by itself where a call at completion would not.
 *
 * shoots.ig_delivered_at is the idempotency guard, on the SHOOT and never on
 * the session — a session outlives any one booking, and a session-level flag is
 * what once made a paying customer's second shoot permanently invisible.
 *
 * One thing here has no WhatsApp equivalent: Instagram closes the conversation
 * 24 hours after the customer's last message. A shoot that finishes outside
 * that window cannot be delivered at all, so the window is checked BEFORE
 * trying, and the studio is told to reach the customer another way rather than
 * the send failing silently.
 */

export const dynamic = "force-dynamic";

/** Naira, with separators. */
const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

type Row = {
  shoot_id: string;
  shoot_status: string;
  ig_user_id: string;
  ig_account_id: string;
  ig_stranded_alerted_at: Date | null;
  ig_started_notified_at: Date | null;
  session_id: string | null;
  ig_username: string | null;
  last_inbound_at: Date | null;
  user_id: string | null;
};

/** A URL Instagram's own servers can fetch — no session, no cookies. */
async function publicUrl(bucket: string, path: string): Promise<string | null> {
  const signed = await signedMediaUrl(bucket, path, { expiresIn: 6 * 3600 }).catch(() => null);
  if (signed) return signed;
  return r2SignedDownloadUrl(bucket, path, 6 * 3600).catch(() => null);
}


/**
 * A login-free link to the full-size file.
 *
 * Minted on first use and kept, so the same link works if it is sent twice. An
 * Instagram or WhatsApp buyer has a synthetic account with no password, so this
 * is the only way they can reach the 4K file they paid for.
 */
async function downloadLink(shootId: string): Promise<string | null> {
  const [img] = await sql<{ id: string; token: string | null }[]>`
    SELECT id, download_token AS token FROM shoot_images
    WHERE shoot_id = ${shootId} AND status = 'COMPLETE'
      AND COALESCE(download_storage_path, preview_storage_path) IS NOT NULL
    ORDER BY slot LIMIT 1`.catch(() => []);
  if (!img) return null;

  let token = img.token;
  if (!token) {
    token = crypto.randomUUID().replace(/-/g, "");
    await sql`UPDATE shoot_images SET download_token = ${token} WHERE id = ${img.id}`
      .catch(() => { token = null; });
  }
  return token ? `${SITE_URL}/d/${token}` : null;
}

const finish = (sessionId: string | null, shootId: string) => Promise.all([
  sessionId
    ? sql`UPDATE instagram_sessions SET state = 'DONE', updated_at = NOW() WHERE id = ${sessionId}`
    : Promise.resolve(),
  sql`UPDATE shoots SET ig_delivered_at = NOW() WHERE id = ${shootId}`,
]);

export async function GET(req: NextRequest) {
  if (!process.env.INTERNAL_API_SECRET ||
      req.headers.get("x-internal-secret") !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Driven off SHOOTS, not sessions. A session holds one shoot_id, so a second
  // photo sent while the first was generating used to hide the first from this
  // query entirely. The session is joined only for the things that belong to the
  // conversation: the 24-hour window and who the person is.
  const rows = await sql<Row[]>`
    SELECT sh.id AS shoot_id, sh.status AS shoot_status,
           sh.ig_user_id, sh.ig_account_id,
           sh.ig_stranded_alerted_at, sh.ig_started_notified_at,
           s.id AS session_id, s.ig_username, s.last_inbound_at, s.user_id
    FROM shoots sh
    LEFT JOIN instagram_sessions s
      ON s.ig_user_id = sh.ig_user_id AND s.ig_account_id = sh.ig_account_id
    WHERE sh.ig_user_id IS NOT NULL
      AND sh.ig_delivered_at IS NULL
    ORDER BY sh.created_at ASC
    LIMIT 25`;

  const started: string[] = [], delivered: string[] = [], failed: string[] = [], stranded: string[] = [];

  for (const r of rows) {
    const creds = credsForAccount(r.ig_account_id);
    if (!creds) { console.warn("[ig deliver] no credentials for", r.ig_account_id); continue; }
    const to = r.ig_user_id;

    // Payment landed and generation began.
    if (!r.ig_started_notified_at) {
      if (["QUEUED", "PROCESSING", "BASE_LOCKING", "COMPLETE"].includes(r.shoot_status)) {
        await sql`UPDATE shoots SET ig_started_notified_at = NOW() WHERE id = ${r.shoot_id}`;
        if (r.session_id) {
          await sql`UPDATE instagram_sessions SET state = 'GENERATING', updated_at = NOW() WHERE id = ${r.session_id}`;
        }
        await sendText(creds, to,
          "Payment received, thank you ✅\n\nI'm relighting your photo now — usually a couple of " +
          "minutes. I'll send it here the moment it's ready.");
        // Asked at the moment money is actually at stake, and only once — this
        // is the point where a customer can see why it matters.
        if (await needsContactEmail(r.user_id)) {
          await sendText(creds, to, CONTACT_EMAIL_ASK);
        }
        started.push(r.shoot_id);
      }
      if (r.shoot_status !== "COMPLETE") continue;
    }

    // The window has closed. Nothing can be sent, so escalate instead of
    // burning the attempt and marking it delivered.
    if (!windowOpen(r.last_inbound_at)) {
      // No session row at all means the conversation was deleted — treat it the
      // same as a long-closed window rather than crashing the whole poller run
      // and stranding everyone else queued behind it.
      const hours = r.last_inbound_at
        ? Math.round((Date.now() - new Date(r.last_inbound_at).getTime()) / 3_600_000)
        : 999;
      console.warn(`[ig deliver] window closed (${hours}h) for @${r.ig_username ?? to} — cannot send`);
      // Alert ONCE per shoot. This used to fire on every poll: 276 identical
      // Telegram messages for one customer, two minutes apart, until it was
      // muted — which also mutes the next real one.
      if (r.shoot_status === "COMPLETE" && !r.ig_stranded_alerted_at) {
        await sql`UPDATE shoots SET ig_stranded_alerted_at = NOW() WHERE id = ${r.shoot_id}`;
        const link = await downloadLink(r.shoot_id);
        await tellAdmin(
          `⚠️ Instagram delivery blocked — the 24h window closed.\n\n` +
          `Customer: @${r.ig_username ?? to}\nShoot: ${r.shoot_id.slice(0, 8)}\n` +
          `Last heard from them ${hours}h ago. Their photo is finished and paid for but ` +
          `Instagram will not accept a message.` +
          // The owner cannot help without the file, so hand it over rather than
          // just reporting the problem.
          (link ? `\n\nSend them this - it needs no login:\n${link}` : "")
        ).catch(() => {});
        stranded.push(r.shoot_id);
      }
      continue;
    }

    if (r.shoot_status === "FAILED") {
      await sendText(creds, to,
        "I'm sorry — your photo didn't come out.\n\n" +
        "You have not lost your money. Send *support* and a person will sort this out for you today.");
      await finish(r.session_id, r.shoot_id);
      failed.push(r.shoot_id);
      continue;
    }

    if (r.shoot_status !== "COMPLETE") continue;   // still working

    const images = await sql<{ id: string; slot: number; kind: string | null; bucket: string | null; path: string | null }[]>`
      SELECT id, slot, kind,
             COALESCE(download_storage_bucket, preview_storage_bucket) AS bucket,
             COALESCE(download_storage_path, preview_storage_path)     AS path
      FROM shoot_images
      WHERE shoot_id = ${r.shoot_id} AND status = 'COMPLETE'
        AND COALESCE(download_storage_path, preview_storage_path) IS NOT NULL
      ORDER BY slot`;

    if (!images.length) {
      await sendText(creds, to,
        "Your photo is finished, but it has passed its 7-day download window and is no longer " +
        "stored.\n\nSend *support* and we'll sort it out.");
      await finish(r.session_id, r.shoot_id);
      failed.push(r.shoot_id);
      continue;
    }

    // A loop shoot: GIF and MP4, wide and upright. Only the GIFs go into the
    // chat — an MP4 is not an image attachment as far as Instagram is
    // concerned, and four files in a row reads as spam. The download link below
    // carries all four.
    const isLoop = images.some(i => (i.kind ?? "").endsWith("-gif"));
    const toSend = isLoop ? images.filter(i => (i.kind ?? "").endsWith("-gif")) : images;

    let sent = 0;
    for (const img of toSend) {
      // Instagram refuses anything over 8MB with a subcode that mentions
      // nothing about size, so send a JPEG cut to fit rather than the 21MB 4K
      // PNG. There is no document fallback the way there is on WhatsApp:
      // Instagram takes image, audio and video attachments only.
      // NEVER re-encode a GIF. instagramReadyCopy flattens to JPEG to get under
      // Instagram's 8MB cap, which for an animation means delivering a single
      // still frame — a failure that looks exactly like a success. GIFs are sent
      // as they are; if one is too large that is a job for the compositor, not
      // for a converter at the door.
      const isGif = /\.gif$/i.test(img.path ?? "");
      const ready = isGif ? null : await instagramReadyCopy(img.id, img.bucket!, img.path!);
      const target = ready ?? { bucket: img.bucket!, path: img.path! };
      const url = await publicUrl(target.bucket, target.path);
      if (!url) continue;
      const res = await sendImage(creds, to, url);
      if (res.ok) sent++;
      else console.error("[ig deliver] send failed:", res.error.slice(0, 200));
    }

    if (sent === 0) {
      // Nothing arrived. Leaving ig_delivered_at NULL means the next run tries
      // again rather than marking a customer served who received nothing.
      console.error(`[ig deliver] delivered 0 of ${toSend.length} to @${r.ig_username ?? to} — will retry`);
      continue;
    }

    // Instagram recompresses images, so what lands is not the 4K file. Say so
    // and point at the full-quality copy rather than letting the buyer assume
    // this is what they paid for.
    // The 4K file cannot pass through a DM at all, so name where it is rather
    // than let the buyer assume the compressed copy is what they paid for.
    const fullSize = await downloadLink(r.shoot_id);

    // A loop is finished work, not a photograph to retouch. The customer has
    // just watched it, which is the only moment they can judge whether they
    // want it public — so that is where the sticker offer goes.
    if (isLoop) {
      await sendWithLinkFallback(creds, to,
        `Here's your GIF ✨\n\n` +
        `You also have it as an MP4, and both upright and wide, here:\n` +
        `${fullSize ?? `${SITE_URL}/studio`}` + gifPublishOffer(),
        `Here's your GIF ✨\n\n` +
        `The MP4 and the upright version are waiting on aluxartandframes.shop ` +
        `under your shoots.` + gifPublishOffer());
      // Left in GIF_PUBLISH rather than DONE, so *post* means something for as
      // long as they take to decide.
      if (r.session_id) {
        await sql`UPDATE instagram_sessions SET state = 'GIF_PUBLISH', updated_at = NOW()
                  WHERE id = ${r.session_id}`;
      }
      await sql`UPDATE shoots SET ig_delivered_at = NOW() WHERE id = ${r.shoot_id}`;
      delivered.push(r.shoot_id);
      continue;
    }
    // The retouch is offered HERE and nowhere else, the same as on WhatsApp:
    // the buyer has just seen the picture, and that is the only moment they can
    // judge whether a hand pass is worth paying for.
    const upsell =
      `\n\nWant it hand-retouched? Skin, stray hairs, and the small things a ` +
      `model notices. *${naira(RETOUCH_PRICE_PER_IMAGE_NGN)} per image* — reply ` +
      `*retouch* and I'll take it from here.`;
    await sendWithLinkFallback(creds, to,
      `That's *${sent === 1 ? "your photo" : `all ${sent}`}* ✨\n\n` +
      `Instagram compresses pictures in chat. Your full-size 4K file is here:\n` +
      `${fullSize ?? `${SITE_URL}/studio`}` + upsell,
      `That's *${sent === 1 ? "your photo" : `all ${sent}`}* ✨\n\n` +
      `Instagram compresses pictures in chat. The full-size 4K file is waiting on ` +
      `aluxartandframes.shop under your shoots.` + upsell);

    // Permission to show their result on our own page. Sent as its own message
    // after the delivery and the retouch offer, so it is a question in its own
    // right rather than a line at the bottom of a longer one.
    //
    // markAsked returns false when this shoot has been asked before, which is
    // what stops a redelivery asking the same person twice about the same
    // photographs.
    try {
      const first = await markAsked(r.shoot_id, r.user_id ?? null, "instagram");
      if (first) await sendText(creds, to, CONSENT_ASK);
    } catch (e) {
      // Never fatal. A delivered shoot with no permission ask is a missed
      // opportunity; a delivery that throws here is a customer with no photos.
      console.warn("[ig deliver] consent ask failed:", (e as Error).message);
    }

    await finish(r.session_id, r.shoot_id);
    delivered.push(r.shoot_id);
  }

  return NextResponse.json({
    ok: true, checked: rows.length,
    started: started.length, delivered: delivered.length,
    failed: failed.length, stranded: stranded.length,
  });
}
