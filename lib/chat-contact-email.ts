import "server-only";
import sql from "@/lib/db";

/**
 * The email a chat customer can be reached on when something goes wrong.
 *
 * Both bots create a synthetic profile — wa-<phone>@… or ig-<scoped id>@… —
 * which identifies the account but reaches nobody. If a paid shoot fails and
 * the chat has gone quiet, or Instagram's 24-hour window has closed, there is
 * currently no way to tell the customer anything at all.
 *
 * Unverified on purpose. It is used to CONTACT someone, never to authorise
 * anything: a refund is credited to the wallet on their chat profile, and the
 * address plays no part in choosing which wallet that is. Joining a chat to a
 * real website account remains a separate flow with a six-digit code, because
 * that one does move money.
 */

const SYNTHETIC = /@(whatsapp|instagram)\.aluxartandframes\.shop$/i;

/** Loose on purpose — this is a contact detail, not a credential. */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isEmailish(raw: string): boolean {
  return LOOKS_LIKE_EMAIL.test(raw.trim());
}

/**
 * Does this customer still need to give us an address?
 *
 * True when their profile carries only a synthetic identifier and no contact
 * email — the state in which a failed shoot cannot be resolved outside the chat.
 */
export async function needsContactEmail(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const [row] = await sql<{ email: string | null; contact_email: string | null }[]>`
    SELECT email, contact_email FROM profiles WHERE id = ${userId}`.catch(() => []);
  if (!row) return false;
  if (row.contact_email) return false;
  return SYNTHETIC.test(row.email ?? "");
}

/** Record it. Returns false when it does not look like an address at all. */
export async function saveContactEmail(userId: string, rawEmail: string): Promise<boolean> {
  const email = rawEmail.trim().toLowerCase();
  if (!isEmailish(email)) return false;
  await sql`
    UPDATE profiles SET contact_email = ${email}, updated_at = NOW() WHERE id = ${userId}`;
  console.log(`[contact email] saved for ${userId}`);
  return true;
}

/**
 * The ask, in one place so both bots word it the same.
 *
 * States the reason rather than just requesting the address: people hand over
 * an email when they can see what it protects, and "in case your shoot fails"
 * is the honest reason.
 */
export const CONTACT_EMAIL_ASK =
  "One more thing — send me your email address (just type it here).\n\n" +
  "If a photo ever fails to generate, that's how we refund you into your wallet " +
  "and tell you it's done. Without it, a failed shoot can only be sorted out if " +
  "you happen to come back to this chat.";

/** The confirmation, also shared so the two bots do not drift. */
export const contactEmailSaved = (email: string) =>
  `Saved: ${email} ✅\n\nIf anything goes wrong with a shoot we'll refund your wallet and email you.`;
