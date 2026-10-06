/**
 * PHOTO WAHALA — Season 2. Posts p01 to p88, at 7pm.
 *
 * Every carousel on the account is a Photo Wahala episode now — the owner's
 * decision on 6 October 2026, after the microdrama experiment. Season 2 took
 * over the 88 dated slots of the older drafts: 22 stories, one a week, Monday
 * to Sunday, on the same calendar, so Christmas Day, New Year's Day,
 * Valentine's Day and Mothering Sunday still land on their day. Season 1
 * (plan-microdrama.mjs) posts at 1pm.
 *
 * The stories live in season2/s2-01.mjs … s2-22.mjs, written to
 * season2/OUTLINE.md and checked by season2/check.mjs. This file only turns
 * them into posts, the way plan-microdrama.mjs does for Season 1 — the
 * series label, the "to be continued" line, the comment word and price, the
 * caption's frame and the made-up-story line are added here, never by hand.
 */
import s01 from "./season2/s2-01.mjs";
import s02 from "./season2/s2-02.mjs";
import s03 from "./season2/s2-03.mjs";
import s04 from "./season2/s2-04.mjs";
import s05 from "./season2/s2-05.mjs";
import s06 from "./season2/s2-06.mjs";
import s07 from "./season2/s2-07.mjs";
import s08 from "./season2/s2-08.mjs";
import s09 from "./season2/s2-09.mjs";
import s10 from "./season2/s2-10.mjs";
import s11 from "./season2/s2-11.mjs";
import s12 from "./season2/s2-12.mjs";
import s13 from "./season2/s2-13.mjs";
import s14 from "./season2/s2-14.mjs";
import s15 from "./season2/s2-15.mjs";
import s16 from "./season2/s2-16.mjs";
import s17 from "./season2/s2-17.mjs";
import s18 from "./season2/s2-18.mjs";
import s19 from "./season2/s2-19.mjs";
import s20 from "./season2/s2-20.mjs";
import s21 from "./season2/s2-21.mjs";
import s22 from "./season2/s2-22.mjs";

export const STORIES_S2 = [
  s01, s02, s03, s04, s05, s06, s07, s08, s09, s10, s11,
  s12, s13, s14, s15, s16, s17, s18, s19, s20, s21, s22,
];

const SERIES = "Photo Wahala";
const SEASON = 2;
const LAST = STORIES_S2.length;
const NEXT_DAY = { 1: "Wednesday", 2: "Friday", 3: "Sunday" };

const CAST =
  " Use someone who agreed to play this part — including AI-made story pictures of them: a model, " +
  "a friend, staff. Not a customer's photo from the consent ask. The same person in all four episodes.";
const NO_PERSON = " No person needed.";

/** What the final slide asks for. Each line matches what the bot actually replies. */
function commentBody(word) {
  if (word === "GIF") return "Comment GIF and we'll make yours together, right there in the chat.";
  // Shoots are priced by package — one, five or ten images — so the slide
  // sends people to the link rather than naming a figure. LIGHT, ASSETS and
  // STUDIO (the Gear Equalizer) are all ₦1,000 a photo.
  if (word === "BOOK") return "Comment BOOK and I'll send you the link. The packages and prices are on it.";
  return `Comment ${word} and I'll send you the link. One photo, ₦1,000, back the same day.`;
}
function captionCta(word) {
  if (word === "GIF") return "Comment GIF and we'll make yours right there in the chat.";
  if (word === "BOOK") return "Comment BOOK and I'll send you the link.";
  return `Comment ${word} and I'll send you the link. ₦1,000 a photo.`;
}

/** The plan's id for story n, episode ep: week n, day ep. */
export const idFor = (n, ep) => `p${String((n - 1) * 4 + ep).padStart(2, "0")}`;

/**
 * One episode: the cover, a "Previously" card from episode 2, the beats, the
 * cliffhanger, and the close with the comment word — six cards, eight slides
 * with the photos, ten with the two story pictures.
 */
function episode(s, ep) {
  const n = s.n;
  const e = s.eps[ep - 1];
  const cards = [{ headline: e.cover, body: `${SERIES} S${SEASON} · Story ${n} · Ep ${ep} of 4` }];
  if (ep > 1) cards.push({ eyebrow: "Previously", headline: e.previously });
  for (const [eyebrow, headline, body] of e.beats) cards.push({ eyebrow, headline, body: body ?? "" });
  cards.push({ eyebrow: e.twist[0], headline: e.twist[1], body: e.twist[2] ?? "" });
  cards.push({
    eyebrow: ep < 4 ? `To be continued · Ep ${ep + 1} on ${NEXT_DAY[ep]}`
           : n < LAST ? "New story · next Monday" : `Season ${SEASON} · The end`,
    headline: e.close,
    body: commentBody(s.trigger),
  });

  const next = ep < 4 ? `Ep ${ep + 1} drops ${NEXT_DAY[ep]}. 👀\n\n`
             : n < LAST ? "A new story starts Monday. 👀\n\n" : "";
  const caption =
    `🎬 PHOTO WAHALA S${SEASON} · Story ${n}, Ep ${ep}: ${s.title}\n\n` +
    `${e.caption}\n\n${next}` +
    `📸 ${e.ask} ${captionCta(s.trigger)}\n\n` +
    "The story is made up. The result is real.\n\n" +
    ["#photowahala", ...s.tags, "#aluxart"].join(" ");

  return {
    id: idFor(n, ep),
    week: n, slot: "ABCD"[ep - 1],
    product: s.product, trigger: s.trigger,
    title: `${SERIES} S${SEASON} ${n}.${ep}: ${s.title}`,
    photos: s.photos + (s.person ? CAST : NO_PERSON),
    cards, caption,
  };
}

export const PLAN_S2 = STORIES_S2.flatMap((s) => [1, 2, 3, 4].map((ep) => episode(s, ep)));

/** Episode id → its two story pictures, as the writers described them (storyboard.mjs writes the Flow prompts). */
export const SCENES_S2 = Object.fromEntries(
  STORIES_S2.flatMap((s) => s.eps.map((e, i) => [idFor(s.n, i + 1), e.scenes])),
);

/** Story number → its cast, as written. */
export const CASTS_S2 = Object.fromEntries(STORIES_S2.map((s) => [s.n, s.cast]));

/** Episode id → its four GIF lines. */
export const GIFS_S2 = Object.fromEntries(
  STORIES_S2.flatMap((s) => s.eps.map((e, i) => [idFor(s.n, i + 1), e.gif])),
);
