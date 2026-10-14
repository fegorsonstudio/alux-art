import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { signedMediaUrl } from "@/lib/media-url";
import { r2SignedDownloadUrl } from "@/lib/r2";
import { sendText, sendImage, sendDocument, type WaCreds } from "@/lib/whatsapp";
import { shootDownloadLink } from "@/lib/download-link";
import { RETOUCH_PRICE_PER_IMAGE_NGN } from "@/lib/retouch-pricing";
import { needsContactEmail, CONTACT_EMAIL_ASK } from "@/lib/chat-contact-email";

/** Naira, with separators. */
const naira = (n: number) => `\u20a6${n.toLocaleString("en-NG")}`;

/**
 * Sends finished shoots back into the WhatsApp chat that ordered them.
 *
 * Deliberately a poller rather than a hook inside the generation pipeline.
 * Generation is the most load-bearing code in the app and a chat delivery
 * failing there must never be able to affect a shoot, so nothing about
 * lib/generate.ts is touched. This also means delivery survives a restart
 * mid-shoot and retries by itself, which a fire-and-forget call at completion
 * would not.
 *
 * Three transitions are handled, all driven off the shoot's own status so the
 * chat can never claim something the database does not agree with:
 *
 *   payment landed   AWAITING_PAYMENT -> GENERATING   "making your photos now"
 *   shoot finished   -> DONE                          the images themselves
 *   shoot failed     -> DONE                          an apology, not silence
 *
 * shoots.wa_delivered_at is the idempotency guard: it is set only after the
 * images are actually sent, so a crash halfway re-sends rather than silently
 * dropping a paid customer's shoot.
 *
 * It lives on the SHOOT deliberately. It used to live on the session, and a
 * session outlives any one booking — a customer who had already received one
 * shoot and started a second with a trigger word carried the old stamp forward
 * and became permanently invisible to this query. A new shoot row starts NULL,
 * so every path that attaches a booking to an existing chat is correct with
 * nothing to remember.
 *
 *   GET /api/whatsapp/deliver   (x-internal-secret, from cron)
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Row = {
  session_id: string;
  customer_phone: string;
  user_id: string | null;
  state: string;
  shoot_id: string;
  shoot_status: string;
  phone_number_id: string;
  access_token: string;
};

/** WhatsApp fetches image links from its own servers, so they must be public. */
async function publicUrl(bucket: string, path: string): Promise<string | null> {
  const signed = await signedMediaUrl(bucket, path, { expiresIn: 6 * 3600 }).catch(() => null);
  if (signed) return signed;
  return r2SignedDownloadUrl(bucket, path, 6 * 3600).catch(() => null);
}

export async function GET(req: NextRequest) {
  if (!process.env.INTERNAL_API_SECRET ||
      req.headers.get("x-internal-secret") !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await sql<Row[]>`
    SELECT s.id AS session_id, s.customer_phone, s.state, s.shoot_id, s.user_id,
           sh.status AS shoot_status,
           c.whatsapp_phone_number_id AS phone_number_id,
           c.whatsapp_access_token AS access_token
    FROM whatsapp_sessions s
    JOIN shoots sh ON sh.id = s.shoot_id
    JOIN creators c ON c.id = s.creator_id
    WHERE s.shoot_id IS NOT NULL
      AND sh.wa_delivered_at IS NULL
      AND c.whatsapp_access_token IS NOT NULL
      AND s.state IN ('AWAITING_PAYMENT', 'GENERATING')
    ORDER BY s.updated_at ASC
    LIMIT 25`;

  const started: string[] = [], delivered: string[] = [], failed: string[] = [];

  for (const r of rows) {
    const creds: WaCreds = { phoneNumberId: r.phone_number_id, token: r.access_token };

    // Payment landed and generation began.
    if (r.state === "AWAITING_PAYMENT") {
      if (["QUEUED", "PROCESSING", "BASE_LOCKING", "COMPLETE"].includes(r.shoot_status)) {
        await sql`UPDATE whatsapp_sessions SET state = 'GENERATING', updated_at = NOW() WHERE id = ${r.session_id}`;
        await sendText(creds, r.customer_phone,
          "Payment received, thank you ✅\n\nI'm making your photos now — usually a few minutes. " +
          "I'll send them here the moment they're ready.");
        // Asked at the moment money is actually at stake, and only once. A
        // synthetic wa-<phone>@ address reaches nobody, so without this a failed
        // shoot can only be resolved if the customer happens to come back.
        if (await needsContactEmail(r.user_id)) {
          await sendText(creds, r.customer_phone, CONTACT_EMAIL_ASK);
        }
        started.push(r.session_id);
      }
      continue;   // nothing to deliver yet
    }

    if (r.shoot_status === "FAILED") {
      await sendText(creds, r.customer_phone,
        "I'm sorry — your shoot didn't come out and no photos were produced.\n\n" +
        "You have not lost your money. Reply *help* and a person will sort this out for you today.");
      await sql`UPDATE whatsapp_sessions SET state = 'DONE', delivered_at = NOW(), updated_at = NOW() WHERE id = ${r.session_id}`;
      await sql`UPDATE shoots SET wa_delivered_at = NOW() WHERE id = ${r.shoot_id}`;
      failed.push(r.session_id);
      continue;
    }

    if (r.shoot_status !== "COMPLETE") continue;   // still working

    const images = await sql<{ slot: number; bucket: string | null; path: string | null }[]>`
      SELECT slot,
             COALESCE(download_storage_bucket, preview_storage_bucket) AS bucket,
             COALESCE(download_storage_path, preview_storage_path)     AS path
      FROM shoot_images
      WHERE shoot_id = ${r.shoot_id} AND status = 'COMPLETE'
        AND COALESCE(download_storage_path, preview_storage_path) IS NOT NULL
      ORDER BY slot`;

    if (!images.length) {
      // COMPLETE with nothing stored: the retention sweep has already removed
      // them. Say so plainly rather than sending an empty delivery.
      await sendText(creds, r.customer_phone,
        "Your shoot is finished, but the photos have passed their 7-day download window " +
        "and are no longer stored.\n\nReply *help* and we'll sort it out.");
      await sql`UPDATE whatsapp_sessions SET state = 'DONE', delivered_at = NOW(), updated_at = NOW() WHERE id = ${r.session_id}`;
      await sql`UPDATE shoots SET wa_delivered_at = NOW() WHERE id = ${r.shoot_id}`;
      failed.push(r.session_id);
      continue;
    }

    await sendText(creds, r.customer_phone, `Your photos are ready ✨ Sending ${images.length} now…`);

    let sent = 0;
    for (const img of images) {
      const url = await publicUrl(img.bucket!, img.path!);
      if (!url) continue;
      // As a DOCUMENT, not an image: WhatsApp recompresses images, so a 4K
      // relight would land as a phone-sized JPEG — the exact quality the buyer
      // paid to avoid. Documents arrive byte for byte.
      const filename = `alux-art-${String(img.slot).padStart(2, "0")}.jpg`;
      let res = await sendDocument(creds, r.customer_phone, url, filename);
      if (!res.ok) {
        // Fall back rather than deliver nothing. A compressed photo is a poor
        // outcome; silence after payment is a worse one.
        console.warn(`[wa deliver] document ${img.slot} failed, retrying as image:`, res.error);
        res = await sendImage(creds, r.customer_phone, url);
      }
      if (res.ok) sent++;
      else console.error(`[wa deliver] image ${img.slot} failed:`, res.error);
    }

    if (sent === 0) {
      // Every image refused. Leave delivered_at unset so the next run retries
      // rather than marking a customer served when they got nothing.
      console.error("[wa deliver] no images sent for session", r.session_id);
      continue;
    }

    // Thank them, then offer the retouch. Asked HERE and nowhere else: the
    // buyer has just seen the images, which is the only moment they can judge
    // whether a hand pass is worth paying for.
    // The same files on a page, for anyone who would rather save them from a
    // browser or reach them from another device. Never fatal: the documents above
    // are the delivery, the link is a convenience.
    const page = await shootDownloadLink(r.shoot_id).catch(() => null);
    await sendText(creds, r.customer_phone,
      "That's everything — thank you for choosing Alux Art 🎉\n\n" +
      "Save them to your phone now — they're kept for 7 days, then removed." +
      (page ? `\n\nYou can also download them in full quality here: ${page}` : "") + "\n\n" +
      `Want them hand-retouched? Skin, stray hairs, and the small things a model notices. ` +
      `*${naira(RETOUCH_PRICE_PER_IMAGE_NGN)} per image* — reply *retouch* and I'll take it from here.\n\n` +
      "Or send *restart* for another look with the same photos.");

    await sql`
      UPDATE whatsapp_sessions SET state = 'DONE', delivered_at = NOW(), updated_at = NOW()
      WHERE id = ${r.session_id}`;
    // The shoot is what the poller gates on. A session is long-lived and
    // outlives any one booking, which is exactly how a paid customer's second
    // shoot became invisible here and was never delivered.
    await sql`UPDATE shoots SET wa_delivered_at = NOW() WHERE id = ${r.shoot_id}`;
    delivered.push(`${r.session_id} (${sent}/${images.length})`);
  }

  return NextResponse.json({
    ok: true, considered: rows.length,
    startedGenerating: started.length, delivered, failed: failed.length,
  });
}
