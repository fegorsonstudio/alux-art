import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { matchKeyword, lookNumberReply } from "@/lib/instagram-keywords";
import { findLookByNumber } from "@/lib/whatsapp-triggers";
import { sendText, credsForAccount, usernameForScopedId, ourHandles as ourIgHandles } from "@/lib/instagram";
import { loadSession, markInbound, offerLook, handlePhoto, prettyLook, armLookSession, patchSession, ensureUser } from "@/lib/instagram-bot";
import { tellAdmin, sendAdminImage } from "@/lib/telegram";
import {
  startGifFlow, handleGifPhoto, handleGifWords, handleGifPublish, isPostRequest,
  isGifCreateRequest, armGifSession,
} from "@/lib/instagram-gif";
import { handleMention, mentionTooOld } from "@/lib/instagram-mentions";
import sql from "@/lib/db";
import { signedMediaUrl } from "@/lib/media-url";
import { retouchPriceNgn } from "@/lib/retouch-pricing";
import type { IgCreds } from "@/lib/instagram";
import type { IgSession } from "@/lib/instagram-bot";
import { isEmailish, saveContactEmail, contactEmailSaved } from "@/lib/chat-contact-email";

/**
 * Instagram comment webhook — the "comment STUDIO and I'll send you the link" bot.
 *
 * GET  is Meta's one-time verification handshake when the webhook is saved.
 * POST is a comment event. If the comment contains a keyword, the commenter gets
 *      one private reply carrying the link.
 *
 * Instagram allows exactly ONE private reply per comment, within 7 days, and the
 * conversation only continues if they answer. So the reply has to be complete on
 * its own — there is no follow-up.
 *
 * Two things this deliberately does NOT do:
 *   - reply to our own accounts' comments, which would have the bot talking to
 *     itself every time the studio answers someone
 *   - retry a failed send, because a retry risks a duplicate DM and Instagram
 *     counts a duplicate against the per-hour limit
 */

export const dynamic = "force-dynamic";

const GRAPH = "https://graph.instagram.com/v23.0";

/** The look the promoted post is selling. Commenting LIGHT chooses it. */
const LIGHT_LOOK_NUMBER = 197;

/** Handles come from IG_ACCOUNTS so the bot never answers itself. */
function ourHandles(): Set<string> {
  return new Set(
    (process.env.IG_ACCOUNTS ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean)
  );
}

function tokenForAccountId(igUserId: string): string | null {
  for (const handle of (process.env.IG_ACCOUNTS ?? "").split(",").map(s => s.trim()).filter(Boolean)) {
    const key = handle.toUpperCase();
    if (process.env[`IG_${key}_ID`] === igUserId) return process.env[`IG_${key}_TOKEN`] ?? null;
  }
  return null;
}

// ── Meta's verification handshake ────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const verify = process.env.IG_WEBHOOK_VERIFY_TOKEN;
  if (!verify) {
    console.error("[ig webhook] IG_WEBHOOK_VERIFY_TOKEN not set — cannot verify");
    return new NextResponse("misconfigured", { status: 500 });
  }
  if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === verify) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

// ── Comment events ───────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const raw = await request.text();

  // Signature check. Without the app secret we refuse everything rather than
  // trust an unsigned payload — anyone could otherwise make the bot send DMs.
  const secret = process.env.IG_APP_SECRET;
  if (!secret) {
    console.error("[ig webhook] IG_APP_SECRET not set — rejecting");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }
  const sent = request.headers.get("x-hub-signature-256") ?? "";
  const expected = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  const ok = sent.length === expected.length &&
    timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
  if (!ok) {
    // Events ARE arriving and being dropped here, which is why no auto-DM has
    // ever gone out. Log enough to tell the two causes apart without ever
    // printing the secret: a mangled body (lengths/prefix differ oddly) versus
    // the wrong app secret (body fine, digests simply do not match). Meta signs
    // with the INSTAGRAM app secret, which is not the Facebook app secret —
    // that is the usual reason this fails.
    let accounts = "?";
    try {
      const peek = JSON.parse(raw) as { entry?: Array<{ id?: string }> };
      accounts = (peek.entry ?? []).map(e => e.id).join(",") || "none";
    } catch { accounts = "unparseable"; }
    console.warn(
      "[ig webhook] bad signature — ignoring." +
      ` bodyBytes=${Buffer.byteLength(raw)} entryIds=${accounts}` +
      ` sentPrefix=${sent.slice(0, 15)} computedPrefix=${expected.slice(0, 15)}` +
      ` secretLen=${secret.length}` +
      " — if the body parsed and only the digests differ, IG_APP_SECRET is the wrong app secret"
    );
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let body: {
    entry?: Array<{
      id?: string;
      changes?: Array<{ field?: string; value?: Record<string, unknown> }>;
      // Direct messages arrive on `messaging`, not `changes`. Same webhook, same
      // signature, different shape — a handler that only walks `changes` sees
      // nothing at all when someone replies to the DM it just sent.
      messaging?: Array<{
        sender?: { id?: string };
        recipient?: { id?: string };
        timestamp?: number;
        message?: {
          mid?: string;
          text?: string;
          is_echo?: boolean;
          attachments?: Array<{ type?: string; payload?: { url?: string } }>;
        };
      }>;
    }>;
  };
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: true }); }

  // Meta's exact payload. Comment text and public ids only — no tokens, no
  // secrets. Kept because the shape of `value` is what decides which id the
  // send API will accept, and guessing at it cost a day.
  console.log("[ig webhook] payload:", raw.slice(0, 1200));

  const mine = ourHandles();

  for (const entry of body.entry ?? []) {
    const igUserId = String(entry.id ?? "");

    // ── Direct messages ──────────────────────────────────────────────────────
    // The booking conversation. Runs before comments so a reply to our own DM
    // is never mistaken for anything else.
    for (const m of entry.messaging ?? []) {
      // Echoes are our own outbound messages coming back. Handling one would
      // have the bot answer itself in a loop.
      if (m.message?.is_echo) continue;

      // Read receipts, reactions and delivery confirmations arrive on the same
      // `messaging` array with NO message body. They must not be treated as the
      // customer speaking: `last_inbound_at` is what decides whether Instagram
      // will still accept a reply, so a ❤️ on an old message would make a
      // closed 24-hour window look open and the delivery would fail with the
      // customer none the wiser. Only real content counts.
      const hasContent = Boolean(
        m.message && (m.message.text || (m.message.attachments?.length ?? 0) > 0)
      );
      if (!hasContent) continue;

      const senderId = String(m.sender?.id ?? "");
      if (!senderId || senderId === igUserId) continue;

      try {
        await handleDirectMessage(igUserId, senderId, {
          text: m.message?.text,
          imageUrl: m.message?.attachments?.find(a => a.type === "image")?.payload?.url,
        });
      } catch (e) {
        console.error("[ig webhook] DM handling failed:", (e as Error).message);
      }
    }

    for (const change of entry.changes ?? []) {
      // ── @mentions on media we do NOT own ──────────────────────────────────
      // A different field with a different value shape, so it has to be taken
      // before the comments branch, which returns early on anything else.
      //
      // This is the only way we hear about our GIFs being used under other
      // accounts' posts. We can answer publicly and nothing more: Instagram's
      // private replies are scoped to comments on our own media, so there is no
      // DM to send here. The reply has to carry the instruction.
      if (change.field === "mentions") {
        const v = change.value ?? {};
        const mediaId = v.media_id ? String(v.media_id) : null;
        const commentId = v.comment_id ? String(v.comment_id) : null;
        const mText = String(v.text ?? "");
        const mFrom = ((v.from ?? {}) as { username?: string }).username ?? null;

        if (mentionTooOld(v.timestamp as number | undefined)) {
          console.log("[ig mentions] too old to answer, skipping");
          continue;
        }
        const token = tokenForAccountId(igUserId);
        if (!token) { console.warn("[ig mentions] no token for account", igUserId); continue; }

        try {
          await handleMention(
            { igAccountId: igUserId, mediaId, commentId, text: mText, fromUsername: mFrom },
            token,
            mine,
          );
        } catch (e) {
          console.error("[ig mentions] handling failed:", (e as Error).message);
        }
        continue;
      }

      if (change.field !== "comments") continue;
      const v = change.value ?? {};
      const commentId = String(v.id ?? "");
      const text = String(v.text ?? "");
      const from = (v.from ?? {}) as { id?: string; username?: string };

      if (!commentId || !text) continue;
      // Never answer ourselves. Worth logging: testing the automation by
      // commenting from the account that owns the post is the obvious thing to
      // try, and it can never work — Instagram usually does not even deliver a
      // webhook for the owner's own comment. Test from a personal account.
      if (from.username && mine.has(from.username.toLowerCase())) {
        console.log(`[ig webhook] ignoring our own comment from @${from.username} — test from a different account`);
        continue;
      }

      // A bare lighting look number, from a carousel slide that asked for one.
      //
      // Strict on purpose: ONLY a comment that is nothing but digits. Matching
      // any comment CONTAINING a number would fire on "I have 2 kids" and DM a
      // stranger about lighting look 2. A number naming no real look falls
      // through to the word matching below and then to silence, exactly as now.
      // Remembered so the session can be armed with this look after the reply
      // lands, which is what lets their next message be just a photo.
      let numberAsked: number | null = null;
      let keyword = /^\s*\d{1,3}\s*$/.test(text)
        ? await (async () => {
            const n = Number(text.trim());
            const look = await findLookByNumber(n).catch(() => null);
            if (!look) {
              console.log(`[ig webhook] @${from.username ?? from.id} commented ${n} — no look with that number`);
              return null;
            }
            console.log(`[ig webhook] @${from.username ?? from.id} asked for look ${n}: ${look.lookName}`);
            numberAsked = n;
            return lookNumberReply(n, look.lookName);
          })()
        : null;

      keyword ??= matchKeyword(text);
      if (!keyword) {
        console.log(`[ig webhook] comment from @${from.username ?? from.id} matched no keyword: ${text.slice(0, 60)}`);
        continue;
      }

      const token = tokenForAccountId(igUserId);
      if (!token) { console.warn("[ig webhook] no token for account", igUserId); continue; }

      try {
        // The private reply: one message, addressed to the comment.
        const send = (body: string) => fetch(`${GRAPH}/${igUserId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipient: { comment_id: commentId },
            message: { text: body },
            access_token: token,
          }),
        }).then(x => x.json());

        let r = await send(keyword.reply);

        // Instagram drops the entire message when the account is under a link
        // restriction. It reports that as "Invalid message id", which points at
        // the wrong thing entirely — the real reason is only in error_subcode
        // 2534122 / error_user_title "Link can't be shared". Retry without the
        // URL so the commenter gets a useful reply instead of silence.
        if (r.error && keyword.replyNoLink) {
          const linkBlocked =
            r.error.error_subcode === 2534122 ||
            /link can'?t be shared|share links/i.test(
              `${r.error.error_user_title ?? ""} ${r.error.error_user_msg ?? ""}`
            );
          if (linkBlocked) {
            console.warn(
              `[ig webhook] links are blocked for this account — sending the ` +
              `link-free reply to @${from.username ?? from.id}. ` +
              `Resolve at Instagram → Settings → Account Status.`
            );
            r = await send(keyword.replyNoLink);
          }
        }

        if (r.error) {
          console.error(
            "[ig webhook] private reply failed:",
            JSON.stringify(r.error).slice(0, 400),
            "| commentId used:", commentId
          );
        } else {
          console.log(`[ig webhook] sent "${keyword.word}" to @${from.username ?? from.id}`);

          // Arm the conversation with the look they asked for, so the photo they
          // send next is relit with it rather than answered by "which light?".
          //
          // Best effort by design: the comment author's id is not guaranteed to
          // be the same scoped id the messaging API uses, and if it is not, the
          // DM handler simply asks for the number. Nothing here can break the
          // reply that has already been sent.
          // LIGHT is the promoted post's keyword and that post is look 197, so
          // it arms the same way a number does. Without this the reply says
          // "send me your photo" and the photo is met with "which light?".
          const armWith = numberAsked ?? (keyword.word === "LIGHT" ? LIGHT_LOOK_NUMBER : null);
          if (armWith && from.id) {
            await armLookSession(igUserId, String(from.id), from.username, armWith)
              .catch(e => console.warn("[ig webhook] could not arm session:", (e as Error).message));
          }
          // GIF is armed the same way, but into its own flow: the reply just
          // asked for the before picture, so the session has to be expecting it.
          if (keyword.word === "GIF" && from.id) {
            await armGifSession(igUserId, String(from.id), from.username)
              .catch(e => console.warn("[ig webhook] could not arm gif session:", (e as Error).message));
          }
          // A public acknowledgement so other readers see it worked. Best effort:
          // the DM is the product, this is decoration.
          if (keyword.publicReply) {
            await fetch(`${GRAPH}/${commentId}/replies`, {
              method: "POST",
              body: new URLSearchParams({ message: keyword.publicReply, access_token: token }),
            }).catch(() => {});
          }
        }
      } catch (e) {
        console.error("[ig webhook] send error:", e instanceof Error ? e.message : String(e));
      }
    }
  }

  // Always 200. Meta retries non-200 responses, and a retry here means a second
  // DM to someone who already got one.
  return NextResponse.json({ ok: true });
}

/**
 * One inbound direct message.
 *
 * The whole booking lives here: pick a look by number, send the photo, pay, and
 * the finished picture comes back to this same chat. Nobody is handed off to
 * WhatsApp unless Instagram itself refuses to carry the payment link.
 *
 * Kept deliberately forgiving about what a person types. Someone arriving from
 * a carousel comment is mid-scroll, not filling in a form.
 */
/**
 * The buyer wants the photo we just made them retouched by hand.
 *
 * Deliberately the same shape as the WhatsApp handler: record the order, put
 * the actual files in front of the person who does the work over Telegram, and
 * charge NOTHING yet. Retouching happens by hand afterwards and the buyer pays
 * to unlock the finished files; billing first would take money for work that
 * does not exist.
 *
 * The shoot comes from the session, and a session that has moved on to another
 * booking is the normal case rather than an error — so it says which shoot it
 * is acting on rather than assuming the customer knows.
 */
async function requestRetouch(creds: IgCreds, session: IgSession, senderId: string) {
  if (!session.shoot_id) {
    await sendText(creds, senderId,
      "I can only retouch a photo from a finished shoot. Send a look number and a " +
      "photo to start one.");
    return;
  }

  const images = await sql<{ id: string; b: string | null; p: string | null }[]>`
    SELECT id, download_storage_bucket AS b, download_storage_path AS p
    FROM shoot_images
    WHERE shoot_id = ${session.shoot_id} AND status = 'COMPLETE' AND download_storage_path IS NOT NULL
    ORDER BY slot`;

  if (!images.length) {
    await sendText(creds, senderId, "That shoot has no finished photo to retouch yet.");
    return;
  }

  const price = retouchPriceNgn(images.length);

  const [existing] = await sql<{ status: string }[]>`
    SELECT status FROM shoot_retouch WHERE shoot_id = ${session.shoot_id}`;
  if (existing) {
    await sendText(creds, senderId,
      "You have already asked for that one — I'm on it. I'll send it here when it's done.");
    return;
  }

  await sql`
    INSERT INTO shoot_retouch (shoot_id, status, price_ngn, image_count, created_at, updated_at)
    VALUES (${session.shoot_id}, 'REQUESTED', ${price}, ${images.length}, NOW(), NOW())
    ON CONFLICT (shoot_id) DO NOTHING`;
  for (const img of images) {
    await sql`
      INSERT INTO shoot_retouch_items (shoot_id, image_id) VALUES (${session.shoot_id}, ${img.id})
      ON CONFLICT (shoot_id, image_id) DO NOTHING`;
  }

  await sendText(creds, senderId,
    `Nice one 👍 ${images.length} image${images.length === 1 ? "" : "s"} going for retouching — ` +
    `*₦${price.toLocaleString("en-NG")}* in total.\n\n` +
    "Nothing to pay yet. This is done by hand, so it isn't instant — when it's ready " +
    "I'll tell you here and send a payment link, and the photo comes through as soon as you pay.\n\n" +
    "Instagram closes a chat 24 hours after your last message, so send me your email " +
    "and I can reach you either way.");

  // The studio's copy of the job.
  void (async () => {
    await tellAdmin(
      `<b>Retouch requested (Instagram)</b>\n` +
      `${images.length} image(s) — ₦${price.toLocaleString("en-NG")}\n` +
      `Customer: @${session.ig_username ?? senderId}\n` +
      `Shoot: <code>${session.shoot_id}</code>\n\n` +
      `Reply to THIS message with the edited file(s) to send them back.`
    );
    for (const img of images) {
      if (!img.p) continue;
      const url = await signedMediaUrl(img.b ?? "generated-4k", img.p, { expiresIn: 24 * 3600 }).catch(() => null);
      if (url) await sendAdminImage(url, `Shoot <code>${session.shoot_id}</code>`);
    }
  })().catch((e) => console.error("[ig] telegram notify failed:", e instanceof Error ? e.message : e));
}

/**
 * A message this bot has nothing to say to.
 *
 * The bot used to answer EVERY direct message: anything it did not recognise
 * fell through to "Hello 👋 I'm an automated assistant", sent again and again to
 * the same person for ever. On an account that runs ads and receives ordinary
 * conversation that reads as spam, and the reputation being spent is the
 * business's own.
 *
 * So it says nothing. The studio is told instead, because a real question from
 * a real customer must not simply vanish — silence towards the sender is the
 * feature, silence towards the owner would be a bug.
 *
 * THROTTLED TO ONE NOTE PER PERSON PER HOUR, and that is not decoration. An
 * earlier version of this bot sent 276 identical Telegram alerts about one
 * customer until the chat was muted, which also mutes the next real one.
 * Someone typing "hi", then "hello", then "are you there" is one note.
 */
const IGNORE_ALERT_GAP_MS = 60 * 60 * 1000;

async function ignoreQuietly(
  session: IgSession,
  what: string,
  opts: { failedTrigger?: boolean } = {},
): Promise<void> {
  const who = session.ig_username ? `@${session.ig_username}` : session.ig_user_id;
  console.log(`[ig bot] ignored ${who} (${session.state}): ${what.slice(0, 120)}`);

  const last = session.last_ignored_alert_at ? new Date(session.last_ignored_alert_at).getTime() : 0;
  // A trigger that broke is always worth waking someone for — it means a
  // customer typed the right thing and got nothing back.
  if (!opts.failedTrigger && Date.now() - last < IGNORE_ALERT_GAP_MS) return;

  await patchSession(session.id, { last_ignored_alert_at: new Date() }).catch(() => {});
  await tellAdmin(
    (opts.failedTrigger
      ? `⚠️ <b>Instagram — a trigger did not work</b>\n`
      : `💬 <b>Instagram DM the bot ignored</b>\n`) +
    `From: ${who}\n` +
    `State: ${session.state}\n` +
    `Said: ${what.slice(0, 300)}\n\n` +
    (opts.failedTrigger
      ? `They typed something the bot should have handled. Worth answering by hand.`
      : `No reply was sent. Answer in Instagram if it deserves one.`)
  ).catch(() => {});
}

async function handleDirectMessage(
  igAccountId: string,
  senderId: string,
  msg: { text?: string; imageUrl?: string },
): Promise<void> {
  const creds = credsForAccount(igAccountId);
  if (!creds) { console.warn("[ig bot] no credentials for account", igAccountId); return; }

  let session = await loadSession(igAccountId, senderId);

  // Never answer one of our own accounts.
  //
  // @aluxartandframes messaged @fegorson_studio, each bot replied to the other,
  // and the loop only stopped when one account blocked the other. The DM
  // payload carries a scoped id and no username, so the handle check the
  // comment path uses is no help — the name has to be looked up.
  //
  // Resolved once and cached on the session, so this costs one API call per
  // person rather than one per message.
  if (!session.ig_username) {
    const username = await usernameForScopedId(creds, senderId);
    if (username) {
      await patchSession(session.id, { ig_username: username });
      session = { ...session, ig_username: username };
    }
  }
  if (session.ig_username && ourIgHandles().has(session.ig_username.toLowerCase())) {
    console.log(`[ig bot] ignoring @${session.ig_username} — that is one of our own accounts`);
    return;
  }

  await markInbound(session.id, msg.text ?? (msg.imageUrl ? "[photo]" : null));

  // Engaged: they have chosen a look, or are mid-booking, or have bought before.
  // The comment webhook arms a session with a look BEFORE the chat is ever
  // opened, so anyone arriving through the real funnel is engaged by the time
  // they reach here.
  const engaged = session.state !== "IDLE"
    || session.look_option_id !== null
    || session.shoot_id !== null;

  // A photo is an instruction on its own — it means "do the look we agreed" —
  // but only from someone we are already in a conversation with. Checked BEFORE
  // handlePhoto, which downloads the attachment, uploads it to R2, creates a
  // profile and writes an identity_images row: none of which should happen
  // because a stranger sent an unsolicited picture.
  if (msg.imageUrl) {
    if (!engaged) {
      await ignoreQuietly(session, "[sent a photo, no look chosen]");
      return;
    }
    // Mid-GIF, a picture is the before or the after rather than something to
    // relight. Returns false when this session is not making a GIF, so the
    // relight path below is untouched.
    if (await handleGifPhoto(creds, session, msg.imageUrl)) return;
    await handlePhoto(creds, session, msg.imageUrl);
    return;
  }

  const text = (msg.text ?? "").trim();
  if (!text) return;

  // ── The in-chat GIF maker ─────────────────────────────────────────────────
  // Checked first, and only while that conversation is actually running. While
  // someone is typing the words for their own GIF, their lines are theirs: a
  // line reading "different light" must become a caption, not a booking for
  // look 197, and "done" must end the list rather than mean nothing.
  if (session.state === "GIF_WORDS") {
    await handleGifWords(creds, session, text);
    return;
  }
  // "upload my gif" reaches here in the publish state and means a NEW one, so
  // it is taken out of the publish branch's way before that branch runs.
  if (session.state === "GIF_PUBLISH" && !isGifCreateRequest(text) && isPostRequest(text)) {
    await handleGifPublish(creds, session, text);
    return;
  }
  if (session.state === "GIF_BEFORE" || session.state === "GIF_AFTER") {
    // Anything but a picture at this point, except the trigger word itself
    // which restarts cleanly below.
    if (!/\bgif\b/i.test(text)) {
      await sendText(creds, senderId,
        session.state === "GIF_BEFORE"
          ? "Send me the BEFORE picture as a photo in this chat and we'll carry on."
          : "Send me the AFTER picture as a photo in this chat and we'll carry on.");
      return;
    }
  }

  // The trigger word, anywhere in the message.
  //
  // Matched loosely for the same reason LIGHT is: an ad or a comment reply
  // drops people here with the word pre-filled, and what arrives is not always
  // the bare word. It is checked before the look matchers so "gif" cannot be
  // swallowed by something else.
  if (/\bgifs?\b/i.test(text) || /\bsticker\b/i.test(text)) {
    await startGifFlow(creds, session);
    return;
  }


  // A bare number is a look. Matched strictly so "I have 2 kids" cannot book
  // anything — the same guard the comment path already carries.
  const asNumber = /^\s*(\d{1,3})\s*$/.exec(text);
  if (asNumber) {
    const n = Number(asNumber[1]);
    if (await offerLook(creds, session, n)) return;
    await sendText(creds, senderId,
      `I couldn't find look ${n}. The number is on the picture in the post — ` +
      `send me that and I'll set it up.`);
    return;
  }

  // An address, typed bare or after "email". Accepted in any state, because it
  // is asked for mid-booking and must not derail whatever they were doing.
  const emailed = /^(?:email\s+)?(\S+@\S+\.\S+)$/i.exec(text);
  if (emailed && isEmailish(emailed[1])) {
    const userId = session.user_id ?? await ensureUser(session).catch(() => null);
    if (userId && await saveContactEmail(userId, emailed[1])) {
      await sendText(creds, senderId, contactEmailSaved(emailed[1].trim().toLowerCase()));
    } else {
      await sendText(creds, senderId, "I couldn't save that one — could you check it and send it again?");
    }
    return;
  }

  // LIGHT typed in the chat, not just commented on the post.
  //
  // Matched as a WORD ANYWHERE in the message, not as the whole message. A paid
  // ad drops people into this chat with the word pre-filled by Meta's chat
  // template, and what actually arrives is not always the bare word: it can be
  // padded, punctuated, or typed by hand as "light please". An exact match sent
  // all of those to silence, and silence on a click that cost money is the
  // worst outcome this bot has.
  if (/\blight\b/i.test(text)) {
    if (await offerLook(creds, session, LIGHT_LOOK_NUMBER)) return;
    // It used to fall through to the greeting, which at least said something.
    // Now it would fall through to silence, so the studio is told instead: the
    // customer typed the right word and the look could not be found.
    await ignoreQuietly(session, text, { failedTrigger: true });
    return;
  }

  // Same words the WhatsApp bot accepts, because a customer who has used both
  // should not have to learn two vocabularies.
  // STEM, not exact word. A customer typed "Retouched" and the anchored version
  // did not match, so quiet mode swallowed it and she got silence on a request
  // to spend money — the studio had to answer her by hand. Nothing reached
  // Telegram either, because the handler never ran at all.
  //
  // "edit" stays anchored: it is a common word and matching it loosely would
  // hijack "I need to edit my caption".
  if (/\bretouch(ed|ing)?\b/i.test(text)
      || /^edit( my (photos?|images?))?$/i.test(text)) {
    await requestRetouch(creds, session, senderId);
    return;
  }

  if (/^(support|help|human)$/i.test(text)) {
    await sendText(creds, senderId,
      "I've passed this to the studio — a person will reply here shortly. " +
      "If it's urgent, WhatsApp 2349076858017.");
    await tellAdmin(
      `📸 Instagram support request from @${session.ig_username ?? senderId}\n` +
      `State: ${session.state}${session.shoot_id ? ` · shoot ${session.shoot_id.slice(0, 8)}` : ""}`
    ).catch(() => {});
    return;
  }

  // Waiting on a photo: say so rather than restating the whole offer, which is
  // what made the WhatsApp bot loop at a customer who asked a question.
  if (session.state === "COLLECTING_PHOTO") {
    await sendText(creds, senderId,
      `Send the photo you want relit as a picture in this chat and I'll apply ` +
      `*${session.look_name ? prettyLook(session.look_name) : "that look"}* to it.`);
    return;
  }

  if (session.state === "AWAITING_PAYMENT") {
    await sendText(creds, senderId,
      "Your photo is ready to go as soon as the payment lands — the link is just above. " +
      "Send *support* if you'd rather a person helped.");
    return;
  }

  if (session.state === "GENERATING") {
    await sendText(creds, senderId, "Still working on it — it'll land here in a couple of minutes.");
    return;
  }

  // Delivered, and they were asked whether they want it as a sticker. Anything
  // that is not a yes leaves the offer standing rather than nagging.
  if (session.state === "GIF_PUBLISH") {
    await sendText(creds, senderId,
      "Your GIF is above. Reply *post* if you want it in Instagram's GIF search, " +
      "or *gif* to make another one.");
    return;
  }

  // Nothing matched, and this is where the bot used to pitch at everybody.
  // It says nothing now. The funnel does not depend on it: a person arrives by
  // commenting a look number on a post, and the comment webhook sends them one
  // private reply carrying the instructions. A cold DM is not the way in.
  await ignoreQuietly(session, text);
}
