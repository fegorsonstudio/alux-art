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

/**
 * The WhatsApp shortcut, with the trigger word pre-filled.
 *
 * Tapping it opens a chat with "G7X" already typed; sending it puts the buyer
 * straight on the Gear Equalizer with look 197 chosen, asking for photos. Six
 * steps on a website is a lot to ask of somebody reading comments on a phone.
 */
const WA_LINK = "https://wa.me/2349076858017?text=G7X";

export interface Keyword {
  /** What the caption asks people to comment. Keep it one word and easy to spell. */
  word: string;
  /** The single DM they receive. Instagram strips nothing, but keep it short. */
  reply: string;
  /**
   * Near-misses that should count as the same ask: ASSET for ASSETS. Checked
   * only after every keyword's exact word has failed, so an alias can never
   * steal a comment from another keyword's real word.
   */
  aliases?: string[];
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
    // The lighting campaign's call to action. Added with that campaign: without
    // it every "comment LIGHT" caption matches no keyword and the commenter
    // silently gets nothing, which looks identical to the automation working.
    word: "LIGHT",
    // The steps are in the message itself rather than promised as a follow-up.
    // One reply is all Instagram gives, and people who commented on the launch
    // post had the link already and still asked how to use it — the link was
    // never the missing part.
    reply:
      "Here's the relighting tool 👇\n\n" +
      `${SITE}/marketplace/3d822eb4-9618-4cfc-8d21-25a4627a4d32\n\n` +
      "Or skip all of it — message us on WhatsApp and just send *G7X*:\n" +
      `${WA_LINK}\n\n` +
      "How to use it on the website instead:\n" +
      "1. Open the link and tap Book This Look\n" +
      "2. Pick 4:5 at the top, and crop your photo to 4:5 so they match\n" +
      "3. Upload your photo\n" +
      "4. Type 197 in the search box — it picks the look for you\n" +
      "5. Leave the background on \"keeping yours\"\n" +
      "6. Pay ₦2,000 per photo and download\n\n" +
      "That's look 197, Night Paparazzi G7X. It works on a photo you already have — " +
      "dark club, dim restaurant, bad hall lighting. Nothing to install, no gear to buy.",
    replyNoLink:
      "Here's the relighting tool 👇\n\n" +
      "Fastest way: message us on WhatsApp on 0907 685 8017 and send G7X.\n\n" +
      "Tap our name at the top of this chat — the link is in our bio, then open " +
      "The Gear Equalizer.\n\n" +
      "How to use it:\n" +
      "1. Tap Book This Look\n" +
      "2. Pick 4:5 at the top, and crop your photo to 4:5 so they match\n" +
      "3. Upload your photo\n" +
      "4. Type 197 in the search box — it picks the look for you\n" +
      "5. Leave the background on \"keeping yours\"\n" +
      "6. Pay ₦2,000 per photo and download\n\n" +
      "That's look 197, Night Paparazzi G7X. It works on a photo you already have — " +
      "dark club, dim restaurant, bad hall lighting. Nothing to install, no gear to buy.",
    publicReply: "Sent you a DM 📩",
  },
  {
    // The Asset Extractor's own call to action. CREATOR used to carry this post,
    // which sent someone who wanted the tool to a sign-up page instead of to the
    // thing they had just watched work.
    word: "ASSETS",
    aliases: ["ASSET", "EXTRACTOR"],
    reply:
      "Here's The Asset Extractor 👇\n\n"
      + `${SITE}/marketplace/a63214fd-c56a-46ae-8056-0407a17d63a1\n\n`
      + "Upload one photo of the piece — on a client, on a hanger, however you shot it — "
      + "and it comes back on its own: front, three-quarter, side and back, no model and no mannequin.\n\n"
      + "It also lifts wigs, shoes, bags, jewellery, nails, makeup, and the backdrop on its own. "
      + "₦2,000 per photo.",
    replyNoLink:
      "Here's The Asset Extractor 👇\n\n"
      + "Tap our name at the top of this chat — the link is in our bio, then open The Asset Extractor.\n\n"
      + "Upload one photo of the piece — on a client, on a hanger, however you shot it — "
      + "and it comes back on its own: front, three-quarter, side and back, no model and no mannequin.\n\n"
      + "It also lifts wigs, shoes, bags, jewellery, nails, makeup, and the backdrop on its own. "
      + "₦2,000 per photo.",
    publicReply: "Sent you a DM 📩",
  },
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
    // Near-misses of the asked-for word. Someone who types ASSET instead of
    // ASSETS gets silence otherwise, and silence is indistinguishable from the
    // automation working — the same trap that hid the missing LIGHT keyword.
    if (k.aliases?.some(a => words.has(a.toLowerCase()))) return k;
  }
  return null;
}

/** The line a caption uses to ask for the keyword. */
export function callToAction(word: string): string {
  return `💬 Comment ${word.toUpperCase()} and I'll send you the link.`;
}
