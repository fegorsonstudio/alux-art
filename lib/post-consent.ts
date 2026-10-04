import "server-only";
import sql from "@/lib/db";

/**
 * Asking whether we may show a customer's photographs on our own page.
 *
 * The wording was argued over and approved, so it lives here in one place
 * rather than being retyped per channel. Two things in it are load-bearing and
 * must not be trimmed by a later edit:
 *
 *   The THREE-WEEK HOLD is the persuasion. The real objection is not privacy,
 *   it is being scooped — nobody wants a brand posting their photo before they
 *   have. Naming the delay removes the only good reason to refuse.
 *
 *   NO is offered as plainly as YES. An ask that makes refusing awkward earns a
 *   reluctant yes and a customer who regrets it. "Either answer is completely
 *   fine" costs a few yeses and buys the right to keep asking.
 */

/** The promise made in the message. Changing it here changes what is promised. */
export const HOLD_DAYS = 21;

export const CONSENT_ASK =
  "Hope you love it ❤️\n\n" +
  "This one came out beautiful, and I'd love to show it on our page one day — " +
  "your before and after, side by side.\n\n" +
  "*Not now though.* It would stay ours for *three weeks* first, so you get to post it " +
  "yourself before anyone sees it here. After that, only if you're happy.\n\n" +
  "Reply *YES* if that's okay, or *NO* and I'll never post it. " +
  "Either answer is completely fine — your photo, your call.";

/**
 * Loose on purpose, and in Pidgin.
 *
 * The last matcher that insisted on one exact spelling swallowed a paying
 * customer's retouch request and she got silence. A customer who types "na
 * fine" has answered.
 */
const YES = /^(yes|yeah|yep|yup|sure|ok|okay|fine|no problem|of course|go ahead|you can|please do|i'?m happy|happy|na fine|e fine|no wahala|abeg do)\b/i;
const NO = /^(no|nope|nah|please don'?t|don'?t|rather not|not comfortable|i'?d rather|prefer not|abeg no|no o)\b/i;
/** Withdrawing later, whatever was agreed. */
const STOP = /^(stop|remove|take it down|delete it|unpost|withdraw)\b/i;

export type ConsentReply = "granted" | "refused" | "withdrawn" | null;

export function readConsentReply(text: string): ConsentReply {
  const t = (text ?? "").trim();
  if (!t) return null;
  if (STOP.test(t)) return "withdrawn";
  // "no" before "yes": "no problem" means yes and starts with no, so the
  // specific phrase has to be matched before the bare word.
  if (/^no problem|^no wahala/i.test(t)) return "granted";
  if (NO.test(t)) return "refused";
  if (YES.test(t)) return "granted";
  return null;
}

/**
 * Record that we asked. Returns false when this shoot has been asked already,
 * so a redelivery cannot ask the same person twice about the same photographs.
 */
export async function markAsked(shootId: string, userId: string | null, channel: string): Promise<boolean> {
  const rows = await sql<{ shoot_id: string }[]>`
    INSERT INTO post_consent (shoot_id, user_id, channel)
    VALUES (${shootId}, ${userId}, ${channel})
    ON CONFLICT (shoot_id) DO NOTHING
    RETURNING shoot_id`;
  return rows.length > 0;
}

/**
 * Record the answer. `granted` sets the date the photographs become postable —
 * the promised three weeks from the moment they agreed, never from the decision
 * being processed, so nothing can quietly shorten it.
 */
export async function recordConsent(shootId: string, decision: Exclude<ConsentReply, null>): Promise<void> {
  const postableFrom = decision === "granted"
    ? new Date(Date.now() + HOLD_DAYS * 24 * 60 * 60 * 1000)
    : null;
  await sql`
    UPDATE post_consent
    SET status = ${decision}, decided_at = NOW(), postable_from = ${postableFrom}, updated_at = NOW()
    WHERE shoot_id = ${shootId}`;
}

/**
 * Withdraw every permission this person ever gave.
 *
 * Not just the latest shoot: somebody who says stop means all of their
 * pictures, and making them repeat it per photograph would be a dark pattern.
 */
export async function withdrawAll(userId: string): Promise<number> {
  const rows = await sql<{ shoot_id: string }[]>`
    UPDATE post_consent SET status = 'withdrawn', postable_from = NULL, updated_at = NOW()
    WHERE user_id = ${userId} AND status <> 'withdrawn'
    RETURNING shoot_id`;
  return rows.length;
}

/** The shoot a reply is about: the most recent one this person was asked about. */
export async function openAsk(userId: string): Promise<string | null> {
  const [row] = await sql<{ shoot_id: string }[]>`
    SELECT shoot_id FROM post_consent
    WHERE user_id = ${userId} AND status = 'asked'
    ORDER BY asked_at DESC LIMIT 1`;
  return row?.shoot_id ?? null;
}

/** What the carousel queue may use today. */
export async function postableShoots(limit = 50) {
  return sql<{ shoot_id: string; postable_from: Date }[]>`
    SELECT shoot_id, postable_from FROM post_consent
    WHERE status = 'granted' AND postable_from <= NOW()
    ORDER BY postable_from DESC LIMIT ${limit}`;
}
