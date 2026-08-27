import "server-only";
import sql from "@/lib/db";
import { signedMediaUrl } from "@/lib/media-url";
import { r2SignedDownloadUrl } from "@/lib/r2";
import { SITE_URL } from "@/lib/site-url";
import { sendText, sendDocument, sendImage, type WaCreds } from "@/lib/whatsapp";

/**
 * Paying for a retouch, and receiving it, inside the WhatsApp chat.
 *
 * The order of events matches the website exactly: the buyer pays AFTER the work
 * is done, not before. On the site the retouched tiles are visible but locked
 * until payment; a chat has no locked tile, so the file itself is what is held
 * back. The bot says the work is ready, sends a payment link, and the file goes
 * out only once Paystack confirms.
 *
 * Called from two places that must never be broken by a chat failure — the
 * Telegram webhook that receives the edited file, and the Paystack webhook that
 * confirms payment — so nothing here throws. The worst case is a false return
 * value and a line in the log.
 */

type Session = {
  customer_phone: string;
  phone_number_id: string;
  access_token: string;
};

/** Naira, with separators. */
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

/** WhatsApp fetches file links from its own servers, so they must need no session. */
async function publicUrl(bucket: string, path: string): Promise<string | null> {
  const signed = await signedMediaUrl(bucket, path, { expiresIn: 6 * 3600 }).catch(() => null);
  if (signed) return signed;
  return r2SignedDownloadUrl(bucket, path, 6 * 3600).catch(() => null);
}

/** The chat that ordered this shoot, with the creator's own WhatsApp number. */
async function sessionFor(shootId: string): Promise<Session | null> {
  const [row] = await sql<Session[]>`
    SELECT s.customer_phone,
           c.whatsapp_phone_number_id AS phone_number_id,
           c.whatsapp_access_token    AS access_token
    FROM whatsapp_sessions s
    JOIN creators c ON c.id = s.creator_id
    WHERE s.shoot_id = ${shootId} AND c.whatsapp_access_token IS NOT NULL
    ORDER BY s.updated_at DESC
    LIMIT 1`.catch(() => []);
  return row ?? null;
}

/**
 * Tell the buyer their retouch is ready and give them a way to pay for it.
 *
 * The link is minted by the ordinary retouch payment route through its internal
 * door, so the chat and the website charge the same amount by the same code and
 * cannot drift apart.
 */
export async function offerRetouchPayment(shootId: string): Promise<boolean> {
  try {
    const session = await sessionFor(shootId);
    if (!session) return false;

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

    const creds: WaCreds = {
      phoneNumberId: session.phone_number_id,
      token: session.access_token,
    };

    // Comped or already settled — there is nothing to charge for.
    if (body?.alreadyUnlocked) return deliverRetouch(shootId);

    if (!res.ok || !body?.authorizationUrl) {
      console.error(`[wa retouch] could not start payment for ${shootId}:`, body?.error ?? res.status);
      await sendText(creds, session.customer_phone,
        "Your retouched photos are ready. I could not open the payment page just now — " +
        "reply *retouch* in a moment and I'll try again.");
      return false;
    }

    const n = order.image_count ?? 1;
    await sendText(creds, session.customer_phone,
      `Your retouched photo${n === 1 ? " is" : "s are"} ready ✨\n\n` +
      `${naira(order.price_ngn ?? 0)} for ${n} image${n === 1 ? "" : "s"}. ` +
      `Pay here and I'll send ${n === 1 ? "it" : "them"} straight away:\n${body.authorizationUrl}`);
    return true;
  } catch (e) {
    console.error("[wa retouch] offer failed:", e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * Send the retouched files into the chat.
 *
 * Documents, not images: WhatsApp recompresses anything sent as a photo, and a
 * squeezed copy of a hand-retouched picture is the one thing this service must
 * not deliver. sendImage is kept only as a fallback for the case where the
 * document send is refused outright, because a compressed photo still beats
 * silence after someone has paid.
 *
 * `onlyPath` limits the send to a single file, for the case where the studio
 * adds another edit to an order that was already paid for and delivered.
 */
export async function deliverRetouch(shootId: string, onlyPath?: string): Promise<boolean> {
  try {
    const session = await sessionFor(shootId);
    if (!session) return false;

    const files = await sql<{ bucket: string | null; path: string; slot: number | null }[]>`
      SELECT storage_bucket AS bucket, storage_path AS path, slot
      FROM shoot_retouched_images
      WHERE shoot_id = ${shootId} ${onlyPath ? sql`AND storage_path = ${onlyPath}` : sql``}
      ORDER BY slot`;
    if (!files.length) return false;

    const creds: WaCreds = {
      phoneNumberId: session.phone_number_id,
      token: session.access_token,
    };

    let sent = 0;
    for (const f of files) {
      const url = await publicUrl(f.bucket ?? "generated-4k", f.path);
      if (!url) continue;
      const ext = f.path.split(".").pop()?.toLowerCase() ?? "jpg";
      const name = `alux-art-retouched-${f.slot ?? sent + 1}.${ext}`;
      let res = await sendDocument(creds, session.customer_phone, url, name);
      if (!res.ok) res = await sendImage(creds, session.customer_phone, url);
      if (res.ok) sent++;
    }

    if (!sent) return false;

    // WhatsApp takes documents, so the file itself arrives uncompressed — but
    // the link goes too, because a document in a chat is easy to lose and a
    // link can be opened again later on a laptop.
    const link = await retouchDownloadLink(shootId, onlyPath);
    await sendText(creds, session.customer_phone,
      `That's your retouched photo${sent === 1 ? "" : "s"} — thank you for choosing Alux Art 🎉` +
      (link ? `\n\nFull quality, any time:\n${link}` : ""));
    return true;
  } catch (e) {
    console.error("[wa retouch] delivery failed:", e instanceof Error ? e.message : e);
    return false;
  }
}
