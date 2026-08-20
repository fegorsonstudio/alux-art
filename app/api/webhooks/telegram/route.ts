import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { r2Upload } from "@/lib/r2";
import { tellAdmin } from "@/lib/telegram";
import { deliverRetouch, offerRetouchPayment } from "@/lib/whatsapp-retouch";

/**
 * The return leg of retouching.
 *
 * A buyer asks for a retouch in WhatsApp; the images and the shoot id arrive in
 * the studio owner's Telegram. When the edit is finished they send the file
 * back here — as a REPLY to that job message, or with the shoot id in the
 * caption — and this stores it against the buyer's shoot.
 *
 * What the buyer then receives depends on payment. An unpaid order gets a
 * message saying the work is ready and a Paystack link; the file itself goes out
 * only once payment is confirmed. That is the website's order of events, and a
 * chat has no locked tile to show, so the file is what is held.
 *
 * Two rules, both learned elsewhere in this codebase:
 *
 *   - Only the configured admin chat is obeyed. Anyone can message a Telegram
 *     bot, and this endpoint writes to a buyer's gallery and sends messages as
 *     the business, so an unknown chat is ignored outright.
 *   - Files are taken as DOCUMENTS. A photo sent the ordinary way is
 *     recompressed by Telegram, and the point of the whole exchange is the
 *     quality of the retouch.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type TgFile = { file_id: string; file_name?: string; mime_type?: string };
type TgMessage = {
  message_id?: number;
  chat?: { id?: number | string };
  caption?: string;
  text?: string;
  document?: TgFile;
  photo?: Array<{ file_id: string }>;
  reply_to_message?: { text?: string; caption?: string };
};

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export async function POST(req: NextRequest) {
  // A shared secret in the header, set when the webhook is registered. Telegram
  // echoes it back on every call, and it is the only thing standing between this
  // route and the open internet.
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expected && req.headers.get("x-telegram-bot-api-secret-token") !== expected) {
    console.warn("[tg] bad secret token — ignoring");
    return NextResponse.json({ ok: true });
  }

  const body = await req.json().catch(() => ({})) as { message?: TgMessage };
  const msg = body.message;
  if (!msg) return NextResponse.json({ ok: true });

  const adminChat = (process.env.TELEGRAM_ADMIN_CHAT_ID ?? "").trim();
  if (!adminChat || String(msg.chat?.id ?? "") !== adminChat) {
    return NextResponse.json({ ok: true });   // not the studio — nothing to do
  }

  // Which job. A reply carries the original message with the shoot id in it;
  // otherwise the caption must name one.
  const haystack = `${msg.reply_to_message?.text ?? ""} ${msg.reply_to_message?.caption ?? ""} ${msg.caption ?? ""} ${msg.text ?? ""}`;
  const shootId = haystack.match(UUID)?.[0];

  if (!shootId) {
    if (msg.document || msg.photo) {
      await tellAdmin("I could not tell which shoot that belongs to. Reply to the job message, or put the shoot id in the caption.");
    }
    return NextResponse.json({ ok: true });
  }

  if (!msg.document && !msg.photo) return NextResponse.json({ ok: true });

  // A photo is accepted but flagged: Telegram has already recompressed it.
  const fileId = msg.document?.file_id ?? msg.photo?.[msg.photo.length - 1]?.file_id;
  if (!fileId) return NextResponse.json({ ok: true });
  const wasCompressed = !msg.document;

  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const meta = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`)
      .then(r => r.json());
    const path = meta?.result?.file_path;
    if (!path) { await tellAdmin("Telegram would not give me that file. Try sending it again."); return NextResponse.json({ ok: true }); }

    const bin = await fetch(`https://api.telegram.org/file/bot${token}/${path}`);
    if (!bin.ok) { await tellAdmin("I could not download that file from Telegram."); return NextResponse.json({ ok: true }); }
    const buf = Buffer.from(await bin.arrayBuffer());

    const [shoot] = await sql<{ user_id: string; owner_email: string | null }[]>`
      SELECT user_id, owner_email FROM shoots WHERE id = ${shootId}`;
    if (!shoot) { await tellAdmin(`No shoot ${shootId}.`); return NextResponse.json({ ok: true }); }

    const ext = (msg.document?.file_name?.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const key = `${shoot.user_id}/${shootId}/retouched-${Date.now()}.${ext}`;
    await r2Upload("generated-4k", key, buf, msg.document?.mime_type ?? "image/jpeg");

    const [{ n }] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM shoot_retouched_images WHERE shoot_id = ${shootId}`;

    await sql`
      INSERT INTO shoot_retouched_images (shoot_id, user_id, slot, storage_bucket, storage_path, file_size, created_at)
      VALUES (${shootId}, ${shoot.user_id}, ${n + 1}, 'generated-4k', ${key}, ${buf.byteLength}, NOW())`;
    await sql`
      UPDATE shoot_retouch SET status = 'DELIVERED', delivered_at = NOW(), updated_at = NOW()
      WHERE shoot_id = ${shootId}`;

    // Paid work goes straight out; unpaid work is announced with a payment link
    // and held. Same order as the website: the buyer pays once they know the
    // work is done, and the file is what stays locked until they do.
    const [order] = await sql<{ paid: boolean | null; free: boolean | null; price_ngn: number | null }[]>`
      SELECT paid, free, price_ngn FROM shoot_retouch WHERE shoot_id = ${shootId}`;
    const settled = Boolean(order?.paid || order?.free);

    const handed = settled
      ? await deliverRetouch(shootId, key)
      : await offerRetouchPayment(shootId);

    await tellAdmin(
      `<b>Retouched image saved</b>\n` +
      `Shoot <code>${shootId}</code>\n` +
      (settled
        ? handed
          ? "Already paid — sent to the customer on WhatsApp ✅"
          : "Already paid, but I could not reach them on WhatsApp. It is in their gallery."
        : handed
          ? `Payment link sent (${"₦"}${(order?.price_ngn ?? 0).toLocaleString("en-NG")}). ` +
            "The file goes out the moment they pay."
          : "Saved to their gallery. No WhatsApp chat for this shoot, so nothing was sent.") +
      (wasCompressed ? "\n\n⚠ That came through as a photo, so Telegram compressed it. Send as a <b>file</b> next time." : "")
    );
  } catch (e) {
    console.error("[tg] retouch return failed:", e instanceof Error ? e.message : e);
    await tellAdmin("Something went wrong saving that retouched image. It has not been sent.");
  }

  return NextResponse.json({ ok: true });
}
