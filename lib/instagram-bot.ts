import "server-only";
import sql from "@/lib/db";
import { r2Upload } from "@/lib/r2";
import { createServiceClient } from "@/lib/supabase-server";
import { SITE_URL } from "@/lib/site-url";
import { findLookByNumber } from "@/lib/whatsapp-triggers";
import { needsContactEmail, CONTACT_EMAIL_ASK } from "@/lib/chat-contact-email";
import { uploadLinkFor } from "@/lib/chat-upload-links";
import {
  sendText, sendImage, downloadAttachment, credsForAccount, handleForAccount,
  sendTextWithButtons, type IgCreds, type IgSendResult,
} from "@/lib/instagram";

/**
 * The Instagram booking bot.
 *
 * A relight bought and delivered without leaving the DM: comment a number, send
 * the photo, pay, receive the finished picture in the same chat.
 *
 * Deliberately NOT a port of app/api/webhooks/whatsapp/route.ts. That file is
 * 1,349 lines, is taking real money today, and is built around WhatsApp's
 * interactive lists and buttons, none of which Instagram has. Rewriting it to
 * serve both would put the live bot at risk to save duplicating a state
 * machine. What IS shared is everything that decides money or pixels: the
 * marketplace booking route, the look archive, generation and the wallet. The
 * chat script is the only part written twice, and it should be — the two
 * platforms do not behave alike.
 *
 * Scope is narrower than WhatsApp on purpose: one look, one photo, one price.
 * That is the journey a comment on a carousel actually starts.
 */

const WA_NUMBER = "2349076858017";
const RELIGHT_PRICE_NGN = 1000;
/**
 * Most photographs in one order.
 *
 * The booking route caps this template at 10 and trims anything above it
 * without saying so, which would lose a customer's picture — the exact fault
 * this batching exists to fix. So the bot stops at the same number and says
 * why.
 */
const MAX_BATCH = 10;

export type IgSession = {
  id: string;
  ig_account_id: string;
  ig_user_id: string;
  ig_username: string | null;
  state: string;
  template_id: string | null;
  look_option_id: string | null;
  look_name: string | null;
  shoot_id: string | null;
  source_paths: string[];
  /** The lines of an in-chat GIF, in the order they appear in the film. */
  gif_lines: string[];
  /** The address beat of an in-chat GIF, when they gave one. */
  gif_website: string | null;
  user_id: string | null;
  payment_reference: string | null;
  last_inbound_at: Date;
  /** When the studio was last told about a message this bot ignored. */
  last_ignored_alert_at: Date | null;
};

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

// ── Glow Retouch (automatic retouching) ─────────────────────────────────────
// The same chat journey as a relight — photos, one link, pay, delivered here —
// on the private "Glow Retouch" template (category photo_retouch). Its orders are
// processed by the retouch worker (workers/retouch), which edits only the
// customer's own pixels; nothing here decides how a photo is retouched.

/** Marks a conversation that is collecting photos for Glow Retouch rather than a look. */
export const RETOUCH_MARKER = "retouch";
const RETOUCH_PRICE_NGN = 1000;

let retouchTemplate: { id: string; at: number } | null = null;
export async function glowRetouchTemplateId(): Promise<string | null> {
  if (retouchTemplate && Date.now() - retouchTemplate.at < 5 * 60_000) return retouchTemplate.id;
  const [t] = await sql<{ id: string }[]>`
    SELECT id FROM templates WHERE category = 'photo_retouch' AND status = 'published'
    ORDER BY created_at LIMIT 1`.catch(() => [] as { id: string }[]);
  retouchTemplate = t ? { id: t.id, at: Date.now() } : null;
  return t?.id ?? null;
}

export const isRetouchSession = (s: Pick<IgSession, "look_option_id">) => s.look_option_id === RETOUCH_MARKER;
/** "relit" or "retouched", for the sentences both products share. */
const doneWord = (s: Pick<IgSession, "look_option_id">) => (isRetouchSession(s) ? "retouched" : "relit");

/**
 * Someone asked for RETOUCH. Arms the conversation for Glow Retouch and asks for
 * the photos; photos already sent (before a look was chosen) are kept and counted.
 * Returns false if the template is not set up, so the caller can fall back.
 */
export async function offerRetouch(creds: IgCreds, session: IgSession): Promise<boolean> {
  const templateId = await glowRetouchTemplateId();
  if (!templateId) return false;
  // Held photos are unpaid ones (booking clears them), so they carry over — the
  // same rule acceptInstagramPhoto uses: nothing once a link has gone out.
  const closed = session.state === "AWAITING_PAYMENT" || session.state === "GENERATING";
  const waiting = closed ? [] : await freshHeld(session.source_paths ?? []);
  await patchSession(session.id, {
    state: waiting.length ? "CONFIRMING_BATCH" : "COLLECTING_PHOTO",
    template_id: templateId,
    look_option_id: RETOUCH_MARKER,
    look_name: "Glow Retouch",
    shoot_id: null,
  });
  if (waiting.length > 0) {
    await sendText(creds, session.ig_user_id,
      `*Glow Retouch* it is. I have *${waiting.length} photo${waiting.length === 1 ? "" : "s"}* ` +
      `(${naira(RETOUCH_PRICE_NGN * waiting.length)}).\n\n` +
      `Are these all the pictures you want retouched? Reply *yes* and I'll send one payment ` +
      `link for all of them, or just send the rest.`);
    return true;
  }
  const upLink = await uploadLinkFor("instagram", session.id);
  const intro =
    `*Glow Retouch* ✨ ${naira(RETOUCH_PRICE_NGN)} per photo.\n\n` +
    `I even out skin and tone, heal blemishes, soften shine, brighten the eyes and tidy ` +
    `stray hairs and background distractions — and you stay exactly you: your face is ` +
    `never redrawn.\n\n`;
  await sendWithLinkFallback(creds, session.ig_user_id,
    intro +
    `Send me the photo here, or for full quality upload the original instead ` +
    `(Instagram shrinks photos sent in chat): ${upLink}\n\nUp to 10 photos.`,
    intro + `Send me the photo here — up to 10.`);
  return true;
}

/** "197 · S Night Paparazzi G7X" -> "Night Paparazzi G7X" */
export const prettyLook = (name: string) =>
  name.replace(/^\d+\s*·\s*/, "").replace(/^[CS]\s+/, "");

// ── Session ──────────────────────────────────────────────────────────────────

export async function loadSession(igAccountId: string, igUserId: string, username?: string): Promise<IgSession> {
  const [row] = await sql<IgSession[]>`
    INSERT INTO instagram_sessions (ig_account_id, ig_user_id, ig_username)
    VALUES (${igAccountId}, ${igUserId}, ${username ?? null})
    ON CONFLICT (ig_account_id, ig_user_id) DO UPDATE
      SET updated_at = NOW(),
          ig_username = COALESCE(EXCLUDED.ig_username, instagram_sessions.ig_username)
    RETURNING *`;
  return row;
}

export async function patchSession(id: string, patch: Record<string, unknown>): Promise<void> {
  const entries = Object.entries(patch);
  if (entries.length === 0) return;
  await sql`UPDATE instagram_sessions SET ${sql(patch as never)}, updated_at = NOW() WHERE id = ${id}`;
}

/** Records that the customer just spoke, which is what re-opens the 24h window. */
export async function markInbound(id: string, text: string | null): Promise<void> {
  await sql`
    UPDATE instagram_sessions
    SET last_inbound = ${text?.slice(0, 300) ?? null}, last_inbound_at = NOW(), updated_at = NOW()
    WHERE id = ${id}`;
}

// ── The customer's account ───────────────────────────────────────────────────

/**
 * Resolve this Instagram user to a profile, creating one if needed.
 *
 * Same shape as the WhatsApp bot's ensureUser, including the reason it looks in
 * `profiles`: auth.users lives in Supabase cloud and is not reachable from this
 * database, so every route that needs a user reads profiles.
 *
 * The synthetic address is derived from the IGSID, which is scoped to this app
 * — it is not the person's Instagram handle and cannot be used to contact them
 * anywhere else. `email <address>` in chat joins them to a real account.
 */

/**
 * The photographs still part of the batch being built.
 *
 * Anything older than the window belonged to an earlier visit and is dropped.
 * Silently: the customer is told the running count on the very next line, and
 * a number they recognise is the confirmation that matters.
 */
const BATCH_WINDOW_MS = 2 * 60 * 60 * 1000;
async function freshHeld(paths: string[]): Promise<string[]> {
  const held = (paths ?? []).filter(Boolean);
  if (held.length === 0) return [];
  const rows = await sql<{ storage_path: string; created_at: Date }[]>`
    SELECT storage_path, created_at FROM identity_images
    WHERE storage_path = ANY(${held})`.catch(() => [] as { storage_path: string; created_at: Date }[]);
  const uploadedAt = new Map(rows.map(r => [r.storage_path, new Date(r.created_at).getTime()]));
  const cutoff = Date.now() - BATCH_WINDOW_MS;
  const keep = held.filter(p => (uploadedAt.get(p) ?? 0) >= cutoff);
  if (keep.length !== held.length) {
    console.log(`[ig bot] dropped ${held.length - keep.length} stale photo(s) from an earlier visit`);
  }
  return keep;
}

export async function ensureUser(session: IgSession): Promise<string> {
  if (session.user_id) return session.user_id;

  const email = `ig-${session.ig_user_id}@instagram.aluxartandframes.shop`;
  const [existing] = await sql<{ id: string }[]>`
    SELECT id FROM profiles WHERE email = ${email} LIMIT 1`;
  if (existing) {
    await patchSession(session.id, { user_id: existing.id });
    return existing.id;
  }

  const supa = createServiceClient();
  const { data, error } = await supa.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { source: "instagram", ig_user_id: session.ig_user_id, ig_username: session.ig_username },
  });
  if (error || !data?.user) {
    throw new Error(`could not create user for IG ${session.ig_user_id}: ${error?.message}`);
  }

  await sql`
    INSERT INTO profiles (id, email, display_name, created_at, updated_at)
    VALUES (${data.user.id}, ${email},
            ${session.ig_username ? `@${session.ig_username}` : `Instagram ${session.ig_user_id.slice(-4)}`},
            NOW(), NOW())
    ON CONFLICT (id) DO NOTHING`;

  await patchSession(session.id, { user_id: data.user.id });
  return data.user.id;
}

// ── Sending, with the link restriction handled once ──────────────────────────

/**
 * Send text, and if Instagram refuses it for containing a link, fall back.
 *
 * The account has already been under a link restriction once. When that is on,
 * ANY message with a URL is dropped and reported as "Invalid message id", so a
 * payment link simply never arrives and the customer is left waiting on
 * something that was never sent.
 *
 * `withoutLink` is the same message with the URL removed and the WhatsApp
 * number named instead — a customer who cannot be given a link in Instagram can
 * still be given a number to message.
 */
export async function sendWithLinkFallback(
  creds: IgCreds,
  to: string,
  withLink: string,
  withoutLink: string,
): Promise<IgSendResult> {
  // Links go as tappable buttons (lib/instagram.ts), plain text if refused.
  const first = await sendTextWithButtons(creds, to, withLink);
  if (first.ok || !first.linkBlocked) return first;

  console.warn(
    `[ig bot] links are blocked for @${handleForAccount(creds.accountId)} — ` +
    `sending the link-free version. Resolve at Instagram → Settings → Account Status.`
  );
  return sendText(creds, to, withoutLink);
}

// ── The conversation ─────────────────────────────────────────────────────────

/**
 * Store the photo and start the shoot.
 *
 * Split out so it can be reached from either direction: the photo arriving
 * after the look, or the look arriving after the photo. The booking goes
 * through the marketplace route with the internal secret, the same door the
 * WhatsApp bot uses, so price, fees and template rules cannot drift from the
 * web checkout.
 */
async function bookIt(
  creds: IgCreds,
  session: IgSession,
  paths: string[],
  contentType: string,
  bytes: number,
): Promise<void> {
  const to = session.ig_user_id;
  const userId = await ensureUser(session);
  // Ten is the booking route's ceiling for this template. Anything past it
  // would be silently trimmed there, and silently losing a customer's
  // photograph is the whole fault being fixed.
  const shots = paths.filter(Boolean).slice(0, MAX_BATCH);
  if (shots.length === 0) return;

  await sendText(creds, to, shots.length === 1
    ? "Got it. Setting that up now, one moment\u2026"
    : `Got all ${shots.length}. Setting them up now, one moment\u2026`);

  const booking = await fetch(`${SITE_URL}/api/marketplace/${session.template_id}/book`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
      "x-act-as-user": userId,
    },
    body: JSON.stringify({
      // One order covering every photograph they sent. This template prices per
      // photo, so the route works the total out itself — the bot never
      // multiplies anything, which is how the charge and the count stay in
      // agreement.
      packageSize: shots.length,
      currency: "NGN",
      // The look travels in lightingByPath keyed by the photo's storage path.
      // Putting a real look id in `enhance.lighting` is silently discarded --
      // that field only accepts the built-in rig presets -- and the booking
      // comes back "Pick a lighting look" with one plainly chosen.
      // Every photo in the batch gets the same look: it is the look they asked
      // for in the comment or the chat, and nothing has offered them a second.
      // Glow Retouch has no look: the retouch worker decides what each photo needs.
      ...(isRetouchSession(session) ? {} : {
        enhance: {
          lightingByPath: Object.fromEntries(shots.map(p => [p, session.look_option_id])),
        },
      }),
      identityRefs: shots.map((p, i) => ({
        id: crypto.randomUUID(),
        name: `Instagram ${i + 1}`,
        type: contentType || "image/jpeg",
        size: bytes || 1,
        storageBucket: "identity-images",
        storagePath: p,
      })),
    }),
  }).then(r => r.json()).catch(e => ({ error: String(e) }));

  // Both spellings of the id are accepted: looking for only one of them once
  // reported a booking that had SUCCEEDED as a failure and abandoned a paying
  // customer.
  const shootId = (booking?.shootId ?? booking?.shoot?.id) as string | undefined;
  const payUrl = booking?.authorizationUrl as string | undefined;

  if (!shootId) {
    console.error("[ig bot] booking failed:", JSON.stringify(booking).slice(0, 400));
    await sendText(creds, to,
      "Something went wrong setting that up. Send *support* and a human will pick it up.");
    return;
  }

  // The recipient goes on the SHOOT, not just the session. A customer who sends
  // a second photo while the first is generating would otherwise overwrite
  // session.shoot_id and orphan the first one - paid for, finished, and
  // invisible to the poller forever.
  await sql`
    UPDATE shoots SET ig_user_id = ${session.ig_user_id}, ig_account_id = ${session.ig_account_id}
    WHERE id = ${shootId}`;

  await patchSession(session.id, {
    state: payUrl ? "AWAITING_PAYMENT" : "GENERATING",
    shoot_id: shootId,
    // Emptied, not kept. The batch is closed the moment its link goes out, so
    // the next photograph starts a fresh one instead of being quietly added to
    // an order the customer has already been quoted a price for.
    source_paths: [],
  });

  // Asked BEFORE they pay, not after.
  //
  // It used to ride on the payment-landed message, so a customer who paid and
  // closed the app was never asked at all - and they are exactly the person a
  // failed shoot leaves unreachable. Asking here also puts it in front of them
  // while they are deciding, which is when the reason makes sense.
  const askEmail = await needsContactEmail(userId).catch(() => false);

  if (!payUrl) {
    // No link means the booking route settled it: from the wallet, or free (a
    // grant, e.g. the studio's own test account).
    await sendText(creds, to,
      (booking?.free ? "No charge for this one \u2705 " : "Paid from your balance \u2705 ") +
      (isRetouchSession(session)
        ? "Retouching your photo now \u2014 usually a few minutes."
        : "Making your photo now \u2014 about two minutes."));
    if (askEmail) await sendText(creds, to, CONTACT_EMAIL_ASK);
    return;
  }

  // What they are paying, and for how many. The total comes from the booking
  // route, never multiplied here — a price the bot works out itself is a price
  // that can disagree with the one actually charged.
  const n = shots.length;
  const total = Number(booking?.amountNgn ?? booking?.amount ?? 0) || (isRetouchSession(session) ? RETOUCH_PRICE_NGN : RELIGHT_PRICE_NGN) * n;
  const forWhat = n === 1 ? "this photo" : `these ${n} photos`;

  await sendWithLinkFallback(creds, to,
    `Ready. ${naira(total)} for ${forWhat}:\n\n${payUrl}\n\n` +
    `Pay and I'll send ${n === 1 ? "the finished picture" : "all of them"} straight back here.`,
    // Link-blocked: Instagram will not carry a URL for this account right now,
    // so the customer is given the number rather than left with nothing.
    `Ready \u2014 ${naira(total)} for ${forWhat}.\n\n` +
    `Instagram won't let me send payment links right now, so message me on ` +
    `WhatsApp on ${WA_NUMBER} and send *${isRetouchSession(session) ? "support" : (session.look_name?.match(/^\d+/)?.[0] ?? "the number")}* \u2014 ` +
    `I'll pick it straight up there and you'll have it in a couple of minutes.`
  );

  if (askEmail) await sendText(creds, to, CONTACT_EMAIL_ASK);
}

/**
 * Someone picked a look, by commenting a number or typing one in the chat.
 *
 * If a photo is already waiting -- they sent the picture first, which is what
 * anyone who arrived through LIGHT does -- the shoot starts immediately instead
 * of asking for it again.
 */
export async function offerLook(
  creds: IgCreds,
  session: IgSession,
  n: number,
): Promise<boolean> {
  const look = await findLookByNumber(n).catch(() => null);
  if (!look) return false;

  await patchSession(session.id, {
    state: "COLLECTING_PHOTO",
    template_id: look.templateId,
    look_option_id: look.lookId,
    look_name: look.lookName,
  });
  const armed: IgSession = {
    ...session,
    template_id: look.templateId,
    look_option_id: look.lookId,
    look_name: look.lookName,
  };

  // Photographs already in hand from before the look was chosen — every one of
  // them, not just the first. Somebody who sends three pictures and then the
  // look number means all three.
  const waiting = session.state === "COLLECTING_LOOK" ? await freshHeld(session.source_paths ?? []) : [];
  if (waiting.length > 0) {
    await patchSession(session.id, { state: "CONFIRMING_BATCH" });
    await sendText(creds, session.ig_user_id,
      `*${prettyLook(look.lookName)}* it is \u2014 look ${n}. I have ` +
      `*${waiting.length} photo${waiting.length === 1 ? "" : "s"}* ` +
      `(${naira(RELIGHT_PRICE_NGN * waiting.length)}).\n\n` +
      `Are these all the pictures you want relit? Reply *yes* and I'll send one payment ` +
      `link for all of them, or just send the rest.`);
    return true;
  }

  // THREE WAYS TO BUY, every time a look is offered.
  //
  // The chat is the fastest and stays first, but not everyone wants to send a
  // photograph to an Instagram account they met through an advert: some would
  // rather use WhatsApp, and some would rather pay on a website they can see.
  // Naming all three costs one message and removes the reason to stop.
  //
  // Sent through sendWithLinkFallback because the third option is a URL, and a
  // DM carrying a link is refused outright while the account is under a link
  // restriction (error 2534122). The fallback keeps the other two routes rather
  // than losing the whole reply.
  // wa.me carries the look number in the URL, so WhatsApp opens with "197"
  // already typed. Without it the customer arrives in a second bot having lost
  // the only piece of context that matters and has to start again.
  const waLink = `https://wa.me/${WA_NUMBER}?text=${n}`;
  // Instagram shrinks photos sent in a DM, so the chat option carries the
  // full-quality upload page too. Only in the linked version: the no-link
  // fallback below exists because links are being refused.
  const upLink = await uploadLinkFor("instagram", session.id);
  const opening =
    `That's *${prettyLook(look.lookName)}* \u2014 look ${n}. \ud83d\udc47\n\n` +
    `${naira(RELIGHT_PRICE_NGN)} for one photo. Three ways to do it \u2014 ` +
    `whichever suits you:\n\n` +
    `1\ufe0f\u20e3 *Right here* \u2014 send me the photo in this chat. Instagram shrinks ` +
    `photos sent here, so for full quality upload the original instead: ${upLink}\n` +
    `2\ufe0f\u20e3 *WhatsApp* \u2014 ${waLink}\n`;
  const closing =
    `\n\nQuickest is right here: send the picture \u2014 the dark club, the dim ` +
    `restaurant, the badly lit hall \u2014 and I'll take it from there.`;

  // The no-link version rebuilds BOTH options as plain text: option 2 is a
  // wa.me URL now, so reusing `opening` in the fallback would smuggle a link
  // into the message that exists precisely because links were refused.
  const openingNoLink =
    `That's *${prettyLook(look.lookName)}* \u2014 look ${n}. \ud83d\udc47\n\n` +
    `${naira(RELIGHT_PRICE_NGN)} for one photo. Three ways to do it \u2014 ` +
    `whichever suits you:\n\n` +
    `1\ufe0f\u20e3 *Right here* \u2014 send me the photo in this chat.\n` +
    `2\ufe0f\u20e3 *WhatsApp* \u2014 message ${WA_NUMBER} and send *${n}*.\n`;

  await sendWithLinkFallback(creds, session.ig_user_id,
    opening + `3\ufe0f\u20e3 *Online* \u2014 ${SITE_URL}` + closing,
    openingNoLink + `3\ufe0f\u20e3 *Online* \u2014 aluxartandframes.shop` + closing,
  );
  return true;
}

/**
 * A photo arrived.
 *
 * If a look is already chosen the shoot starts. If not, the photo is KEPT and
 * the number asked for -- it used to be discarded, so a customer who sent the
 * picture first was asked for a look, then asked for the picture again.
 */
export async function handlePhoto(
  creds: IgCreds,
  session: IgSession,
  attachmentUrl: string,
): Promise<void> {
  const media = await downloadAttachment(attachmentUrl);
  if (!media) {
    await sendText(creds, session.ig_user_id, "That image didn't come through. Could you send it once more?");
    return;
  }
  await acceptInstagramPhoto(creds, session, media, { notify: true, viaUpload: false });
}

/**
 * A photo is in hand — from the chat (handlePhoto) or from the full-quality
 * upload page (/d/up/<token>). Same order, same batch, same replies; the only
 * differences are where it came from and, for an upload of several files, that
 * only the last one says the running count, so five uploads are one message.
 */
export async function acceptInstagramPhoto(
  creds: IgCreds,
  session: IgSession,
  media: { buffer: Buffer; contentType: string },
  opts: { notify: boolean; viaUpload: boolean },
): Promise<{ held: number }> {
  const to = session.ig_user_id;
  const say = async (text: string, withLink?: string) => {
    if (!opts.notify) return;
    if (withLink) await sendWithLinkFallback(creds, to, text + withLink, text);
    else await sendText(creds, to, text);
  };

  const userId = await ensureUser(session);
  const ext = media.contentType.includes("png") ? "png" : media.contentType.includes("webp") ? "webp" : media.contentType.includes("heic") ? "heic" : "jpg";
  const path = opts.viaUpload
    ? `${userId}/${crypto.randomUUID()}-upload.${ext}`
    : `${userId}/${crypto.randomUUID()}-instagram.jpg`;
  await r2Upload("identity-images", path, media.buffer, media.contentType);
  await sql`
    INSERT INTO identity_images (user_id, name, type, size, storage_bucket, storage_path, created_at, last_used_at)
    VALUES (${userId}, ${opts.viaUpload ? "Instagram upload" : "Instagram photo"}, ${media.contentType},
            ${media.buffer.byteLength}, 'identity-images', ${path}, NOW(), NOW())`;

  // Said once, on the first photo of a batch sent in the chat: Instagram has
  // already shrunk it (median 0.1 MB, measured 14 Oct 2026), and the customer
  // can still swap in the original before paying.
  const shrinkNote = async () => opts.viaUpload ? "" :
    `\n\n📷 Instagram shrinks photos sent in chat. For full quality, upload the ` +
    `original here instead: ${await uploadLinkFor("instagram", session.id)}`;

  // A photograph arriving after a link has gone out belongs to a NEW order. The
  // previous one is already priced and waiting to be paid, and quietly adding
  // to it would make the amount they were quoted wrong.
  const closed = session.state === "AWAITING_PAYMENT" || session.state === "GENERATING";
  const held = closed ? [] : await freshHeld(session.source_paths ?? []);

  if (!session.look_option_id || !session.template_id) {
    const all = [...held, path];
    await patchSession(session.id, { state: "COLLECTING_LOOK", source_paths: all });
    await say(
      (all.length === 1
        ? `Lovely \u2014 I've got your photo. Which light do you want on it?`
        : `Lovely \u2014 I've got *${all.length} photos*. Which light do you want on them?`) +
      `\n\nSend me the number from the post (for example *69* or *197*) and I'll get started.`,
      held.length === 0 ? await shrinkNote() : undefined);
    return { held: all.length };
  }

  const batch = [...held, path].slice(0, MAX_BATCH);
  await patchSession(session.id, { state: "CONFIRMING_BATCH", source_paths: batch, shoot_id: null });

  if (batch.length >= MAX_BATCH) {
    // Always said, even mid-upload: the booking below sends a payment link,
    // and the customer must know why it came.
    await sendText(creds, to,
      `That's ${MAX_BATCH} photos \u2014 the most I can do in one go. Setting them up now\u2026`);
    await bookIt(creds, { ...session, source_paths: batch }, batch,
                 media.contentType, media.buffer.byteLength);
    return { held: batch.length };
  }

  // The count is said out loud every time on purpose. Photographs were being
  // dropped silently, and a running total is how a customer notices one of
  // theirs never arrived.
  await say(
    `Got it \u2014 that's *${batch.length} photo${batch.length === 1 ? "" : "s"}* so far ` +
    `(${naira((isRetouchSession(session) ? RETOUCH_PRICE_NGN : RELIGHT_PRICE_NGN) * batch.length)}).\n\n` +
    `Are these all the pictures you want ${doneWord(session)}? Reply *yes* and I'll send one payment link ` +
    `for all of them, or just send the rest.`,
    batch.length === 1 ? await shrinkNote() : undefined);
  return { held: batch.length };
}

/**
 * They answered the "are these all?" question.
 *
 * Yes books the whole batch as one order. Anything else leaves the batch alone
 * and invites the rest — nothing is charged, so there is no harm in waiting.
 */
export async function confirmBatch(
  creds: IgCreds,
  session: IgSession,
  yes: boolean,
): Promise<void> {
  const batch = await freshHeld(session.source_paths ?? []);
  if (batch.length === 0) {
    await patchSession(session.id, { state: "COLLECTING_PHOTO" });
    await sendText(creds, session.ig_user_id,
      `I don't have any photos held for you. Send the picture you want ${doneWord(session)} and I'll get started.`);
    return;
  }
  if (!yes) {
    await sendText(creds, session.ig_user_id,
      "No problem \u2014 send the rest, and tell me when you're done.");
    return;
  }
  await bookIt(creds, session, batch, "image/jpeg", 1);
}

/** The finished pictures, into the same chat that ordered them. */
export async function deliverShoot(
  creds: IgCreds,
  to: string,
  urls: string[],
): Promise<{ sent: number; failed: number }> {
  let sent = 0, failed = 0;
  for (const url of urls) {
    const res = await sendImage(creds, to, url);
    if (res.ok) sent++;
    else { failed++; console.error("[ig bot] image send failed:", res.error.slice(0, 200)); }
  }
  return { sent, failed };
}

export { credsForAccount };

/**
 * Arm a conversation with the look someone just asked for in a comment.
 *
 * Called after the private reply goes out, so that when they answer with a
 * photo the bot already knows which light to put on it. Without this the reply
 * says "send me your photo" and the next message is met with "which light?",
 * which is exactly the loop this bot exists to avoid.
 *
 * Only ever moves an idle conversation. Someone mid-booking who comments a
 * number on an old post must not have their in-flight shoot overwritten.
 */
export async function armLookSession(
  igAccountId: string,
  igUserId: string,
  username: string | undefined,
  n: number,
): Promise<void> {
  const look = await findLookByNumber(n).catch(() => null);
  if (!look) return;

  const session = await loadSession(igAccountId, igUserId, username);
  if (!["IDLE", "COLLECTING_PHOTO", "DONE"].includes(session.state)) return;

  await patchSession(session.id, {
    state: "COLLECTING_PHOTO",
    template_id: look.templateId,
    look_option_id: look.lookId,
    look_name: look.lookName,
    shoot_id: null,
    source_paths: [],
  });
}
