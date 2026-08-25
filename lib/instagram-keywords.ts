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
 * The WhatsApp shortcut.
 *
 * A wa.me link with the trigger word pre-typed: tapping it opens the chat with
 * the word already in the box, so a comment turns into a booking in about three
 * taps with no menu in between. Taken out once because the bot could not finish
 * a booking, and restored after one ran start to finish through the chat.
 *
 * It belongs in `reply` ONLY, never in `replyNoLink`. That fallback exists
 * because an account under a link restriction has any message containing a link
 * refused outright, and a wa.me url is a link like any other.
 */

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
    // LIGHT is the promoted post, and that post is look 197. So it does not ask
    // which light they want - commenting it already answered that. The only
    // thing still missing is the photograph.
    reply:
      "Yes - I can do that for you right here in this chat. 👇" +
      "\n\nJust send me the photo you want relit and I'll apply this exact look to " +
      "it. Send a few if you like - ₦1,000 each, one at a time." +
      "\n\nIt comes straight back to you here, plus a download link for the " +
      "full-size file." +
      "\n\nPrefer to do it yourself on the website?\n" +
      `${SITE}/marketplace/3d822eb4-9618-4cfc-8d21-25a4627a4d32`,
    replyNoLink:
      "Yes - I can do that for you right here in this chat. 👇" +
      "\n\nJust send me the photo you want relit and I'll apply this exact look to " +
      "it. ₦1,000 per photo, sent straight back to you here.",
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
      + "₦1,000 per photo.\n\n"
      + "Or skip all of it — message us on WhatsApp and send *ASSETS*:\n"
      + "https://wa.me/2349076858017?text=ASSETS",
    replyNoLink:
      "Here's The Asset Extractor 👇\n\n"
      + "Tap our name at the top of this chat — the link is in our bio, then open The Asset Extractor.\n\n"
      + "Upload one photo of the piece — on a client, on a hanger, however you shot it — "
      + "and it comes back on its own: front, three-quarter, side and back, no model and no mannequin.\n\n"
      + "It also lifts wigs, shoes, bags, jewellery, nails, makeup, and the backdrop on its own. "
      + "₦1,000 per photo.",
    publicReply: "Sent you a DM 📩",
  },
  {
    word: "STUDIO",
    reply:
      "Here you go 👇\n\n" +
      `${SITE}\n\n` +
      "Pick a style, upload a few photos, and your shoot is ready in minutes.\n\n" +
      "Prefer WhatsApp? Message us there and we'll book it in the chat:\n" +
      "https://wa.me/2349076858017?text=HI",
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

/**
 * Strip punctuation, emoji and case so real comments match.
 *
 * @mentions are removed BEFORE the punctuation pass, and that order is the
 * whole point. Our own handle is @fegorson_studio, so stripping the @ first
 * turned every comment that tagged us into the words "fegorson studio" — and
 * STUDIO is a keyword. A customer who wrote "@fegorson_studio I haven't seen it
 * yet" was answered with a sales pitch for the thing she was chasing.
 *
 * People tag the account constantly, so this fires far more often than it looks.
 * A handle is who someone is talking TO, never what they are asking for.
 */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/@[\w.]+/g, " ")
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

/**
 * The DM for a comment that is just a lighting look number.
 *
 * The carousel puts a number on every slide and asks people to comment the one
 * they want. That number is already a working WhatsApp trigger, so the reply
 * hands over a wa.me link with it pre-typed: the buyer sends it, the bot picks
 * the template and the look, and asks for their photo. Comment to booking with
 * no menu in between.
 *
 * Built rather than listed, because the looks live in the database — all 197 of
 * them — and hardcoding even a handful here would guarantee the copy and the
 * looks drift apart.
 */
export function lookNumberReply(n: number, lookName: string): Keyword {
  // "197 · S Night Paparazzi G7X" -> "Night Paparazzi G7X". The number is
  // already in the sentence and the C/S letter is studio shorthand.
  const pretty = lookName.replace(/^\d+\s*·\s*/, "").replace(/^[CS]\s+/, "");

  const head = `That's *${pretty}* — look ${n}. 👇\n\n`;

  // The price used to live here as well as in the offer above, so every reply
  // said ₦1,000 twice in six lines.
  const tail =
    `\n\nWorks on a picture you already have - the dark club, the dim restaurant, ` +
    `the badly lit hall.`;

  // The reply now STARTS the job instead of forwarding it. Instagram can carry
  // the whole booking - send a photo, pay, receive the finished picture - so
  // handing a commenter a WhatsApp link was sending them somewhere else to do
  // the thing they could already do here. The links stay underneath: somebody
  // on a laptop, or who simply prefers to pay by card, still needs a door.
  const here =
    `Send me the photo you want relit *right here in this chat* and I'll apply this exact ` +
    `light to it. ₦1,000 for one photo, and it comes straight back to you here.\n\n`;

  return {
    word: String(n),
    reply:
      head +
      here +
      `Rather do it somewhere else?\n` +
      `WhatsApp: https://wa.me/2349076858017?text=${n}\n` +
      `Website: ${SITE}/marketplace/3d822eb4-9618-4cfc-8d21-25a4627a4d32` +
      tail,
    replyNoLink:
      head +
      here +
      `Prefer WhatsApp? Our number is in our bio - send just the number *${n}* when you get there.` +
      tail,
    publicReply: "Sent you a DM 📩",
  };
}
