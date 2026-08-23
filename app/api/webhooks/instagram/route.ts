import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { matchKeyword, lookNumberReply } from "@/lib/instagram-keywords";
import { findLookByNumber } from "@/lib/whatsapp-triggers";
import { sendText, credsForAccount } from "@/lib/instagram";
import { loadSession, markInbound, offerLook, handlePhoto, prettyLook, armLookSession } from "@/lib/instagram-bot";
import { tellAdmin } from "@/lib/telegram";

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
          if (numberAsked && from.id) {
            await armLookSession(igUserId, String(from.id), from.username, numberAsked)
              .catch(e => console.warn("[ig webhook] could not arm session:", (e as Error).message));
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
async function handleDirectMessage(
  igAccountId: string,
  senderId: string,
  msg: { text?: string; imageUrl?: string },
): Promise<void> {
  const creds = credsForAccount(igAccountId);
  if (!creds) { console.warn("[ig bot] no credentials for account", igAccountId); return; }

  const session = await loadSession(igAccountId, senderId);
  await markInbound(session.id, msg.text ?? (msg.imageUrl ? "[photo]" : null));

  // A photo is an instruction on its own — it means "do the look we agreed".
  if (msg.imageUrl) {
    await handlePhoto(creds, session, msg.imageUrl);
    return;
  }

  const text = (msg.text ?? "").trim();
  if (!text) return;

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

  await sendText(creds, senderId,
    "Hello 👋 I'm an automated assistant for Alux Art.\n\n" +
    "Send me the number of any lighting look from our posts (for example *69*) and " +
    "I'll relight a photo of your own with it — ₦1,000, right here in this chat.\n\n" +
    "Type *support* to reach a person.");
}
