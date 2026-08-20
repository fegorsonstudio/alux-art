import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import sql from "@/lib/db";
import { r2Upload } from "@/lib/r2";
import { createServiceClient } from "@/lib/supabase-server";
import { SITE_URL } from "@/lib/site-url";
import { resolveTrigger } from "@/lib/whatsapp-triggers";
import {
  sendText, sendImage, sendList, sendButtons, downloadMedia, markRead,
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
  enhance_look_id: string | null;
  aspect_ratio: string | null;
  idle_seconds: number | null;
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

  // WhatsApp and Instagram live on DIFFERENT Meta apps, each signing with its
  // own secret. Checking only IG_APP_SECRET threw away every real WhatsApp
  // message with "bad signature" — the pipeline was fine, the key was wrong.
  //
  // Both are accepted rather than one replacing the other: the Instagram
  // comment-to-DM automation runs on the old app and is working, so swapping the
  // secret would fix WhatsApp by breaking Instagram. A payload only has to match
  // one of them, and a payload matching neither is still refused.
  const secrets = [process.env.WHATSAPP_APP_SECRET, process.env.IG_APP_SECRET]
    .filter((x): x is string => !!x);
  if (!secrets.length) {
    console.error("[wa] no app secret set — refusing unsigned payloads");
    return NextResponse.json({ ok: true });
  }
  const signature = req.headers.get("x-hub-signature-256");
  if (!secrets.some(sec => verifySignature(raw, signature, sec))) {
    console.warn(`[wa] bad signature — ignoring (checked ${secrets.length} secret(s))`);
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
  if (/^(restart|start over|cancel|reset|menu|styles)$/i.test(text) || choiceId === "restart") {
    await resetSession(session.id);
    await offerTemplates(creds, creator, phone, session.id);
    return;
  }

  // Somebody saying hello is starting a conversation, not answering a question
  // asked hours ago. Without this, a returning buyer gets "send 4 more photos"
  // as a reply to "hi" — the bot answering a question they no longer remember
  // being asked. Mid-upload it does NOT reset, because losing photos already
  // sent to a stray greeting would be worse.
  const greeted = /^(hi|hey|hello+|good (morning|afternoon|evening)|how far|abeg)\b/i.test(text);
  const stale = (session.idle_seconds ?? 0) > 60 * 60 * 2;
  if (greeted && (session.state === "IDLE" || session.selfie_count === 0 || stale)) {
    await resetSession(session.id);
    await offerTemplates(creds, creator, phone, session.id);
    return;
  }
  if (greeted) {
    await sendText(creds, phone,
      `Hi 👋 We're partway through — I have ${session.selfie_count} of your photos.\n\n` +
      "Keep sending photos, or reply *menu* to start again.");
    return;
  }

  // A trigger word beats whatever question is on the table. Someone typing
  // "g7x" mid-menu is telling us what they want, not answering us — and the
  // Instagram handoff sends them here with the word already typed. Skipped
  // while photos are in flight, so a filename-ish caption cannot wipe an upload.
  if (text && session.selfie_count === 0) {
    const hit = await resolveTrigger(creator.id, text);
    if (hit) return startFromTrigger(creds, creator, phone, session, hit);
  }

  // A conversation abandoned days ago should not resume mid-question.
  if (stale && session.state !== "IDLE" && session.selfie_count === 0) {
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
    case "CHOOSING_RATIO":
      return chooseRatio(creds, creator, phone, session, choiceId ?? text);
    case "CHOOSING_LOOK":
      return chooseLook(creds, creator, phone, session, choiceId ?? text);
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
           selfie_count, selfie_paths, package_size, currency, user_id, enhance_look_id, aspect_ratio,
           EXTRACT(EPOCH FROM (NOW() - COALESCE(last_message_at, updated_at)))::int AS idle_seconds
    FROM whatsapp_sessions
    WHERE creator_id = ${creatorId} AND customer_phone = ${phone}`;
  if (existing) return existing;

  const [created] = await sql<Session[]>`
    INSERT INTO whatsapp_sessions (creator_id, customer_phone, state)
    VALUES (${creatorId}, ${phone}, 'IDLE')
    ON CONFLICT (creator_id, customer_phone) DO UPDATE SET updated_at = NOW()
    RETURNING id, creator_id, customer_phone, state, template_id, shoot_id,
              selfie_count, selfie_paths, package_size, currency, user_id, enhance_look_id, aspect_ratio,
              0 AS idle_seconds`;
  return created;
}

async function resetSession(id: string) {
  await sql`
    UPDATE whatsapp_sessions
    SET state = 'IDLE', template_id = NULL, shoot_id = NULL, selfie_count = 0,
        selfie_paths = '{}', package_size = NULL, payment_reference = NULL, enhance_look_id = NULL, aspect_ratio = NULL,
        delivered_at = NULL, updated_at = NOW()
    WHERE id = ${id}`;
}

/**
 * The name the buyer sees. NOT creator.display_name: that is the internal
 * studio name ("Fegorson Studio") shown in the dashboard, while the number is
 * registered with WhatsApp as "Alux Art" and that is what appears at the top of
 * their chat. Greeting them as a different name reads like a wrong number.
 */
function brandName(creator: Creator): string {
  return process.env.WHATSAPP_BUSINESS_NAME || creator.display_name || "Alux Art";
}


/**
 * Per-image templates (the Gear Equalizer, the Asset Extractor) work on photos
 * the buyer already shot, not on selfies of them. Same booking route, different
 * question — so the conversation has to know which kind it is dealing with.
 */
async function isPerImage(templateId: string | null): Promise<boolean> {
  if (!templateId) return false;
  const [t] = await sql<{ category: string | null }[]>`
    SELECT category FROM templates WHERE id = ${templateId}`;
  return t?.category === "photo_upgrade" || t?.category === "asset_extract";
}

/**
 * Find a lighting look by the number printed in front of its name.
 *
 * The archive holds 197 looks — unlistable in a chat, and unguessable by name.
 * They were numbered for exactly this reason: a buyer can be told "reply 197"
 * and a friend can pass a number along. The name is the source of truth, since
 * that is what the picker and the shoot record both show.
 */
async function lookByNumber(templateId: string | null, n: number): Promise<{ id: string; name: string } | null> {
  if (!templateId) return null;
  const [row] = await sql<{ option_groups: unknown }[]>`
    SELECT option_groups FROM templates WHERE id = ${templateId}`;
  const groups = (Array.isArray(row?.option_groups) ? row!.option_groups : []) as Array<{
    type?: string; options?: Array<{ id: string; name: string; kind?: string }>;
  }>;
  for (const g of groups) {
    if (g.type !== "lighting") continue;
    for (const o of g.options ?? []) {
      if (o.kind !== "prompt") continue;
      const m = /^(\d+)\s+·\s+/.exec(o.name);
      if (m && Number(m[1]) === n) return { id: o.id, name: o.name };
    }
  }
  return null;
}


/**
 * A trigger word landed. Set the template (and the look, if they named one) and
 * go straight to asking for photos.
 *
 * The reply names back everything it decided. A trigger is a guess on the
 * buyer's behalf, and a wrong guess has to be visible now rather than after they
 * have paid for the wrong look.
 */
async function startFromTrigger(
  creds: WaCreds, creator: Creator, phone: string, session: Session,
  hit: Awaited<ReturnType<typeof resolveTrigger>> & object
) {
  const perImage = await isPerImage(hit.templateId);
  const lookId = hit.kind === "look" ? hit.lookId : null;

  await sql`
    UPDATE whatsapp_sessions
    SET template_id = ${hit.templateId}, state = 'COLLECTING_PHOTOS',
        selfie_count = 0, selfie_paths = '{}', package_size = NULL,
        enhance_look_id = ${lookId}, shoot_id = NULL, updated_at = NOW()
    WHERE id = ${session.id}`;

  const heading = hit.kind === "look"
    ? `*${hit.title}*\n${hit.lookName}`
    : `*${hit.title}*`;

  if (perImage) {
    await sendText(creds, phone,
      `${heading}\n\n` +
      "Send me the photos you want done.\n\n" +
      "📎 *Send them as files, not as photos.* Tap the paperclip, choose " +
      "*Document*, and pick your images. WhatsApp squeezes anything sent the " +
      "normal way, and you paid for the detail.\n\n" +
      "Up to 10. Reply *done* when you have finished.");
    return;
  }

  await sendText(creds, phone,
    `${heading}\n\n` +
    `Send me ${PHOTOS_NEEDED} photos of yourself, one at a time — face, side on, ` +
    "full body, and one smiling.\n\n" +
    "📎 *Send them as files* (paperclip → Document) so they keep their quality.\n\n" +
    "No filters and no sunglasses please.");
}

/** Step 1 — greet and show this creator's styles. */
async function offerTemplates(creds: WaCreds, creator: Creator, phone: string, sessionId: string) {
  // Per-image templates are included: the Gear Equalizer is the best seller, so
  // leaving it out of the menu hid the main product. The conversation branches
  // later on what it asks for — photos you already shot, rather than selfies.
  const templates = await sql<{
    id: string; title: string; category: string | null;
    p1: number | null; p5: number | null; cov: string | null; bkt: string | null;
  }[]>`
    SELECT id, title, category, price_1_ngn AS p1, price_5_ngn AS p5,
           cover_storage_path AS cov, cover_bucket AS bkt
    FROM templates
    WHERE creator_id = ${creator.id} AND status = 'published'
      -- Private templates are link-only client work. The marketplace filters
      -- them (app/api/marketplace/route.ts) and so must this: listing them here
      -- offers someone else's private template to anyone who says hello.
      AND is_private = false
    ORDER BY created_at DESC LIMIT 8`;

  if (!templates.length) {
    await sendText(creds, phone,
      `Thanks for messaging ${brandName(creator)}. ` +
      `There are no styles available on this number yet — have a look at ${SITE_URL}/marketplace instead.`);
    return;
  }

  await sql`UPDATE whatsapp_sessions SET state = 'CHOOSING_TEMPLATE', updated_at = NOW() WHERE id = ${sessionId}`;

  // Lead with a picture. A wall of text from an unknown number reads as spam;
  // the logo makes it look like the business the buyer just messaged.
  await sendImage(creds, phone, `${SITE_URL}/logo.png`,
    `Hi 👋 This is ${brandName(creator)}.\n\n` +
    "I turn photos into proper studio shots — usually in a few minutes.\n\n" +
    "Here's what we do 👇");

  // Then the styles themselves, as pictures. Choosing from names alone is
  // guesswork: the buyer cannot tell what any of these look like from a title.
  const previewable = templates.filter((t) => t.cov && t.bkt).slice(0, 5);
  for (let i = 0; i < previewable.length; i++) {
    const t = previewable[i];
    const perImage = t.category === "photo_upgrade" || t.category === "asset_extract";
    const price = perImage
      ? (t.p1 ? `₦${Number(t.p1).toLocaleString()} per photo` : "")
      : (t.p5 ? `₦${Number(t.p5).toLocaleString()} for 5 photos` : "");
    await sendImage(
      creds, phone,
      `${SITE_URL}/api/media?b=${encodeURIComponent(t.bkt!)}&p=${encodeURIComponent(t.cov!)}`,
      `*${i + 1}. ${t.title}*${price ? `\n${price}` : ""}`
    );
  }

  const r = await sendList(creds, phone, {
    body: previewable.length
      ? "Which one would you like? Tap below, or just reply with its number."
      : "Which style would you like?",
    button: "See styles",
    rows: templates.map((t) => ({ id: `tpl:${t.id}`, title: t.title.slice(0, 24), description: t.category ?? undefined })),
  });

  // A list can fail (an unverified number, a stale token). Falling back to a
  // numbered text list keeps the conversation alive instead of dead-ending.
  if (!r.ok) {
    console.warn("[wa] list failed, falling back to text:", r.error);
    await sendText(creds, phone,
      `Hi 👋 This is ${brandName(creator)}.\n\n` +
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
      AND is_private = false
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

  if (await isPerImage(picked.id)) {
    await sendText(creds, phone,
      `*${picked.title}* — good choice.\n\n` +
      "Send me the photos you want upgraded, one at a time. These are photos you " +
      "already took — a night out, an event, anything lit badly.\n\n" +
      "Send as many as you like, up to 10. Reply *done* when you have finished.");
    return;
  }

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
  const perImage = await isPerImage(session.template_id);

  // A document carrying an image is the PREFERRED path: WhatsApp recompresses
  // anything sent as a photo, and this product sells detail. Both are accepted
  // so nobody is blocked for sending it the ordinary way.
  const asDocument = msg.type === "document" && msg.document?.id
    && (msg.document.mime_type ?? "").startsWith("image/");
  const mediaId = asDocument ? msg.document!.id! : (msg.type === "image" ? msg.image?.id : undefined);

  if (!mediaId) {
    const said = (msg.text?.body ?? "").trim().toLowerCase();
    // "done" only means anything for a per-image shoot, where the buyer decides
    // how many photos to send. A fixed-size shoot ends when it has its four.
    if (perImage && /^(done|finish|finished|that's all|thats all)$/.test(said)) {
      if (session.selfie_count < 1) {
        await sendText(creds, phone, "Send me at least one photo first.");
        return;
      }
      return askWhereItGoes(creds, creator, phone, session);
    }
    await sendText(creds, phone, perImage
      ? "Send the photos as pictures, not as text or a file. Reply *done* when you have finished."
      : `I need photos to work from. Send ${PHOTOS_NEEDED - session.selfie_count} more as pictures, not as text or a file.`);
    return;
  }

  if (perImage && session.selfie_count >= 10) {
    await sendText(creds, phone, "That's the maximum of 10 photos. Reply *done* to carry on.");
    return;
  }

  const media = await downloadMedia(creds, mediaId);
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

  if (perImage) {
    await sendText(creds, phone,
      `Got it — that's ${have} photo${have === 1 ? "" : "s"}. ` +
      "Send another, or reply *done* when you have finished.");
    return;
  }

  if (have < PHOTOS_NEEDED) {
    const left = PHOTOS_NEEDED - have;
    await sendText(creds, phone, `Got it (${have}/${PHOTOS_NEEDED}). ${left} more to go.`);
    return;
  }

  await showQuote(creds, creator, phone, session.id, session.template_id);
}


/**
 * Per-image step — what shape should these come back?
 *
 * Asked BEFORE payment because it decides what gets generated, not how it is
 * cropped afterwards. A story posted from a 4:5 file gets bars or a bad crop,
 * and re-running it costs another generation.
 *
 * Only per-image templates ask. A portrait template was composed at the shape
 * its creator chose and its marketplace samples were shot that way; overriding
 * it would deliver something that does not match what the buyer was shown.
 */
async function askWhereItGoes(creds: WaCreds, creator: Creator, phone: string, session: Session) {
  await sql`UPDATE whatsapp_sessions SET state = 'CHOOSING_RATIO', updated_at = NOW() WHERE id = ${session.id}`;
  const r = await sendButtons(creds, phone, {
    body:
      `Got ${session.selfie_count} photo${session.selfie_count === 1 ? "" : "s"} 👍\n\n` +
      "Where are you posting these?",
    buttons: [
      { id: "ratio:9:16", title: "Story" },
      { id: "ratio:4:5", title: "Feed" },
    ],
  });
  if (!r.ok) {
    await sendText(creds, phone,
      "Where are you posting these? Reply *story* or *feed*.");
  }
}

/** Per-image step — they answered story or feed. */
async function chooseRatio(
  creds: WaCreds, creator: Creator, phone: string, session: Session, answer: string
) {
  const said = (answer || "").trim().toLowerCase();
  const ratio =
    said.startsWith("ratio:") ? said.slice(6)
    : /story|reel|status|9.?16/.test(said) ? "9:16"
    : /feed|post|grid|4.?5/.test(said) ? "4:5"
    : null;

  if (ratio !== "9:16" && ratio !== "4:5") {
    await sendText(creds, phone, "Reply *story* for a tall crop, or *feed* for the square-ish one.");
    return;
  }

  await sql`UPDATE whatsapp_sessions SET currency = COALESCE(currency, 'NGN'), updated_at = NOW() WHERE id = ${session.id}`;
  await sql`UPDATE whatsapp_sessions SET state = 'CHOOSING_LOOK', updated_at = NOW() WHERE id = ${session.id}`;
  // Stashed on the session so the booking call can pass it through.
  await sql`UPDATE whatsapp_sessions SET aspect_ratio = ${ratio}, updated_at = NOW() WHERE id = ${session.id}`;

  await sendText(creds, phone, ratio === "9:16" ? "Story it is — tall crop." : "Feed it is.");

  // A trigger word may already have chosen the look, in which case there is
  // nothing left to ask.
  if (session.enhance_look_id) {
    await showQuote(creds, creator, phone, session.id, session.template_id, session.selfie_count);
    return;
  }
  await askForLook(creds, creator, phone, { ...session });
}

/** Per-image step — which of the 197 looks. */
async function askForLook(creds: WaCreds, creator: Creator, phone: string, session: Session) {
  await sql`UPDATE whatsapp_sessions SET state = 'CHOOSING_LOOK', updated_at = NOW() WHERE id = ${session.id}`;
  await sendText(creds, phone,
    "Now pick the lighting look.\n\n" +
    "There are 197 of them, each with a number. If someone sent you a number, reply with it now.\n\n" +
    `Otherwise browse them here and send me the number:\n${SITE_URL}/marketplace/${session.template_id}\n\n` +
    "A popular one is *197* — Night Paparazzi G7X, the direct-flash night look.");
}

/** Per-image step — they replied with a look number. */
async function chooseLook(
  creds: WaCreds, creator: Creator, phone: string, session: Session, answer: string
) {
  const n = parseInt((answer || "").trim(), 10);
  if (!Number.isFinite(n)) {
    await sendText(creds, phone, "Reply with the look's number — just the digits, like *197*.");
    return;
  }
  const look = await lookByNumber(session.template_id, n);
  if (!look) {
    await sendText(creds, phone,
      `I couldn't find look ${n}. The numbers run from 1 to 197 — check it and send it again.`);
    return;
  }
  await sql`
    UPDATE whatsapp_sessions SET enhance_look_id = ${look.id}, updated_at = NOW()
    WHERE id = ${session.id}`;
  await sendText(creds, phone, `*${look.name}* it is.`);
  await showQuote(creds, creator, phone, session.id, session.template_id, session.selfie_count);
}

/** Step 4 — price and confirmation. */
async function showQuote(
  creds: WaCreds, creator: Creator, phone: string, sessionId: string, templateId: string | null,
  packageSize = 5
) {
  const [tpl] = await sql<{ title: string; category: string | null; p1: string | null }[]>`
    SELECT title, category, price_1_ngn AS p1 FROM templates WHERE id = ${templateId}`;
  const perImage = tpl?.category === "photo_upgrade" || tpl?.category === "asset_extract";

  // A per-image template has no packages. The bill is simply the per-photo rate
  // times however many photos the buyer sent, which is what the web checkout
  // charges and therefore what the booking route will charge.
  const price = perImage
    ? (tpl?.p1 ? Number(tpl.p1) * packageSize : null)
    : await priceFor(templateId, packageSize);

  // A creator can leave a size unpriced. Quoting a guess there would be quoting
  // a number the booking route will not honour, so the buyer is offered the
  // sizes that do have a price instead of being given an invented one.
  if (price === null && perImage) {
    await sendText(creds, phone,
      "That style isn't priced for booking yet. Reply *menu* and I'll show you the others.");
    return;
  }

  if (price === null) {
    const alt = (await Promise.all([1, 5, 10].map(async (n) => ({ n, p: await priceFor(templateId, n) }))))
      .filter((x) => x.p !== null);
    if (!alt.length) {
      await sendText(creds, phone,
        "That style isn't set up for booking yet. Reply *menu* and I'll show you the others.");
      return;
    }
    await sendText(creds, phone,
      "That style comes as " + alt.map((a) => a.n + " photo" + (a.n > 1 ? "s" : "")
        + " (\u20a6" + a.p!.toLocaleString() + ")").join(" or ")
      + ".\n\nReply with the number of photos you want.");
    return;
  }

  await sql`
    UPDATE whatsapp_sessions
    SET state = 'CONFIRMING', package_size = ${packageSize}, currency = 'NGN', updated_at = NOW()
    WHERE id = ${sessionId}`;

  const body =
    `That's everything I need 📸\n\n` +
    `*${tpl?.title ?? "Your shoot"}*\n` +
    `${packageSize} photo${packageSize > 1 ? "s" : ""}${perImage ? " upgraded" : ""} — ₦${price!.toLocaleString()}\n\n` +
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
      // A per-image booking is refused outright without a lighting selection,
      // and the route re-reads the recipe server-side from this id — the chat
      // never handles prompt text.
      ...(session.enhance_look_id ? { enhance: { lighting: session.enhance_look_id } } : {}),
      ...(session.aspect_ratio ? { aspectRatio: session.aspect_ratio } : {}),
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

  // profiles is this database's mirror of the Supabase user. auth.users lives
  // in Supabase cloud and is not reachable from here, so it is the wrong thing
  // to look in — every route that needs a user by id or email uses profiles.
  const [existing] = await sql<{ id: string }[]>`
    SELECT id FROM profiles WHERE email = ${email} LIMIT 1`;
  if (existing) return existing.id;

  const supa = createServiceClient();
  const { data, error } = await supa.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { source: "whatsapp", phone },
  });
  if (error || !data?.user) throw new Error(`could not create user for ${phone}: ${error?.message}`);

  // The profile row is what the booking and pay routes read to authorise this
  // customer. A Supabase user without one would be a customer who can be
  // created but can never book.
  await sql`
    INSERT INTO profiles (id, email, display_name, created_at, updated_at)
    VALUES (${data.user.id}, ${email}, ${`WhatsApp ${phone.slice(-4)}`}, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING`;

  return data.user.id;
}

/**
 * What this template costs, read the way the web checkout reads it.
 *
 * This used to read `price_N_ngn` out of app_config — the platform's own
 * direct-shoot prices, which have nothing to do with what a creator charges for
 * their template. The buyer was quoted one number in chat and then charged a
 * different one by the booking route, because that route prices from the
 * template row. Same source now, so the two cannot disagree.
 *
 * The 12% / 60% fallbacks mirror app/api/marketplace/[id]/route.ts, which is
 * what fills those fields in for a template that only has a 10-image price.
 */
async function priceFor(templateId: string | null, packageSize: number): Promise<number | null> {
  if (!templateId) return null;
  const [t] = await sql<{
    price_1_ngn: string | null; price_5_ngn: string | null; price_ngn: string | null;
  }[]>`SELECT price_1_ngn, price_5_ngn, price_ngn FROM templates WHERE id = ${templateId}`;
  if (!t) return null;

  const ten = t.price_ngn != null ? Number(t.price_ngn) : null;
  const one = t.price_1_ngn != null ? Number(t.price_1_ngn) : (ten ? Math.round(ten * 0.12) : null);
  const five = t.price_5_ngn != null ? Number(t.price_5_ngn) : (ten ? Math.round(ten * 0.60) : null);

  const chosen = packageSize === 1 ? one : packageSize === 10 ? ten : five;
  return Number.isFinite(chosen) && (chosen ?? 0) > 0 ? Number(chosen) : null;
}

// ── Payload shapes ───────────────────────────────────────────────────────────

type WaMessage = {
  id: string;
  from: string;
  type: string;
  text?: { body?: string };
  image?: { id?: string };
  document?: { id?: string; mime_type?: string; filename?: string };
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
