import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import sql from "@/lib/db";
import { r2Upload } from "@/lib/r2";
import { createServiceClient } from "@/lib/supabase-server";
import { SITE_URL } from "@/lib/site-url";
import {
  sendText, sendList, sendButtons, downloadMedia, markRead,
  verifySignature, normalisePhone, type WaCreds,
} from "@/lib/whatsapp";

/**
 * The WhatsApp booking bot.
 *
 * Each creator connects their own WhatsApp Business number, so every inbound
 * message is routed to a creator by the phone_number_id Meta puts in the
 * payload, and answered with that creator's own token. One endpoint serves all
 * of them; there is no per-creator URL to configure.
 *
 * The conversation is a state machine held in whatsapp_sessions, one row per
 * (creator, customer phone). It exists because WhatsApp gives you one message
 * at a time with no memory: "yes" only means something if you know what was
 * asked. States run IDLE -> CHOOSING_TEMPLATE -> COLLECTING_PHOTOS ->
 * CONFIRMING -> AWAITING_PAYMENT -> GENERATING -> DONE.
 *
 * Two rules that are not obvious and cost real money if broken:
 *
 *   - Always answer 200, even on our own errors. Meta retries anything else,
 *     and a retry re-runs the same step: a second shoot, a second charge.
 *   - Deduplicate on the WhatsApp message id before doing any work, because a
 *     retry can still arrive after a successful 200.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PHOTOS_NEEDED = 4;

type Session = {
  id: string;
  creator_id: string;
  customer_phone: string;
  state: string;
  template_id: string | null;
  shoot_id: string | null;
  selfie_count: number;
  selfie_paths: string[];
  package_size: number | null;
  currency: string | null;
  user_id: string | null;
};

// ── Webhook verification ─────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const expected = process.env.WHATSAPP_VERIFY_TOKEN ?? process.env.IG_WEBHOOK_VERIFY_TOKEN;
  if (p.get("hub.mode") === "subscribe" && expected && p.get("hub.verify_token") === expected) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

// ── Inbound messages ─────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const raw = await req.text();

  const secret = process.env.IG_APP_SECRET;
  if (!secret) {
    console.error("[wa] IG_APP_SECRET not set — refusing unsigned payloads");
    return NextResponse.json({ ok: true });
  }
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"), secret)) {
    console.warn("[wa] bad signature — ignoring");
    return NextResponse.json({ ok: true });
  }

  let body: WaWebhook;
  try { body = JSON.parse(raw) as WaWebhook; } catch { return NextResponse.json({ ok: true }); }

  try {
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const v = change.value;
        if (!v?.messages?.length) continue;   // statuses (delivered/read) — nothing to do
        const phoneNumberId = v.metadata?.phone_number_id;
        if (!phoneNumberId) continue;

        const creator = await creatorFor(phoneNumberId);
        if (!creator) {
          console.warn("[wa] message for an unconnected number", phoneNumberId);
          continue;
        }
        const creds: WaCreds = { phoneNumberId, token: creator.whatsapp_access_token };

        for (const msg of v.messages) {
          if (await alreadyHandled(msg.id)) continue;
          await handleMessage(creds, creator, msg).catch((e) => {
            console.error("[wa] handler error:", e instanceof Error ? e.message : String(e));
          });
        }
      }
    }
  } catch (e) {
    console.error("[wa] webhook error:", e instanceof Error ? e.message : String(e));
  }

  // Always 200. See the note at the top.
  return NextResponse.json({ ok: true });
}

// ── Routing and idempotency ──────────────────────────────────────────────────

type Creator = { id: string; whatsapp_access_token: string; display_name: string | null };

async function creatorFor(phoneNumberId: string): Promise<Creator | null> {
  const [c] = await sql<Creator[]>`
    SELECT id, whatsapp_access_token, display_name
    FROM creators
    WHERE whatsapp_phone_number_id = ${phoneNumberId}
      AND whatsapp_access_token IS NOT NULL
    LIMIT 1`;
  return c ?? null;
}

async function alreadyHandled(messageId: string): Promise<boolean> {
  if (!messageId) return true;
  const rows = await sql`
    INSERT INTO whatsapp_handled_messages (message_id) VALUES (${messageId})
    ON CONFLICT (message_id) DO NOTHING
    RETURNING message_id`;
  return rows.length === 0;
}

// ── The conversation ─────────────────────────────────────────────────────────

async function handleMessage(creds: WaCreds, creator: Creator, msg: WaMessage) {
  const phone = normalisePhone(msg.from);
  void markRead(creds, msg.id).catch(() => {});

  const session = await loadSession(creator.id, phone);
  const text = (msg.text?.body ?? "").trim();
  const choiceId =
    msg.interactive?.list_reply?.id ?? msg.interactive?.button_reply?.id ?? null;

  await sql`
    UPDATE whatsapp_sessions
    SET last_inbound = ${text || choiceId || msg.type}, last_message_at = NOW(), updated_at = NOW()
    WHERE id = ${session.id}`;

  // Universal escape hatches, valid in any state.
  if (/^(restart|start over|cancel|reset)$/i.test(text) || choiceId === "restart") {
    await resetSession(session.id);
    await offerTemplates(creds, creator, phone, session.id);
    return;
  }
  if (/^(help|support|human|agent)$/i.test(text)) {
    await sendText(creds, phone,
      "A person will pick this up shortly.\n\n" +
      "In the meantime: send *restart* to begin again, or browse everything at " +
      `${SITE_URL}/marketplace`);
    return;
  }

  switch (session.state) {
    case "CHOOSING_TEMPLATE":
      return chooseTemplate(creds, creator, phone, session, choiceId ?? text);
    case "COLLECTING_PHOTOS":
      return collectPhoto(creds, creator, phone, session, msg);
    case "CONFIRMING":
      return confirm(creds, creator, phone, session, choiceId ?? text);
    case "AWAITING_PAYMENT":
      return sendText(creds, phone,
        "Your shoot is waiting on payment. Tap the payment link above to finish, " +
        "and I'll start the moment it lands.\n\nSend *restart* to begin again.");
    case "GENERATING":
      return sendText(creds, phone,
        "Your shoot is being made now — it usually takes a few minutes. " +
        "I'll send the photos here as soon as they're ready.");
    default:
      return offerTemplates(creds, creator, phone, session.id);
  }
}

async function loadSession(creatorId: string, phone: string): Promise<Session> {
  const [existing] = await sql<Session[]>`
    SELECT id, creator_id, customer_phone, state, template_id, shoot_id,
           selfie_count, selfie_paths, package_size, currency, user_id
    FROM whatsapp_sessions
    WHERE creator_id = ${creatorId} AND customer_phone = ${phone}`;
  if (existing) return existing;

  const [created] = await sql<Session[]>`
    INSERT INTO whatsapp_sessions (creator_id, customer_phone, state)
    VALUES (${creatorId}, ${phone}, 'IDLE')
    ON CONFLICT (creator_id, customer_phone) DO UPDATE SET updated_at = NOW()
    RETURNING id, creator_id, customer_phone, state, template_id, shoot_id,
              selfie_count, selfie_paths, package_size, currency, user_id`;
  return created;
}

async function resetSession(id: string) {
  await sql`
    UPDATE whatsapp_sessions
    SET state = 'IDLE', template_id = NULL, shoot_id = NULL, selfie_count = 0,
        selfie_paths = '{}', package_size = NULL, payment_reference = NULL,
        delivered_at = NULL, updated_at = NOW()
    WHERE id = ${id}`;
}

/** Step 1 — greet and show this creator's styles. */
async function offerTemplates(creds: WaCreds, creator: Creator, phone: string, sessionId: string) {
  const templates = await sql<{ id: string; title: string; category: string | null }[]>`
    SELECT id, title, category FROM templates
    WHERE creator_id = ${creator.id} AND status = 'published'
    ORDER BY created_at DESC LIMIT 10`;

  if (!templates.length) {
    await sendText(creds, phone,
      `Thanks for messaging ${creator.display_name ?? "us"}. ` +
      `There are no styles available on this number yet — have a look at ${SITE_URL}/marketplace instead.`);
    return;
  }

  await sql`UPDATE whatsapp_sessions SET state = 'CHOOSING_TEMPLATE', updated_at = NOW() WHERE id = ${sessionId}`;

  const r = await sendList(creds, phone, {
    body:
      `Hi 👋 This is ${creator.display_name ?? "Alux Art"}.\n\n` +
      "I can turn a few photos of you into a proper photoshoot, usually in a few minutes.\n\n" +
      "Which style would you like?",
    button: "See styles",
    rows: templates.map((t) => ({ id: `tpl:${t.id}`, title: t.title, description: t.category ?? undefined })),
  });

  // A list can fail (an unverified number, a stale token). Falling back to a
  // numbered text list keeps the conversation alive instead of dead-ending.
  if (!r.ok) {
    console.warn("[wa] list failed, falling back to text:", r.error);
    await sendText(creds, phone,
      `Hi 👋 This is ${creator.display_name ?? "Alux Art"}.\n\n` +
      "Reply with the number of the style you want:\n\n" +
      templates.map((t, i) => `${i + 1}. ${t.title}`).join("\n"));
  }
}

/** Step 2 — they picked a style. */
async function chooseTemplate(
  creds: WaCreds, creator: Creator, phone: string, session: Session, answer: string
) {
  const templates = await sql<{ id: string; title: string }[]>`
    SELECT id, title FROM templates
    WHERE creator_id = ${creator.id} AND status = 'published'
    ORDER BY created_at DESC LIMIT 10`;

  let picked: { id: string; title: string } | undefined;
  if (answer.startsWith("tpl:")) {
    picked = templates.find((t) => t.id === answer.slice(4));
  } else if (/^\d+$/.test(answer.trim())) {
    picked = templates[parseInt(answer.trim(), 10) - 1];
  } else {
    // Last resort: match on the title they typed.
    const needle = answer.toLowerCase().trim();
    picked = templates.find((t) => t.title.toLowerCase() === needle)
      ?? templates.find((t) => needle.length > 3 && t.title.toLowerCase().includes(needle));
  }

  if (!picked) {
    await sendText(creds, phone,
      "I didn't catch which style you meant. Reply with its number:\n\n" +
      templates.map((t, i) => `${i + 1}. ${t.title}`).join("\n"));
    return;
  }

  await sql`
    UPDATE whatsapp_sessions
    SET template_id = ${picked.id}, state = 'COLLECTING_PHOTOS',
        selfie_count = 0, selfie_paths = '{}', updated_at = NOW()
    WHERE id = ${session.id}`;

  await sendText(creds, phone,
    `*${picked.title}* — good choice.\n\n` +
    `Now send me ${PHOTOS_NEEDED} photos of yourself, one at a time:\n\n` +
    "1. A clear photo of your face, good light\n" +
    "2. One from the side or three-quarter\n" +
    "3. One full body, standing\n" +
    "4. One where you're genuinely smiling\n\n" +
    "No filters and no sunglasses please — they're the one thing I can't work around.");
}

/** Step 3 — collect the photos. */
async function collectPhoto(
  creds: WaCreds, creator: Creator, phone: string, session: Session, msg: WaMessage
) {
  if (msg.type !== "image" || !msg.image?.id) {
    await sendText(creds, phone,
      `I need photos to work from. Send ${PHOTOS_NEEDED - session.selfie_count} more as pictures, not as text or a file.`);
    return;
  }

  const media = await downloadMedia(creds, msg.image.id);
  if (!media) {
    await sendText(creds, phone, "That photo didn't come through. Could you send it again?");
    return;
  }

  const userId = await ensureUser(session, phone);
  const ext = media.mimeType.includes("png") ? "png" : media.mimeType.includes("webp") ? "webp" : "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  try {
    await r2Upload("identity-images", path, media.buffer, media.mimeType);
  } catch (e) {
    console.error("[wa] upload failed:", e instanceof Error ? e.message : String(e));
    await sendText(creds, phone, "I couldn't save that photo. Please try sending it once more.");
    return;
  }

  await sql`
    INSERT INTO identity_images (user_id, name, type, size, storage_bucket, storage_path, created_at, last_used_at)
    VALUES (${userId}, ${`WhatsApp ${session.selfie_count + 1}`}, ${media.mimeType},
            ${media.buffer.byteLength}, 'identity-images', ${path}, NOW(), NOW())`;

  const [updated] = await sql<{ selfie_count: number }[]>`
    UPDATE whatsapp_sessions
    SET selfie_paths = array_append(selfie_paths, ${path}),
        selfie_count = selfie_count + 1, user_id = ${userId}, updated_at = NOW()
    WHERE id = ${session.id}
    RETURNING selfie_count`;

  const have = updated?.selfie_count ?? session.selfie_count + 1;
  if (have < PHOTOS_NEEDED) {
    const left = PHOTOS_NEEDED - have;
    await sendText(creds, phone, `Got it (${have}/${PHOTOS_NEEDED}). ${left} more to go.`);
    return;
  }

  await showQuote(creds, creator, phone, session.id, session.template_id);
}

/** Step 4 — price and confirmation. */
async function showQuote(
  creds: WaCreds, creator: Creator, phone: string, sessionId: string, templateId: string | null
) {
  const [tpl] = await sql<{ title: string }[]>`SELECT title FROM templates WHERE id = ${templateId}`;
  const price = await priceFor(5, "NGN");

  await sql`
    UPDATE whatsapp_sessions
    SET state = 'CONFIRMING', package_size = 5, currency = 'NGN', updated_at = NOW()
    WHERE id = ${sessionId}`;

  const body =
    `That's everything I need 📸\n\n` +
    `*${tpl?.title ?? "Your shoot"}*\n` +
    `5 photos — ₦${price.toLocaleString()}\n\n` +
    "Shall I go ahead?";

  const r = await sendButtons(creds, phone, {
    body,
    buttons: [{ id: "confirm", title: "Yes, book it" }, { id: "restart", title: "Start over" }],
  });
  if (!r.ok) await sendText(creds, phone, `${body}\n\nReply *YES* to book, or *restart* to begin again.`);
}

/** Step 5 — they confirmed. */
async function confirm(
  creds: WaCreds, creator: Creator, phone: string, session: Session, answer: string
) {
  if (!/^(confirm|yes|y|ok|book|go)/i.test(answer)) {
    await sendText(creds, phone, "No problem. Reply *YES* when you're ready, or *restart* to pick a different style.");
    return;
  }

  const userId = await ensureUser(session, phone);
  await sendText(creds, phone, "Setting that up now, one moment…");

  // Booking goes through the site's own route rather than its own SQL, so the
  // chat can never drift from the web checkout on price, fees, coupons or
  // template rules. It authenticates this call with the internal secret and the
  // user being acted for.
  const paths = await sql<{ storage_path: string; type: string; size: number }[]>`
    SELECT storage_path, type, size FROM identity_images
    WHERE user_id = ${userId} AND storage_path = ANY(${session.selfie_paths})`;

  const booking = await fetch(`${SITE_URL}/api/marketplace/${session.template_id}/book`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
      "x-act-as-user": userId,
    },
    body: JSON.stringify({
      packageSize: session.package_size ?? 5,
      currency: session.currency ?? "NGN",
      identityRefs: paths.map((p, i) => ({
        id: crypto.randomUUID(),
        name: `WhatsApp ${i + 1}`,
        type: p.type || "image/jpeg",
        size: p.size || 1,
        storageBucket: "identity-images",
        storagePath: p.storage_path,
      })),
    }),
  }).then((r) => r.json()).catch((e) => ({ error: String(e) }));

  if (booking?.error || !booking?.shoot?.id) {
    console.error("[wa] booking failed:", JSON.stringify(booking).slice(0, 300));
    await sendText(creds, phone,
      "Something went wrong setting up your shoot. Nothing has been charged.\n\n" +
      `You can finish it here instead: ${SITE_URL}/marketplace/${session.template_id}`);
    return;
  }

  const shootId = booking.shoot.id as string;
  await sql`
    UPDATE whatsapp_sessions
    SET shoot_id = ${shootId}, state = 'AWAITING_PAYMENT', user_id = ${userId}, updated_at = NOW()
    WHERE id = ${session.id}`;

  const pay = await fetch(`${SITE_URL}/api/shoots/${shootId}/pay`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
      "x-act-as-user": userId,
    },
  }).then((r) => r.json()).catch((e) => ({ error: String(e) }));

  if (pay?.authorization_url || pay?.url) {
    await sql`UPDATE whatsapp_sessions SET payment_reference = ${pay.reference ?? null} WHERE id = ${session.id}`;
    await sendText(creds, phone,
      "Here's your secure checkout 👇\n\n" +
      `${pay.authorization_url ?? pay.url}\n\n` +
      "Pay with card or bank transfer. Your photos are already uploaded, so this is the last step — " +
      "I'll send the finished shoot straight back here.");
    return;
  }

  // Free bookings (an admin grant, a sponsored template) come back with no
  // payment link because there is nothing to pay.
  if (pay?.free || pay?.ok) {
    await sql`UPDATE whatsapp_sessions SET state = 'GENERATING', updated_at = NOW() WHERE id = ${session.id}`;
    await sendText(creds, phone, "You're all set — no payment needed. Making your photos now ✨");
    return;
  }

  console.error("[wa] payment init failed:", JSON.stringify(pay).slice(0, 300));
  await sendText(creds, phone,
    "Your shoot is saved but I couldn't open the payment page.\n\n" +
    `Finish it here: ${SITE_URL}/studio`);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * A WhatsApp customer has no account, but shoots, payments and the identity
 * library are all keyed to a user. So each phone number gets one, created on
 * first photo and reused forever after. The address is deliberately on a
 * subdomain we control and never receives mail.
 */
async function ensureUser(session: Session, phone: string): Promise<string> {
  if (session.user_id) return session.user_id;

  const email = `wa-${phone}@whatsapp.aluxartandframes.shop`;
  const [existing] = await sql<{ id: string }[]>`
    SELECT id FROM auth.users WHERE email = ${email} LIMIT 1`.catch(() => []);
  if (existing) return existing.id;

  const supa = createServiceClient();
  const { data, error } = await supa.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { source: "whatsapp", phone },
  });
  if (error || !data?.user) throw new Error(`could not create user for ${phone}: ${error?.message}`);
  return data.user.id;
}

async function priceFor(packageSize: number, currency: string): Promise<number> {
  const key = `price_${packageSize}_${currency.toLowerCase()}`;
  const [row] = await sql<{ value: string }[]>`SELECT value FROM app_config WHERE key = ${key}`;
  const parsed = row?.value ? parseInt(String(row.value), 10) : NaN;
  if (Number.isFinite(parsed)) return parsed;
  return currency === "NGN" ? { 1: 1500, 5: 7500, 10: 15000 }[packageSize] ?? 7500 : packageSize;
}

// ── Payload shapes ───────────────────────────────────────────────────────────

type WaMessage = {
  id: string;
  from: string;
  type: string;
  text?: { body?: string };
  image?: { id?: string };
  interactive?: {
    list_reply?: { id?: string };
    button_reply?: { id?: string };
  };
};

type WaWebhook = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: { phone_number_id?: string };
        messages?: WaMessage[];
      };
    }>;
  }>;
};
