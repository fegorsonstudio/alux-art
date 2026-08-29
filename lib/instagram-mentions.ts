import "server-only";
import sql from "@/lib/db";
import { findLookByNumber } from "@/lib/whatsapp-triggers";
import { tellAdmin } from "@/lib/telegram";

/**
 * Someone named us on somebody else's post.
 *
 * WHAT THIS CAN AND CANNOT DO — the shape of the whole file follows from it.
 *
 * The `comments` webhook only covers media we own. `mentions` is the separate
 * field that fires when a user @mentions us in a comment or a caption on media
 * we do NOT own. That is the case in front of us: our GIFs get posted under
 * other accounts' posts, and people reply to them there.
 *
 * We CAN be told, and we CAN reply publicly on that comment.
 * We CANNOT send them a DM. Instagram's private replies are scoped to comments
 * on our own posts, reels, stories, live and ads — there is no mechanism to
 * open a thread with someone who named us somewhere else.
 *
 * NOT REACHABLE ON THIS APP AS IT STANDS. Probed against the live token, an
 * Instagram-Login app has no /mentions, /mentioned_comment or /mentioned_media
 * edge — they are Facebook-login only — and subscribes to ["comments",
 * "messages"] with no `mentions` field on offer. A comment naming us on a third
 * party's post delivered no webhook at all when tested. This module is kept,
 * unwired, because it is the whole of the work needed the day those accounts
 * move to Instagram API with Facebook Login; nothing calls it until then.
 *
 * So the public reply IS the funnel. It has to carry the instruction, not a
 * link: they read it, they DM us the word, and the moment they do that their
 * message opens the 24-hour window and the ordinary bot takes over.
 *
 * It also opens with @their-handle, which is what puts the reply in their
 * notifications. Without that it is a comment nobody sees.
 */

const GRAPH = "https://graph.instagram.com/v23.0";

/** Never reply to a mention older than this. A week-old thread is archaeology. */
const MAX_AGE_DAYS = 7;

export type MentionEvent = {
  igAccountId: string;
  mediaId: string | null;
  commentId: string | null;
  text: string;
  fromUsername: string | null;
};

/**
 * What to say back.
 *
 * Reads the mention the same way the DM bot reads a message, so the reply names
 * the thing they actually asked for. A number that resolves to a real look is
 * the strongest signal there is — it means they have seen a specific piece of
 * work and want that one.
 */
async function replyFor(text: string): Promise<string | null> {
  // A look number anywhere in the mention: "@fegorson_studio 197".
  const num = /\b(\d{1,3})\b/.exec(text);
  if (num) {
    const n = Number(num[1]);
    const look = await findLookByNumber(n).catch(() => null);
    if (look) {
      return `that's look ${n} 🙌 Send us *${n}* in a DM and we'll put that exact ` +
             `light on your own photo — takes about two minutes.`;
    }
  }

  // They want the loop itself.
  if (/\b(gifs?|sticker|loop|template)\b/i.test(text)) {
    return `DM us *GIF* and we'll make yours right there in the chat — ` +
           `two pictures, your own words, and it comes back ready to post.`;
  }

  // Anything about the lighting, which is what most of them are asking.
  if (/\b(light|lighting|relight|edit|photo|picture|how|please|pls|abeg)\b/i.test(text)) {
    return `DM us *LIGHT* and we'll relight one of your own photos so you ` +
           `can see it on your own picture first.`;
  }

  // Named us with nothing to go on. Silence is better than a pitch: the studio
  // is told instead, and a person can answer if it is worth answering.
  return null;
}

/**
 * Reply on the comment we were named in.
 *
 * POST /{ig-user-id}/mentions takes the media the mention sits on, plus the
 * comment id when it is a comment rather than a caption. The whole response is
 * logged on failure — this endpoint is used nowhere else in the codebase, so
 * the first live failure is the only chance to learn its exact complaint.
 */
async function sendMentionReply(
  igAccountId: string,
  token: string,
  mediaId: string,
  commentId: string | null,
  message: string,
): Promise<{ ok: boolean; error?: string }> {
  const params: Record<string, string> = { media_id: mediaId, message, access_token: token };
  if (commentId) params.comment_id = commentId;

  try {
    const res = await fetch(`${GRAPH}/${igAccountId}/mentions`, {
      method: "POST",
      body: new URLSearchParams(params),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.error) {
      return { ok: false, error: JSON.stringify(body?.error ?? body).slice(0, 400) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message.slice(0, 200) };
  }
}

/**
 * One mention event, start to finish.
 *
 * Records every mention it sees, answered or not, because the row is what stops
 * a redelivered webhook being answered twice under a stranger's post.
 */
export async function handleMention(
  event: MentionEvent,
  token: string,
  ourHandles: Set<string>,
): Promise<void> {
  const { igAccountId, mediaId, commentId, text, fromUsername } = event;

  // Comment mentions and caption mentions both arrive here; the comment id is
  // the better key when there is one.
  const ref = commentId || mediaId;
  if (!ref || !mediaId) {
    console.warn("[ig mentions] event with no media id, ignoring");
    return;
  }

  // Never answer ourselves. The studio replying to a customer with our own
  // handle in it would otherwise have the bot answer its own comment.
  if (fromUsername && ourHandles.has(fromUsername.toLowerCase())) {
    console.log(`[ig mentions] ignoring our own mention from @${fromUsername}`);
    return;
  }

  // Claim it first. INSERT ... ON CONFLICT DO NOTHING is the whole dedupe: two
  // concurrent deliveries race here and exactly one of them wins the row.
  const claimed = await sql<{ ref: string }[]>`
    INSERT INTO instagram_mentions (ref, ig_account_id, media_id, comment_id, from_username, text)
    VALUES (${ref}, ${igAccountId}, ${mediaId}, ${commentId}, ${fromUsername}, ${text})
    ON CONFLICT (ref) DO NOTHING
    RETURNING ref`;
  if (!claimed.length) {
    console.log(`[ig mentions] already handled ${ref}`);
    return;
  }

  const handle = fromUsername ? `@${fromUsername} ` : "";
  const bare = await replyFor(text);

  if (!bare) {
    console.log(`[ig mentions] @${fromUsername ?? "?"} mentioned us with nothing to act on: ${text.slice(0, 80)}`);
    await tellAdmin(
      `💬 Mentioned on someone else's post\n\n` +
      `From: @${fromUsername ?? "unknown"}\n` +
      `Said: ${text.slice(0, 200)}\n\n` +
      `Nothing obvious to reply with, so the bot said nothing. ` +
      `Reply by hand if it is worth it.`
    ).catch(() => {});
    return;
  }

  const message = handle + bare.replace(/^\s+/, "");
  const sent = await sendMentionReply(igAccountId, token, mediaId, commentId, message);

  if (!sent.ok) {
    console.error(`[ig mentions] reply failed for ${ref}: ${sent.error}`);
    // The row stays, without a reply_text, so a redelivery does not try again
    // and again under someone else's post. The studio is told so it can be
    // answered by hand while it is still fresh.
    await tellAdmin(
      `⚠️ Could not reply to a mention\n\n` +
      `From: @${fromUsername ?? "unknown"}\n` +
      `Said: ${text.slice(0, 200)}\n` +
      `Reason: ${sent.error}\n\n` +
      `We cannot DM someone who mentions us on another account's post — a public ` +
      `reply is the only channel, so this one needs a hand.`
    ).catch(() => {});
    return;
  }

  await sql`
    UPDATE instagram_mentions SET reply_text = ${message}, replied_at = NOW() WHERE ref = ${ref}`;
  console.log(`[ig mentions] replied to @${fromUsername ?? "?"} on ${mediaId}`);

  await tellAdmin(
    `💬 Replied to a mention on someone else's post\n\n` +
    `From: @${fromUsername ?? "unknown"}\n` +
    `Said: ${text.slice(0, 200)}\n` +
    `We said: ${message.slice(0, 200)}\n\n` +
    `They have to DM us for anything to happen — Instagram does not let us ` +
    `message them first from here.`
  ).catch(() => {});
}

/** Mentions older than this are not worth answering. Exported for the caller's guard. */
export const mentionTooOld = (timestamp?: number) =>
  typeof timestamp === "number" &&
  Date.now() - timestamp * 1000 > MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
