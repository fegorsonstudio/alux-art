import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import sql from "@/lib/db";
import { sendText, sendButtons, type WaCreds } from "@/lib/whatsapp";
import { initializePaystackPayment, verifyPaystackPayment } from "@/lib/paystack";
import { tellAdmin } from "@/lib/telegram";
import { SITE_URL } from "@/lib/site-url";

/**
 * Fegorson Studio licence sales, on the same WhatsApp number as the photo bot.
 *
 * Fegorson Studio is the owner's offline Windows retouching app. Its "Buy on
 * WhatsApp" button opens this chat with "Hello, I would like to buy a Fegorson
 * Studio licence code." The bot asks for the name to print on the licence,
 * confirms it, sends a Paystack link, and — only once Paystack confirms the
 * payment — signs a code and sends it.
 *
 * Rules that are not obvious:
 *
 *   - A code is made in exactly one place, fulfilLicencePayment(), and only for a
 *     payment Paystack has confirmed (the signed webhook, or Paystack's own verify
 *     API when the buyer replies PAID) at the order's price in NGN. Once per
 *     reference: the UPDATE that stores it requires code IS NULL.
 *   - Codes cannot be switched off, so a lost code is resent, never remade.
 *   - The private key is read from disk when a code is made and is never logged,
 *     stored or sent. The code itself is not secret; it is the buyer's licence.
 *   - Only the number named in FEGORSON_SHOP_CREATOR_ID sells licences. Unset
 *     means the shop is off and every message goes to the photo bot as before.
 */

export const LICENCE_PRICE_NGN = 20_000;

const KEY_PATH = process.env.FEGORSON_SHOP_KEY_PATH || "/etc/fegorson-shop/fegorson-shop-private-key.pem";

/** A name question nobody answered within this long is forgotten. */
const ASKING_TTL_MIN = 120;
/** How long PAID / LINK replies still find a payment link. */
const PAYING_TTL_MIN = 60 * 48;
/** Payment links one number may open in a day. */
const MAX_LINKS_PER_DAY = 5;

type Order = {
  id: string;
  phone: string;
  creator_id: string | null;
  buyer_name: string | null;
  state: string;
  price_ngn: number;
  reference: string | null;
  pay_url: string | null;
  code: string | null;
};

// ── The code (must match the app byte for byte) ──────────────────────────────

const b64u = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/**
 * The owner's reference signer, unchanged: FGS1-<base64url(JSON)>.<base64url(sig)>
 * over exactly the JSON bytes, keys n, i, k.
 */
export function makeLicenceCode(buyerName: string): { code: string; k: string } {
  const name = String(buyerName).replace(/[\r\n]+/g, " ").trim().slice(0, 80);
  if (!name) throw new Error("empty name");
  const key = crypto.createPrivateKey(fs.readFileSync(KEY_PATH));
  const payload = { n: name, i: new Date().toISOString().slice(0, 10), k: crypto.randomBytes(5).toString("hex") };
  const data = Buffer.from(JSON.stringify(payload), "utf8");
  return { code: "FGS1-" + b64u(data) + "." + b64u(crypto.sign(null, data, key)), k: payload.k };
}

// ── The conversation ─────────────────────────────────────────────────────────

const naira = (n: number) => "₦" + n.toLocaleString("en-NG");
const CANCEL = /^(cancel|stop buying|no thanks)$/i;
const LEAVE = /^(restart|start over|reset|menu|styles)$/i;
const YES = /^(yes|y|yeah|yep|ok|okay|confirm|correct)\.?$/i;
const CHANGE = /^(no|change|change name|edit|wrong)\.?$/i;
const PAID = /^(paid|i have paid|i('| ha)ve paid|i paid|done|payment done|i've made (the )?payment)\.?!?$/i;
const LINK = /^(link|pay|payment link|send (the )?link)\.?$/i;
const NOT_A_NAME = /^(hi|hello|hey|yes|no|ok|okay|cancel|menu|help|licen[cs]e|code|buy|new|paid|link)$/i;

function shopIsOn(creatorId: string): boolean {
  return !!process.env.FEGORSON_SHOP_CREATOR_ID && process.env.FEGORSON_SHOP_CREATOR_ID === creatorId;
}

/** Tidy a name and say whether it can go on a licence. */
function cleanName(raw: string): string | null {
  const name = raw.replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 80) return null;
  if (!/^[\p{L}\p{M}\p{N} .,'’&()\-]+$/u.test(name)) return null;
  if (!/\p{L}/u.test(name)) return null;
  if (NOT_A_NAME.test(name)) return null;
  return name;
}

/**
 * Answers the message if it belongs to a licence sale, and says so. False means
 * "not ours" and the photo bot carries on exactly as it would have.
 */
export async function handleLicenceMessage(
  creds: WaCreds, creatorId: string, phone: string, text: string, choiceId: string | null,
): Promise<boolean> {
  if (!shopIsOn(creatorId)) return false;
  // This runs in front of every message on the shop's number. Whatever goes
  // wrong here must leave the photo bot answering as it always has.
  try {
    return await routeLicenceMessage(creds, creatorId, phone, text, choiceId);
  } catch (e) {
    console.error("[licence] message handling failed:", e instanceof Error ? e.message : e);
    return false;
  }
}

async function routeLicenceMessage(
  creds: WaCreds, creatorId: string, phone: string, text: string, choiceId: string | null,
): Promise<boolean> {
  const t = text.trim();
  const ours = !!choiceId && choiceId.startsWith("fgs_");
  const mentions = /licen[cs]e|fegorson/i.test(t);
  const open = await openOrder(phone);
  const wantsNew = choiceId === "fgs_new" || /^new( licen[cs]e)?$/i.test(t);

  if (!open && !mentions && !ours && !(wantsNew && await hasCode(phone))) return false;

  // Leaving for the photo menu drops the licence question quietly.
  if (open && LEAVE.test(t)) {
    await setState(open.id, "CANCELLED");
    return false;
  }
  if (open && (CANCEL.test(t) || choiceId === "fgs_cancel")) {
    await setState(open.id, "CANCELLED");
    await sendText(creds, phone, "No problem, cancelled. Message us any time to buy a Fegorson Studio licence.");
    return true;
  }

  if (wantsNew) return startOrder(creds, creatorId, phone);

  if (open?.state === "ASKING_NAME") {
    if (mentions || !t) return askName(creds, phone, !t);
    return takeName(creds, open, t);
  }

  if (open?.state === "CONFIRMING_NAME") {
    if (choiceId === "fgs_yes" || YES.test(t)) return sendPaymentLink(creds, open);
    if (choiceId === "fgs_change" || CHANGE.test(t)) {
      await setState(open.id, "ASKING_NAME");
      return askName(creds, phone, false);
    }
    if (mentions || !t) return confirmName(creds, phone, open.buyer_name ?? "");
    return takeName(creds, open, t);
  }

  if (open?.state === "AWAITING_PAYMENT") {
    if (PAID.test(t) || choiceId === "fgs_paid") return checkPaid(creds, open);
    if (LINK.test(t) || mentions) return resendLink(creds, open);
    // Anything else is a new conversation, most likely about photos.
    return false;
  }

  // No open order: a licence mention. A buyer who already has a code gets it
  // again — a lost code is resent, never remade — and can still buy another.
  if (await hasCode(phone)) return resendCodes(creds, phone);
  return startOrder(creds, creatorId, phone);
}

async function openOrder(phone: string): Promise<Order | null> {
  const [o] = await sql<Order[]>`
    SELECT id, phone, creator_id, buyer_name, state, price_ngn, reference, pay_url, code
    FROM licence_orders
    WHERE phone = ${phone}
      AND (
        (state IN ('ASKING_NAME', 'CONFIRMING_NAME') AND updated_at > now() - make_interval(mins => ${ASKING_TTL_MIN}))
        OR (state = 'AWAITING_PAYMENT' AND updated_at > now() - make_interval(mins => ${PAYING_TTL_MIN}))
      )
    ORDER BY created_at DESC LIMIT 1`;
  return o ?? null;
}

async function hasCode(phone: string): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM licence_orders WHERE phone = ${phone} AND code IS NOT NULL LIMIT 1`;
  return rows.length > 0;
}

async function setState(id: string, state: string): Promise<void> {
  await sql`UPDATE licence_orders SET state = ${state}, updated_at = now() WHERE id = ${id}`;
}

async function startOrder(creds: WaCreds, creatorId: string, phone: string): Promise<boolean> {
  await sql`
    UPDATE licence_orders SET state = 'CANCELLED', updated_at = now()
    WHERE phone = ${phone} AND state IN ('ASKING_NAME', 'CONFIRMING_NAME', 'AWAITING_PAYMENT')`;
  try {
    await sql`
      INSERT INTO licence_orders (phone, creator_id, state, price_ngn)
      VALUES (${phone}, ${creatorId}, 'ASKING_NAME', ${LICENCE_PRICE_NGN})`;
  } catch {
    // Two messages at once: the other one opened the order. Ask once either way.
  }
  await sendText(creds, phone,
    "Hi 👋 Thanks for choosing *Fegorson Studio*.\n\n" +
    `A licence is *${naira(LICENCE_PRICE_NGN)}*, paid once. It's yours for life.\n\n` +
    "What name should your licence show? Type it exactly as you want it to appear in the app " +
    "(for example: *Ada Okafor* or *Ada Photography*).");
  return true;
}

async function askName(creds: WaCreds, phone: string, notText: boolean): Promise<boolean> {
  await sendText(creds, phone, notText
    ? "Please type the name you want on your licence (for example: *Ada Okafor*)."
    : "What name should your licence show? Type it exactly as you want it to appear in the app.");
  return true;
}

async function takeName(creds: WaCreds, order: Order, raw: string): Promise<boolean> {
  const name = cleanName(raw);
  if (!name) {
    await sendText(creds, order.phone,
      "Please send just the name for the licence: 2 to 80 characters, using letters, numbers, " +
      "spaces and . , ' & - ( ) only. For example: *Ada Okafor*.");
    return true;
  }
  await sql`
    UPDATE licence_orders SET buyer_name = ${name}, state = 'CONFIRMING_NAME', updated_at = now()
    WHERE id = ${order.id}`;
  return confirmName(creds, order.phone, name);
}

async function confirmName(creds: WaCreds, phone: string, name: string): Promise<boolean> {
  const body = `Your licence will read:\n\n*${name}*\n\nReply *YES* to continue, or type a different name.`;
  const sent = await sendButtons(creds, phone, {
    body,
    buttons: [{ id: "fgs_yes", title: "YES" }, { id: "fgs_change", title: "Change name" }],
  });
  if (!sent.ok) await sendText(creds, phone, body);
  return true;
}

async function sendPaymentLink(creds: WaCreds, order: Order): Promise<boolean> {
  if (!order.buyer_name) return askName(creds, order.phone, false);
  if (order.reference && order.pay_url) return resendLink(creds, order);

  const [{ n }] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM licence_orders
    WHERE phone = ${order.phone} AND reference IS NOT NULL AND created_at > now() - interval '24 hours'`;
  if (n >= MAX_LINKS_PER_DAY) {
    await sendText(creds, order.phone,
      "You've started several payments today. Please use one of the payment links above, " +
      "or message us again tomorrow.");
    return true;
  }

  let link: { reference: string; authorizationUrl: string };
  try {
    link = await initializePaystackPayment({
      email: `wa-${order.phone}@whatsapp.aluxartandframes.shop`,
      amountNgn: order.price_ngn,
      currency: "NGN",
      metadata: {
        type: "fegorson_licence",
        order_id: order.id,
        phone: order.phone,
        custom_fields: [
          { display_name: "Product", variable_name: "product", value: "Fegorson Studio licence" },
          { display_name: "Licence name", variable_name: "licence_name", value: order.buyer_name },
          { display_name: "WhatsApp", variable_name: "whatsapp", value: "+" + order.phone },
        ],
      },
      callbackUrl: await backToChat(creds),
    });
  } catch (e) {
    console.error("[licence] payment link failed:", e instanceof Error ? e.message : e);
    await sendText(creds, order.phone, "Sorry, the payment link could not be made just now. Please reply *YES* again in a minute.");
    void tellAdmin(`⚠️ Fegorson licence: a Paystack payment link failed for +${order.phone}. They were asked to try again.`);
    return true;
  }

  await sql`
    UPDATE licence_orders
    SET reference = ${link.reference}, pay_url = ${link.authorizationUrl}, state = 'AWAITING_PAYMENT', updated_at = now()
    WHERE id = ${order.id}`;
  return resendLink(creds, { ...order, reference: link.reference, pay_url: link.authorizationUrl });
}

async function resendLink(creds: WaCreds, order: Order): Promise<boolean> {
  await sendText(creds, order.phone,
    `Here is your secure payment link for *${naira(order.price_ngn)}* ` +
    "(card, bank transfer or USSD, through Paystack):\n\n" +
    `${order.pay_url}\n\n` +
    `Your licence code for *${order.buyer_name}* comes to this chat as soon as the payment is confirmed. ` +
    "Already paid? Reply *PAID*.");
  return true;
}

/** The buyer says they paid. Ask Paystack directly; never take their word for it. */
async function checkPaid(creds: WaCreds, order: Order): Promise<boolean> {
  if (order.reference) {
    try {
      const v = await verifyPaystackPayment(order.reference);
      if (v.status && v.data?.status === "success") {
        await fulfilLicencePayment({
          reference: order.reference, amountKobo: Number(v.data.amount), currency: v.data.currency, via: "verify",
        });
        // The code goes out from fulfilLicencePayment. If it was held back (an
        // amount that does not match), the owner has been told; tell the buyer too.
        const [after] = await sql<{ code: string | null }[]>`SELECT code FROM licence_orders WHERE id = ${order.id}`;
        if (!after?.code) {
          await sendText(creds, order.phone,
            "Thank you, we can see your payment. The studio is checking it and will send your code here shortly.");
        }
        return true;
      }
    } catch (e) {
      console.warn("[licence] verify on PAID failed:", e instanceof Error ? e.message : e);
    }
  }
  await sendText(creds, order.phone,
    "Paystack hasn't confirmed this payment yet. A bank transfer can take a few minutes; " +
    "your code will arrive here by itself as soon as it's confirmed. Reply *LINK* if you need the payment link again.");
  return true;
}

async function resendCodes(creds: WaCreds, phone: string): Promise<boolean> {
  const rows = await sql<{ buyer_name: string; code: string }[]>`
    SELECT buyer_name, code FROM licence_orders
    WHERE phone = ${phone} AND code IS NOT NULL ORDER BY paid_at DESC LIMIT 5`;
  await sendText(creds, phone, rows.length > 1
    ? "Here are your Fegorson Studio licences again 👇"
    : "Here is your Fegorson Studio licence again 👇");
  for (const r of rows) {
    await sendText(creds, phone, `Licence for *${r.buyer_name}*:`);
    await sendText(creds, phone, r.code);
  }
  await sendText(creds, phone,
    "To unlock: open Fegorson Studio, click the *Trial* button at the top right (or the licence screen), " +
    "paste the code and click *Unlock*.\n\nNeed a licence for a different name? Reply *NEW*.");
  return true;
}

/** Where Paystack sends the buyer after paying: back into this chat. */
const chatLinks = new Map<string, string>();
async function backToChat(creds: WaCreds): Promise<string> {
  const known = chatLinks.get(creds.phoneNumberId);
  if (known) return known;
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${creds.phoneNumberId}?fields=display_phone_number`, {
      headers: { Authorization: `Bearer ${creds.token}` },
    }).then((x) => x.json());
    const digits = String(r?.display_phone_number ?? "").replace(/\D/g, "");
    if (digits) {
      const link = `https://wa.me/${digits}`;
      chatLinks.set(creds.phoneNumberId, link);
      return link;
    }
  } catch { /* fall through */ }
  return SITE_URL;
}

// ── The payment ──────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * The ONLY place a licence code is made. Called by the Paystack webhook after its
 * signature check, and by checkPaid() after Paystack's verify API. Never throws:
 * a failure after Paystack has taken the money is reported to the owner instead.
 */
export async function fulfilLicencePayment(p: {
  reference: string; amountKobo: number; currency: string; via: "webhook" | "verify";
}): Promise<void> {
  try {
    const [order] = await sql<(Order & { creator_id: string | null })[]>`
      SELECT id, phone, creator_id, buyer_name, state, price_ngn, reference, pay_url, code
      FROM licence_orders WHERE reference = ${p.reference} LIMIT 1`;
    if (!order) {
      await tellAdmin(`⚠️ A Fegorson licence payment arrived with no matching order (ref ${esc(p.reference)}). Nothing was sent.`);
      return;
    }
    if (order.code) return; // already issued for this reference

    const expectedKobo = order.price_ngn * 100;
    if (p.currency !== "NGN" || !(p.amountKobo >= expectedKobo) || !order.buyer_name) {
      await sql`
        UPDATE licence_orders
        SET state = 'PAYMENT_MISMATCH', paid_amount_kobo = ${p.amountKobo}, paid_currency = ${p.currency}, updated_at = now()
        WHERE id = ${order.id} AND code IS NULL`;
      await tellAdmin(
        `⚠️ <b>Fegorson licence NOT issued</b>: payment ${esc(p.reference)} was ` +
        `${esc(p.currency)} ${(p.amountKobo / 100).toLocaleString("en-NG")}, expected NGN ${order.price_ngn.toLocaleString("en-NG")}` +
        `${order.buyer_name ? "" : " (no name on the order)"}. Buyer: +${esc(order.phone)}. Please check it by hand.`);
      return;
    }

    const made = makeLicenceCode(order.buyer_name);
    const [won] = await sql<{ id: string }[]>`
      UPDATE licence_orders
      SET state = 'PAID', paid_at = now(), paid_amount_kobo = ${p.amountKobo}, paid_currency = ${p.currency},
          paid_via = ${p.via}, code = ${made.code}, code_id = ${made.k}, updated_at = now()
      WHERE id = ${order.id} AND code IS NULL
      RETURNING id`;
    if (!won) return; // a second delivery of the same payment got here first

    const error = await deliverCode(order, made.code);
    await sql`
      UPDATE licence_orders
      SET code_sent_at = ${error ? null : new Date()}, send_error = ${error}, updated_at = now()
      WHERE id = ${order.id}`;

    const [tot] = await sql<{ today: number; today_ngn: number; total: number; total_ngn: number }[]>`
      SELECT
        count(*) FILTER (WHERE (paid_at AT TIME ZONE 'Africa/Lagos')::date = (now() AT TIME ZONE 'Africa/Lagos')::date)::int AS today,
        coalesce(sum(paid_amount_kobo) FILTER (WHERE (paid_at AT TIME ZONE 'Africa/Lagos')::date = (now() AT TIME ZONE 'Africa/Lagos')::date), 0)::bigint / 100 AS today_ngn,
        count(*)::int AS total,
        coalesce(sum(paid_amount_kobo), 0)::bigint / 100 AS total_ngn
      FROM licence_orders WHERE code IS NOT NULL`;
    await tellAdmin(
      `💳 <b>Fegorson Studio licence sold</b>\n` +
      `Name: ${esc(order.buyer_name)}\n` +
      `WhatsApp: +${esc(order.phone)}\n` +
      `Paid: ₦${(p.amountKobo / 100).toLocaleString("en-NG")} · ref ${esc(p.reference)}\n` +
      `Code id: ${made.k}\n` +
      (error
        ? `❗ The code could NOT be sent in the chat (${esc(error)}). They can message "licence code" to get it, or send it yourself:\n<code>${esc(made.code)}</code>\n`
        : `Code sent in the chat ✅\n`) +
      `Today: ${tot.today} (₦${Number(tot.today_ngn).toLocaleString("en-NG")}) · All time: ${tot.total} (₦${Number(tot.total_ngn).toLocaleString("en-NG")})`);
  } catch (e) {
    console.error("[licence] fulfil failed:", e instanceof Error ? e.message : e);
    await tellAdmin(
      `⚠️ <b>Fegorson licence payment needs attention</b>: ref ${esc(p.reference)} was paid but the code ` +
      `step failed (${esc(e instanceof Error ? e.message : String(e))}).`).catch(() => {});
  }
}

/** Sends the code in the chat it was bought from. Returns an error message, or null. */
async function deliverCode(order: Order, code: string): Promise<string | null> {
  if (!order.creator_id) return "the order has no connected number";
  const [c] = await sql<{ phone_number_id: string; token: string }[]>`
    SELECT whatsapp_phone_number_id AS phone_number_id, whatsapp_access_token AS token
    FROM creators WHERE id = ${order.creator_id} AND whatsapp_access_token IS NOT NULL LIMIT 1`;
  if (!c) return "the connected number is no longer set up";
  const creds: WaCreds = { phoneNumberId: c.phone_number_id, token: c.token };

  const first = await sendText(creds, order.phone,
    `✅ Payment received, thank you!\n\nYour *Fegorson Studio* licence for *${order.buyer_name}* is below. Copy the whole code:`);
  if (!first.ok) return first.error;
  const second = await sendText(creds, order.phone, code);
  if (!second.ok) return second.error;
  await sendText(creds, order.phone,
    "To unlock: open Fegorson Studio, click the *Trial* button at the top right (or the licence screen), " +
    "paste the code and click *Unlock*.\n\n" +
    "Keep this chat. If you ever lose the code, send us *licence code* and we'll send it again.");
  return null;
}
