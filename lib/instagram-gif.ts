import "server-only";
import sql from "@/lib/db";
import { r2Upload } from "@/lib/r2";
import { sendText, downloadAttachment, type IgCreds } from "@/lib/instagram";
import { ensureUser, loadSession, patchSession, sendWithLinkFallback, type IgSession } from "@/lib/instagram-bot";
import { publishShootLoop, cleanTags } from "@/lib/giphy-publish";

/**
 * Making an Instagram GIF without leaving the Instagram chat.
 *
 * Someone comments or types GIF and the whole thing happens here: up to three
 * pictures, their own words, pay, and the finished loop comes back in the same
 * thread. If they like it they say POST and it goes up as a sticker in
 * Instagram's GIF search, with tags they choose.
 *
 * THREE SCENES, NOT A BEFORE AND AN AFTER. A pair is one idea — here is a
 * photo, here it is relit — which reads as an advert, and an advert is the
 * wrong thing to leave under somebody else's post. Three scenes let the first
 * one earn its place and the pitch follow behind it.
 *
 * Scene one is the cover. A GIF's first frame is what every static preview
 * shows, so whatever is in scene one is what people see before anything moves.
 * Autoplay is not ours to control; the first frame is.
 *
 * WHY IT IS ITS OWN FILE. The relight flow in instagram-bot.ts is one photo and
 * one look. This is several photos, an ordered list of lines and a publish step
 * afterwards — a different conversation with different states. Folding it into
 * the existing handler would put the live, paid relight flow at risk to save a
 * file.
 *
 * The states, in order. The first two are named for the before/after pair they
 * used to collect; they are internal, and renaming them would strand any
 * session sitting in one mid-conversation.
 *
 *   GIF_BEFORE  waiting for scene 1, the cover
 *   GIF_AFTER   waiting for scene 2
 *   GIF_THIRD   waiting for scene 3, or SKIP
 *   GIF_WORDS   collecting lines, one message or several, until they say DONE
 *   AWAITING_PAYMENT / GENERATING   the ordinary booking states
 *   GIF_PUBLISH the loop has been delivered and POST will put it on GIPHY
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://aluxartandframes.shop";

/** Six lines is the cap the renderer enforces; past that people scroll before the reveal. */
const MAX_LINES = 6;

export const GIF_STATES = ["GIF_BEFORE", "GIF_AFTER", "GIF_THIRD", "GIF_WORDS", "GIF_PUBLISH"];

/** Skipping the optional third scene. */
const SKIP_WORDS = /^(skip|no|none|nope|that'?s all|thats all|done|2|two)\b/i;
export const isGifSkip = (text: string) => SKIP_WORDS.test(text.trim());

/** Words that end the line-collecting step. */
const DONE_WORDS = /^(done|finish|finished|that'?s all|thats all|ok|okay|go|ready)\b/i;
/** How somebody asks for the sticker once they have seen the loop. */
const POST_WORDS = /^(post|publish|upload|yes)\b/i;

/**
 * How somebody asks to MAKE one: "upload my gif", "make a gif", "start a gif".
 *
 * This has to be tested before POST_WORDS, because "upload my gif" satisfies
 * both and the two mean opposite things — one starts a new loop, the other
 * publishes the last one. The more specific phrase wins: naming a GIF is asking
 * for a GIF, not asking for something to be done to one.
 */
const CREATE_PHRASES = /\b(upload|make|making|create|start|do|want)\b[^.!?]{0,20}\bgifs?\b/i;

/** True when the message is asking to make a new loop rather than publish one. */
export const isGifCreateRequest = (text: string) => CREATE_PHRASES.test(text.trim());

/**
 * The published GIF template, looked up rather than hard-coded.
 *
 * By category, so replacing the template — which has happened once already,
 * when the cover and the name were redone — does not silently break the chat
 * flow with a dead id.
 */
export async function findGifTemplate(): Promise<{ id: string; title: string; priceNgn: number } | null> {
  const [row] = await sql<{ id: string; title: string; price_1_ngn: number | null; price_ngn: number | null }[]>`
    SELECT id, title, price_1_ngn, price_ngn
    FROM templates
    WHERE category = 'gif_loop' AND status = 'published' AND is_private = false
    ORDER BY created_at DESC
    LIMIT 1`;
  if (!row) return null;
  return { id: row.id, title: row.title, priceNgn: Number(row.price_1_ngn ?? row.price_ngn ?? 0) };
}

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

/** Open the flow. Reached from the trigger word, in chat or from a comment. */
export async function startGifFlow(creds: IgCreds, session: IgSession): Promise<void> {
  const tpl = await findGifTemplate();
  if (!tpl) {
    await sendText(creds, session.ig_user_id,
      "The GIF maker is not available right now. Send *support* and a human will pick it up.");
    return;
  }

  await patchSession(session.id, {
    state: "GIF_BEFORE",
    template_id: tpl.id,
    // A fresh loop. Anything left over from a previous one would silently
    // become part of this one.
    gif_lines: [],
    gif_website: null,
    shoot_id: null,
    source_paths: [],
    look_option_id: null,
    look_name: null,
  });

  await sendText(creds, session.ig_user_id,
    "Let's make your GIF 🎬\n\n" +
    "It's a short loop of up to three scenes with your words on each one — the " +
    "kind people post as an Instagram sticker.\n\n" +
    "*Send me the picture for scene 1 first.* That one matters most: it is the " +
    "cover, the frame people see before the GIF moves.\n\n" +
    "Just the photo, nothing else.");
}

/**
 * Arm a conversation for the GIF flow after a GIF comment earned a private
 * reply.
 *
 * That reply already said "send me the BEFORE picture", so this puts the
 * session where the reply claims it is. Without it the picture arrives at an
 * IDLE session and is ignored as an unsolicited photo from a stranger.
 *
 * Only ever moves an idle conversation. Someone mid-booking who comments GIF
 * on an old post must not have their in-flight shoot thrown away.
 */
export async function armGifSession(
  igAccountId: string,
  igUserId: string,
  username: string | undefined,
): Promise<void> {
  const tpl = await findGifTemplate();
  if (!tpl) return;

  const session = await loadSession(igAccountId, igUserId, username);
  if (!["IDLE", "DONE", "GIF_PUBLISH"].includes(session.state)) return;

  await patchSession(session.id, {
    state: "GIF_BEFORE",
    template_id: tpl.id,
    gif_lines: [],
    gif_website: null,
    shoot_id: null,
    source_paths: [],
    look_option_id: null,
    look_name: null,
  });
}

/**
 * A photo arrived while the GIF flow is running.
 *
 * Returns false if this session is not in the GIF flow, so the caller can fall
 * through to the ordinary relight handling.
 */
export async function handleGifPhoto(
  creds: IgCreds,
  session: IgSession,
  attachmentUrl: string,
): Promise<boolean> {
  if (!["GIF_BEFORE", "GIF_AFTER", "GIF_THIRD"].includes(session.state)) return false;
  const to = session.ig_user_id;

  const media = await downloadAttachment(attachmentUrl);
  if (!media) {
    await sendText(creds, to, "That image didn't come through. Could you send it once more?");
    return true;
  }

  const userId = await ensureUser(session);
  // Under the customer's own id: the booking route refuses any path that is not
  // theirs, which is what stops a booking naming somebody else's file.
  const path = `${userId}/${crypto.randomUUID()}-instagram-gif.jpg`;
  await r2Upload("identity-images", path, media.buffer, media.contentType);

  const so_far = session.source_paths ?? [];

  if (session.state === "GIF_BEFORE") {
    await patchSession(session.id, { state: "GIF_AFTER", source_paths: [path] });
    await sendText(creds, to,
      "Got scene 1 👍 That's your cover.\n\n*Now send the picture for scene 2.*");
    return true;
  }

  if (session.state === "GIF_AFTER") {
    const first = so_far[0];
    if (!first) {
      // Only reachable if scene 1 was lost between messages. Ask again rather
      // than book a loop with one picture, which the route would refuse anyway.
      await patchSession(session.id, { state: "GIF_BEFORE", source_paths: [] });
      await sendText(creds, to, "I've lost the first picture. Send scene 1 again and we'll go from there.");
      return true;
    }
    await patchSession(session.id, { state: "GIF_THIRD", source_paths: [first, path] });
    await sendText(creds, to,
      "Got scene 2 ✅\n\n*Send a third picture if you want one*, or reply *skip* and we'll " +
      "make it with two.");
    return true;
  }

  // The third, which is optional. Whatever is in hand goes forward.
  await patchSession(session.id, { state: "GIF_WORDS", source_paths: [...so_far, path] });
  await askForWords(creds, to, so_far.length + 1);
  return true;
}

/**
 * Ask for the words, once the pictures are in.
 *
 * Says how many scenes there are so the customer knows how many lines they are
 * writing — the words and the pictures pair up in order, so a line and a scene
 * are the same thing.
 */
async function askForWords(creds: IgCreds, to: string, scenes: number): Promise<void> {
  await sendText(creds, to,
    `${scenes} scene${scenes === 1 ? "" : "s"} in ✅\n\n` +
    "*Now your words — one short line per scene, in order.* Three or four words each reads best.\n\n" +
    "The first line goes on your cover, so make that one the hook.\n\n" +
    "For example:\n" +
    "You won't believe this\n" +
    "Same room, same phone\n" +
    "One light moved\n\n" +
    `Send them one at a time (up to ${MAX_LINES}), then send *done* when you've finished.`);
}

/**
 * Move a conversation on from pictures to words.
 *
 * Exported because SKIP is answered in the webhook, which has the text but not
 * the prompt — and the prompt has to say how many scenes there are, so the
 * customer knows how many lines they are writing.
 */
export async function askGifWords(creds: IgCreds, session: IgSession): Promise<void> {
  const shots = session.source_paths ?? [];
  if (!shots.length) {
    await patchSession(session.id, { state: "GIF_BEFORE", source_paths: [] });
    await sendText(creds, session.ig_user_id,
      "I've lost your pictures. Send scene 1 again and we'll go from there.");
    return;
  }
  await patchSession(session.id, { state: "GIF_WORDS" });
  await askForWords(creds, session.ig_user_id, shots.length);
}

/**
 * Text arrived while collecting lines.
 *
 * Every message is a line until they say done. A message with several lines in
 * it is split, because plenty of people type the whole thing in one go.
 */
export async function handleGifWords(
  creds: IgCreds,
  session: IgSession,
  text: string,
): Promise<void> {
  const to = session.ig_user_id;
  const lines = session.gif_lines ?? [];

  if (DONE_WORDS.test(text.trim())) {
    if (!lines.length) {
      await sendText(creds, to, "I need at least one line before we start. What should it say?");
      return;
    }
    await bookGifLoop(creds, session, lines);
    return;
  }

  // A website is stored separately: the renderer sets an address as its own
  // kind of beat, centred and smaller, rather than shouting it like a headline.
  const trimmed = text.trim();
  if (/^(https?:\/\/)?(www\.)?[a-z0-9-]+(\.[a-z]{2,})+\/?$/i.test(trimmed)) {
    const site = trimmed.replace(/^https?:\/\//i, "").replace(/\/+$/, "").slice(0, 40);
    await patchSession(session.id, { gif_website: site });
    await sendText(creds, to,
      `I'll put *${site}* at the end 👍\n\nAny more lines? Send *done* when you're finished.`);
    return;
  }

  const added = trimmed.split(/\n+/).map(l => l.trim().slice(0, 60)).filter(Boolean);
  if (!added.length) return;

  const next = [...lines, ...added].slice(0, MAX_LINES);
  await patchSession(session.id, { gif_lines: next });

  if (next.length >= MAX_LINES) {
    await sendText(creds, to,
      `That's ${MAX_LINES} lines — the most that fits before people scroll past the ending.\n\n` +
      `Starting it now…`);
    await bookGifLoop(creds, { ...session, gif_lines: next }, next);
    return;
  }

  await sendText(creds, to,
    `Line ${next.length}: "${added[added.length - 1]}" ✅\n\n` +
    `Send the next one, or *done* if that's everything.`);
}

/**
 * Everything is in hand — book it.
 *
 * Through the marketplace route with the internal secret, the same door the
 * website and the WhatsApp bot use, so price and template rules cannot drift
 * between the chat and the checkout.
 */
async function bookGifLoop(creds: IgCreds, session: IgSession, lines: string[]): Promise<void> {
  const to = session.ig_user_id;
  const shots = session.source_paths ?? [];
  const [before, after] = shots;
  if (!before || !after) {
    await sendText(creds, to, "I've lost one of your pictures. Send *gif* and we'll start again.");
    return;
  }

  const userId = await ensureUser(session);
  await sendText(creds, to, "Building it now, one moment…");

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
      gifLoop: {
        headline: lines[0],
        lines,
        website: session.gif_website ?? undefined,
        // Scene by scene: line 1 shows picture 1, line 2 picture 2, and so on.
        // A line past the last picture has none of its own and falls back to
        // the before/after pair below, which is what keeps a four-line loop
        // built from two pictures looking deliberate.
        lineRefs: lines.map((_, i) => (shots[i] ? { storagePath: shots[i] } : null)),
        beforeRef: { storagePath: before },
        // The last picture supplied, so the closing beats settle on the end of
        // the story rather than back on scene 2.
        afterRef: { storagePath: shots[shots.length - 1] ?? after },
      },
    }),
  }).then(r => r.json()).catch(e => ({ error: String(e) }));

  // Both spellings of the id are accepted: looking for only one of them once
  // reported a booking that had SUCCEEDED as a failure and abandoned a paying
  // customer.
  const shootId = (booking?.shootId ?? booking?.shoot?.id) as string | undefined;
  const payUrl = booking?.authorizationUrl as string | undefined;

  if (!shootId) {
    console.error("[ig gif] booking failed:", JSON.stringify(booking).slice(0, 400));
    await sendText(creds, to,
      "Something went wrong building that. Send *support* and a human will pick it up.");
    return;
  }

  // The recipient goes on the SHOOT, not just the session: a customer who
  // starts a second loop while the first is rendering would otherwise orphan
  // the first one — paid for, finished, and invisible to the delivery poller.
  await sql`
    UPDATE shoots SET ig_user_id = ${session.ig_user_id}, ig_account_id = ${session.ig_account_id}
    WHERE id = ${shootId}`;

  await patchSession(session.id, {
    state: payUrl ? "AWAITING_PAYMENT" : "GENERATING",
    shoot_id: shootId,
  });

  if (!payUrl) {
    await sendText(creds, to, "Paid from your balance ✅ Making your GIF now — about two minutes.");
    return;
  }

  const tpl = await findGifTemplate();
  const price = tpl ? naira(tpl.priceNgn) : "the price shown";
  await sendWithLinkFallback(creds, to,
    `Ready. ${price} for your GIF:\n\n${payUrl}\n\n` +
    `Pay and it comes straight back to you here — as a GIF and an MP4, upright and wide.`,
    // Link-blocked: Instagram refuses any message carrying a URL for an account
    // under a link restriction, so give them something they can act on instead
    // of nothing at all.
    `Ready — ${price} for your GIF.\n\n` +
    `Instagram won't let me send payment links right now. Open ` +
    `aluxartandframes.shop and your loop is waiting under your shoots, ready to pay for.`);
}

/**
 * After delivery: they liked it and want it as a sticker.
 *
 * Anything typed after the word is taken as their tags, so "post lagos, party"
 * publishes with those attached. The tags are what makes a sticker findable
 * again — without them a customer has a GIF on a channel they cannot search.
 */
export async function handleGifPublish(
  creds: IgCreds,
  session: IgSession,
  text: string,
): Promise<void> {
  const to = session.ig_user_id;
  if (!session.shoot_id) {
    await sendText(creds, to, "I've lost track of which GIF that was. Send *support* and we'll sort it.");
    return;
  }

  const rest = text.trim().replace(POST_WORDS, "").replace(/^[\s,:-]+/, "");
  const tags = cleanTags(rest);

  await sendText(creds, to, "Putting it up now…");
  const result = await publishShootLoop(session.shoot_id, tags);

  if (!result.ok) {
    console.error(`[ig gif] publish failed for ${session.shoot_id.slice(0, 8)}: ${result.error}`);
    await sendText(creds, to,
      "That didn't go through, and nothing was published. Send *post* again to retry, " +
      "or *support* and a human will look at it.");
    return;
  }

  await patchSession(session.id, { state: "DONE" });

  const tagLine = tags.length
    ? `Your tags: ${tags.map(t => `*${t}*`).join(", ")}\n`
    : "";
  await sendText(creds, to,
    (result.already ? "That one is already up ✅\n\n" : "Done ✅ It's on the Alux Art GIPHY channel.\n\n") +
    `*Give it about 24 hours*, then open any Instagram story, tap the GIF button ` +
    `and search *${result.tag}*.\n` +
    tagLine +
    `\nIt won't be there before then — GIPHY has to index it first, and that wait ` +
    `is on their side. Nothing has gone wrong if you can't find it today.`);
}

/**
 * The offer, sent once the finished loop has landed in the chat.
 *
 * Separate from the delivery message on purpose: this is the moment they have
 * just watched it, which is the only moment they can judge whether they want it
 * public.
 */
export function gifPublishOffer(): string {
  return (
    "\n\nLike it? Reply *post* and I'll put it in Instagram's GIF search so you can " +
    "use it as a sticker. It takes about a day to show up there.\n\n" +
    "Add your own words after it to make it easy to find later — for example " +
    "*post lagos, birthday, glow up*."
  );
}

/**
 * True when they are asking to publish the loop they have just been sent.
 *
 * Explicitly NOT true for "upload my gif", which is a request for a new one.
 */
export const isPostRequest = (text: string) =>
  POST_WORDS.test(text.trim()) && !isGifCreateRequest(text);
