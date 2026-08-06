/**
 * Comment keywords and the replies they trigger.
 *
 * A post says "drop STUDIO in the comments and I'll send you the link". Someone
 * comments STUDIO, Instagram tells our webhook, and the bot sends them one
 * private message containing that link.
 *
 * Instagram's rules shape the whole design and are not negotiable:
 *
 *   - ONE private reply per comment. There is no second chance, so the message
 *     has to carry the link and the reason to click in one go.
 *   - Seven days from the comment. After that the reply is refused.
 *   - The thread only continues if THEY reply. This is not an open channel.
 *   - 200 automated messages per hour per account.
 *
 * Keywords are matched loosely (case-insensitive, ignoring punctuation and
 * emoji) because people type "studio!!" and "Studio 🙌", not "STUDIO".
 */

export interface Keyword {
  /** What the caption asks people to comment. Keep it one word and easy to spell. */
  word: string;
  /** The single DM they receive. Instagram strips nothing, but keep it short. */
  reply: string;
  /** Optional public comment reply, so others see the exchange happened. */
  publicReply?: string;
  /**
   * The same message with no URL in it.
   *
   * Instagram refuses a DM containing a link when the sending account is under
   * a link restriction: error 508, subcode 2534122, "Link can't be shared".
   * The whole message is dropped, so without this the commenter gets nothing at
   * all. This version points at the profile's bio link instead of carrying one.
   */
  replyNoLink?: string;
}

const SITE = "https://aluxartandframes.shop";

export const KEYWORDS: Keyword[] = [
  {
    word: "STUDIO",
    reply:
      "Here you go 👇\n\n" +
      `${SITE}\n\n` +
      "Pick a style, upload a few photos, and your shoot is ready in minutes. " +
      "Any questions, just reply to this message.",
    replyNoLink:
      "Here you go 👇\n\n" +
      "Tap our name at the top of this chat — the link is in our bio.\n\n" +
      "Pick a style, upload a few photos, and your shoot is ready in minutes. " +
      "Any questions, just reply to this message.",
    publicReply: "Sent you a DM 📩",
  },
  {
    word: "GUIDE",
    reply:
      "Here's the upload guide 👇\n\n" +
      `${SITE}\n\n` +
      "Four photos is all it takes: one full body, one waist-up on a plain background, " +
      "one close-up, and one where you're genuinely smiling. That last one is the difference " +
      "between a stranger and you.",
    replyNoLink:
      "Here's the upload guide 👇\n\n" +
      "Four photos is all it takes: one full body, one waist-up on a plain background, " +
      "one close-up, and one where you're genuinely smiling. That last one is the difference " +
      "between a stranger and you.\n\n" +
      "Tap our name at the top of this chat to start — the link is in our bio.",
    publicReply: "Just sent it 📩",
  },
  {
    word: "CREATOR",
    reply:
      "Here's where to start 👇\n\n" +
      `${SITE}/become-creator\n\n` +
      "List your style as a template, set your own price, and get paid every time someone " +
      "books it. Free to list, and the waitlist is open — you're in straight away.",
    replyNoLink:
      "Here's where to start 👇\n\n" +
      "Tap our name at the top of this chat, open the link in our bio, then go to " +
      "Become a Creator.\n\n" +
      "List your style as a template, set your own price, and get paid every time someone " +
      "books it. Free to list, and the waitlist is open — you're in straight away.",
    publicReply: "Sent 📩",
  },
  {
    word: "PRICE",
    reply:
      "Here's the pricing 👇\n\n" +
      `${SITE}/marketplace\n\n` +
      "Every style shows its price before you pay, and you choose how many images you want. " +
      "No subscription, no hidden fees.",
    replyNoLink:
      "Here's how pricing works 👇\n\n" +
      "Every style shows its price before you pay, and you choose how many images you want. " +
      "No subscription, no hidden fees.\n\n" +
      "Tap our name at the top of this chat to browse — the link is in our bio.",
    publicReply: "Check your DMs 📩",
  },
];

/** Strip punctuation, emoji and case so real comments match. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Find the keyword a comment is asking for.
 *
 * Matches on whole words only: "price" matches, "priceless" does not. Where a
 * comment somehow contains two keywords, the first in the list wins so the
 * behaviour is predictable rather than depending on how they typed it.
 */
export function matchKeyword(commentText: string): Keyword | null {
  const words = new Set(normalise(commentText).split(" "));
  for (const k of KEYWORDS) {
    if (words.has(k.word.toLowerCase())) return k;
  }
  return null;
}

/** The line a caption uses to ask for the keyword. */
export function callToAction(word: string): string {
  return `💬 Comment ${word.toUpperCase()} and I'll send you the link.`;
}
