import "server-only";
import sql from "@/lib/db";
import { r2Upload } from "@/lib/r2";
import { createServiceClient } from "@/lib/supabase-server";
import { SITE_URL } from "@/lib/site-url";
import { findLookByNumber } from "@/lib/whatsapp-triggers";
import { needsContactEmail, CONTACT_EMAIL_ASK } from "@/lib/chat-contact-email";
import {
  sendText, sendImage, downloadAttachment, credsForAccount, handleForAccount,
  type IgCreds, type IgSendResult,
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
  user_id: string | null;
  payment_reference: string | null;
  last_inbound_at: Date;
};

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

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
  const first = await sendText(creds, to, withLink);
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
  path: string,
  contentType: string,
  bytes: number,
): Promise<void> {
  const to = session.ig_user_id;
  const userId = await ensureUser(session);

  await sendText(creds, to, "Got it. Setting that up now, one moment\u2026");

  const booking = await fetch(`${SITE_URL}/api/marketplace/${session.template_id}/book`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
      "x-act-as-user": userId,
    },
    body: JSON.stringify({
      packageSize: 1,
      currency: "NGN",
      // The look travels in lightingByPath keyed by the photo's storage path.
      // Putting a real look id in `enhance.lighting` is silently discarded --
      // that field only accepts the built-in rig presets -- and the booking
      // comes back "Pick a lighting look" with one plainly chosen.
      enhance: { lightingByPath: { [path]: session.look_option_id } },
      identityRefs: [{
        id: crypto.randomUUID(),
        name: "Instagram 1",
        type: contentType || "image/jpeg",
        size: bytes || 1,
        storageBucket: "identity-images",
        storagePath: path,
      }],
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
    source_paths: [path],
  });

  // Asked BEFORE they pay, not after.
  //
  // It used to ride on the payment-landed message, so a customer who paid and
  // closed the app was never asked at all - and they are exactly the person a
  // failed shoot leaves unreachable. Asking here also puts it in front of them
  // while they are deciding, which is when the reason makes sense.
  const askEmail = await needsContactEmail(userId).catch(() => false);

  if (!payUrl) {
    await sendText(creds, to, "Paid from your balance \u2705 Making your photo now \u2014 about two minutes.");
    if (askEmail) await sendText(creds, to, CONTACT_EMAIL_ASK);
    return;
  }

  await sendWithLinkFallback(creds, to,
    `Ready. ${naira(RELIGHT_PRICE_NGN)} for this photo:\n\n${payUrl}\n\n` +
    `Pay and I'll send the finished picture straight back here.`,
    // Link-blocked: Instagram will not carry a URL for this account right now,
    // so the customer is given the number rather than left with nothing.
    `Ready \u2014 ${naira(RELIGHT_PRICE_NGN)} for this photo.\n\n` +
    `Instagram won't let me send payment links right now, so message me on ` +
    `WhatsApp on ${WA_NUMBER} and send *${session.look_name?.match(/^\d+/)?.[0] ?? "the number"}* \u2014 ` +
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

  // A photo is already in hand from before the look was chosen.
  const waiting = session.state === "COLLECTING_LOOK" ? session.source_paths?.[0] : undefined;
  if (waiting) {
    await sendText(creds, session.ig_user_id,
      `*${prettyLook(look.lookName)}* it is \u2014 look ${n}. Working on the photo you sent\u2026`);
    await bookIt(creds, armed, waiting, "image/jpeg", 1);
    return true;
  }

  await sendText(creds, session.ig_user_id,
    `That's *${prettyLook(look.lookName)}* \u2014 look ${n}. \ud83d\udc47\n\n` +
    `Send me the photo you want relit, right here in this chat. ` +
    `Any picture you already have \u2014 the dark club, the dim restaurant, the badly lit hall.\n\n` +
    `${naira(RELIGHT_PRICE_NGN)} for one photo. I'll send it back to you here when it's done.`
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
  const to = session.ig_user_id;

  const media = await downloadAttachment(attachmentUrl);
  if (!media) {
    await sendText(creds, to, "That image didn't come through. Could you send it once more?");
    return;
  }

  const userId = await ensureUser(session);
  const path = `${userId}/${crypto.randomUUID()}-instagram.jpg`;
  await r2Upload("identity-images", path, media.buffer, media.contentType);
  await sql`
    INSERT INTO identity_images (user_id, name, type, size, storage_bucket, storage_path, created_at, last_used_at)
    VALUES (${userId}, ${"Instagram photo"}, ${media.contentType},
            ${media.buffer.byteLength}, 'identity-images', ${path}, NOW(), NOW())`;

  if (!session.look_option_id || !session.template_id) {
    await patchSession(session.id, { state: "COLLECTING_LOOK", source_paths: [path] });
    await sendText(creds, to,
      `Lovely \u2014 I've got your photo. Which light do you want on it?\n\n` +
      `Send me the number from the post (for example *69* or *197*) and I'll get started.`);
    return;
  }

  await bookIt(creds, session, path, media.contentType, media.buffer.byteLength);
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
