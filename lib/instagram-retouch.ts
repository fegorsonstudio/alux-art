import "server-only";
import sql from "@/lib/db";
import { signedMediaUrl } from "@/lib/media-url";
import { r2SignedDownloadUrl } from "@/lib/r2";
import { SITE_URL } from "@/lib/site-url";
import { sendText, sendImage, windowOpen, credsForAccount, sendTextWithButtons, type IgCreds } from "@/lib/instagram";
import { tellAdmin } from "@/lib/telegram";
import { sendWithLinkFallback } from "@/lib/instagram-bot";

/**
 * Paying for a retouch, and receiving it, inside an Instagram chat.
 *
 * Sibling of lib/whatsapp-retouch.ts and deliberately a separate file: the two
 * platforms agree on the order of events but disagree about almost everything
 * else, and folding them together would put an `if instagram` in every branch
 * of a module that currently takes money.
 *
 * ONE DIFFERENCE MATTERS MORE THAN ALL THE OTHERS. Instagram closes a
 * conversation 24 hours after the customer's last message. A retouch is done by
 * hand and comes back hours or days later, so by the time there is something to
 * say the window is very often shut — and a shut window is not a failure to
 * retry, it is a permanent refusal. Every send here therefore checks the window
 * first and, when it is closed, hands the job to a human on Telegram with a
 * login-free link rather than dropping it. That escalation is the feature, not
 * an error path.
 *
 * Called from the Telegram and Paystack webhooks, which must never break
 * because a chat failed, so nothing here throws.
 */

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

/**
 * A login-free link to the full-quality retouched file.
 *
 * Minted here, at delivery: payment has already cleared by the time this runs,
 * and the routes behind /d/ refuse a retouched token whose order is unpaid
 * anyway. Kept once minted, so sending the same link twice works.
 *
 * This exists because a chat compresses pictures. Without it the customer paid
 * extra for a hand retouch and received a squeezed copy of it, which is the one
 * thing this service must not do.
 */
async function retouchDownloadLink(shootId: string, path?: string): Promise<string | null> {
  const [img] = await sql<{ id: string; token: string | null }[]>`
    SELECT id, download_token AS token FROM shoot_retouched_images
    WHERE shoot_id = ${shootId} ${path ? sql`AND storage_path = ${path}` : sql``}
    ORDER BY slot LIMIT 1`.catch(() => []);
  if (!img) return null;

  let token = img.token;
  if (!token) {
    token = crypto.randomUUID().replace(/-/g, "");
    await sql`UPDATE shoot_retouched_images SET download_token = ${token} WHERE id = ${img.id}`
      .catch(() => { token = null; });
  }
  return token ? `${SITE_URL}/d/${token}` : null;
}

type Chat = {
  ig_user_id: string;
  ig_account_id: string;
  ig_username: string | null;
  last_inbound_at: Date | null;
  creds: IgCreds;
};

/** A URL Instagram's own servers can fetch — no session, no cookies. */
async function publicUrl(bucket: string, path: string): Promise<string | null> {
  const signed = await signedMediaUrl(bucket, path, { expiresIn: 6 * 3600 }).catch(() => null);
  if (signed) return signed;
  return r2SignedDownloadUrl(bucket, path, 6 * 3600).catch(() => null);
}

/**
 * The Instagram chat that ordered this shoot.
 *
 * Keyed off the SHOOT's own ig_user_id, not off a session lookup by shoot: a
 * session holds one shoot_id at a time and is reused for the next booking, so
 * asking it "which shoot are you about" gets the wrong answer for anything but
 * the most recent one. The shoot remembers who ordered it for ever.
 */
async function chatFor(shootId: string): Promise<Chat | null> {
  const [row] = await sql<{
    ig_user_id: string | null; ig_account_id: string | null;
    ig_username: string | null; last_inbound_at: Date | null;
  }[]>`
    SELECT sh.ig_user_id, sh.ig_account_id, s.ig_username, s.last_inbound_at
    FROM shoots sh
    LEFT JOIN instagram_sessions s
      ON s.ig_user_id = sh.ig_user_id AND s.ig_account_id = sh.ig_account_id
    WHERE sh.id = ${shootId} AND sh.ig_user_id IS NOT NULL
    LIMIT 1`.catch(() => []);

  if (!row?.ig_user_id || !row.ig_account_id) return null;
  const creds = credsForAccount(row.ig_account_id);
  if (!creds) return null;
  return {
    ig_user_id: row.ig_user_id,
    ig_account_id: row.ig_account_id,
    ig_username: row.ig_username,
    last_inbound_at: row.last_inbound_at,
    creds,
  };
}

/** Is this an Instagram shoot at all? Cheap enough to ask before anything else. */
export async function isInstagramShoot(shootId: string): Promise<boolean> {
  const [row] = await sql<{ n: number }[]>`
    SELECT 1 AS n FROM shoots WHERE id = ${shootId} AND ig_user_id IS NOT NULL`.catch(() => []);
  return !!row;
}

/** Hand the job to a person, with everything they need to finish it themselves. */
async function escalate(chat: Chat, shootId: string, what: string, link?: string | null) {
  const hours = chat.last_inbound_at
    ? Math.round((Date.now() - new Date(chat.last_inbound_at).getTime()) / 3_600_000)
    : 999;
  await tellAdmin(
    `⚠️ Instagram retouch — the 24h window is closed, so ${what} could not be sent.\n\n` +
    `Customer: @${chat.ig_username ?? chat.ig_user_id}\n` +
    `Shoot: <code>${shootId.slice(0, 8)}</code>\n` +
    `Last heard from them ${hours}h ago.` +
    (link ? `\n\nSend them this — it needs no login:\n${link}` : "")
  ).catch(() => {});
}

/**
 * Tell the buyer their retouch is ready and give them a way to pay for it.
 *
 * The link comes from the ordinary retouch payment route through its internal
 * door, so the chat and the website charge the same amount by the same code.
 */
export async function offerRetouchPayment(shootId: string): Promise<boolean> {
  try {
    const chat = await chatFor(shootId);
    if (!chat) return false;

    const [order] = await sql<{ price_ngn: number | null; image_count: number | null }[]>`
      SELECT price_ngn, image_count FROM shoot_retouch WHERE shoot_id = ${shootId}`;
    if (!order) return false;

    const [shoot] = await sql<{ user_id: string }[]>`
      SELECT user_id FROM shoots WHERE id = ${shootId}`;
    if (!shoot) return false;

    const res = await fetch(`${SITE_URL}/api/shoots/${shootId}/retouched/pay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
        "x-act-as-user": shoot.user_id,
      },
    });
    const body = await res.json().catch(() => ({}));

    // Comped or already settled — there is nothing to charge for.
    if (body?.alreadyUnlocked) return deliverRetouch(shootId);

    if (!res.ok || !body?.authorizationUrl) {
      console.error(`[ig retouch] could not start payment for ${shootId}:`, body?.error ?? res.status);
      await escalate(chat, shootId, "the payment link");
      return false;
    }

    // Checked BEFORE sending: an attempt outside the window is refused by
    // Instagram, and a refusal here means the customer is owed a reply that
    // will never arrive unless somebody is told.
    if (!windowOpen(chat.last_inbound_at)) {
      await escalate(chat, shootId, "the payment link", body.authorizationUrl);
      return false;
    }

    const n = order.image_count ?? 1;
    // The link arrives as a "Pay now" button; a refused button falls back to
    // this same text, and a refusal of both still escalates below.
    const sent = await sendTextWithButtons(chat.creds, chat.ig_user_id,
      `Your retouched photo${n === 1 ? " is" : "s are"} ready ✨\n\n` +
      `${naira(order.price_ngn ?? 0)} for ${n} image${n === 1 ? "" : "s"}. ` +
      `Pay here and I'll send ${n === 1 ? "it" : "them"} straight away:\n${body.authorizationUrl}`);

    if (!sent.ok) {
      // Most often a link restriction on the account rather than the window.
      await escalate(chat, shootId, "the payment link", body.authorizationUrl);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[ig retouch] offer failed:", e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * Send the retouched files into the chat.
 *
 * Instagram takes image attachments only — there is no document type the way
 * there is on WhatsApp — and it recompresses what it accepts. So the picture
 * goes into the chat for the look of it and a login-free link goes with it for
 * the file they actually paid for.
 *
 * `onlyPath` limits the send to one file, for when the studio adds another edit
 * to an order that was already paid for and delivered.
 */
export async function deliverRetouch(shootId: string, onlyPath?: string): Promise<boolean> {
  try {
    const chat = await chatFor(shootId);
    if (!chat) return false;

    const files = await sql<{ bucket: string | null; path: string; slot: number | null }[]>`
      SELECT storage_bucket AS bucket, storage_path AS path, slot
      FROM shoot_retouched_images
      WHERE shoot_id = ${shootId} ${onlyPath ? sql`AND storage_path = ${onlyPath}` : sql``}
      ORDER BY slot`;
    if (!files.length) return false;

    if (!windowOpen(chat.last_inbound_at)) {
      const first = await publicUrl(files[0].bucket ?? "generated-4k", files[0].path);
      await escalate(chat, shootId, "the retouched files", first);
      return false;
    }

    let sent = 0;
    for (const f of files) {
      const url = await publicUrl(f.bucket ?? "generated-4k", f.path);
      if (!url) continue;
      const res = await sendImage(chat.creds, chat.ig_user_id, url);
      if (res.ok) sent++;
      else console.error("[ig retouch] send failed:", res.error.slice(0, 200));
    }

    if (!sent) {
      const first = await publicUrl(files[0].bucket ?? "generated-4k", files[0].path);
      await escalate(chat, shootId, "the retouched files", first);
      return false;
    }

    // The chat copy is the preview; the link is the thing they paid for.
    const link = await retouchDownloadLink(shootId, onlyPath);
    await sendWithLinkFallback(chat.creds, chat.ig_user_id,
      `That's your retouched photo${sent === 1 ? "" : "s"} — thank you for choosing Alux Art 🎉\n\n` +
      `Instagram compresses pictures in chat. Full quality here:\n${link ?? `${SITE_URL}/studio`}`,
      `That's your retouched photo${sent === 1 ? "" : "s"} — thank you for choosing Alux Art 🎉\n\n` +
      `Instagram compresses pictures in chat. The full-quality file is on ` +
      `aluxartandframes.shop under your shoots.`);
    return true;
  } catch (e) {
    console.error("[ig retouch] delivery failed:", e instanceof Error ? e.message : e);
    return false;
  }
}
