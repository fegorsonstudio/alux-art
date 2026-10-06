/**
 * THE CALENDAR — every Photo Wahala post, in the order it goes out.
 *
 * One post at 7pm Lagos, Monday, Wednesday, Friday and Sunday. The owner asked
 * for one clear order (6 October 2026): Season 1 first, then Season 2.
 *
 *   SEASON 1   Mon 12 Oct 2026 – Sun 27 Dec 2026   11 stories   s1-01-1 … s1-11-4
 *   SEASON 2   Mon 28 Dec 2026 – Sun 2 May 2027    18 stories   s2-01-1 … s2-18-4
 *   DECEMBER SPECIALS — 4 December stories held for December 2027 (hidden,
 *   undated)                                                     dec-1-1 … dec-4-4
 *
 * Every story is one file in stories/, named as the calendar names it
 * (stories/s1-03.mjs is "S1 · Story 03"), written to ../COPY-FORMULA.md and
 * checked by stories/check.mjs. This file only turns them into posts — the
 * series label, the "to be continued" line, the next story's hook, the comment
 * word and price, the caption's frame and the made-up-story line are added
 * here, never by hand.
 */
import { storyboardOf } from "./storyboard.mjs";

const HOUR = 19;
const SEASON1_START = "2026-10-12";
const SEASON2_START = "2026-12-28";

const pad = (n) => String(n).padStart(2, "0");
const load = async (id) => (await import(`./stories/${id}.mjs`)).default;

export const SEASON1 = await Promise.all(Array.from({ length: 11 }, (_, i) => load(`s1-${pad(i + 1)}`)));
export const SEASON2 = await Promise.all(Array.from({ length: 18 }, (_, i) => load(`s2-${pad(i + 1)}`)));
export const DECEMBER = await Promise.all(Array.from({ length: 4 }, (_, i) => load(`dec-${i + 1}`)));

const NEXT_DAY = { 1: "Wednesday", 2: "Friday", 3: "Sunday" };

/** Monday + week + day (Mon, Wed, Fri, Sun) at 7pm, as a Lagos time. */
export function dateFor(startMonday, week, ep) {
  const d = new Date(`${startMonday}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (week - 1) * 7 + [0, 2, 4, 6][ep - 1]);
  return `${d.toISOString().slice(0, 10)}T${pad(HOUR)}:00:00+01:00`;
}

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

/**
 * One run of stories. Episode 4 of each story ends on the NEXT story's hook
 * (its own two `hook` lines), so the week's payoff hands straight to Monday;
 * the run's last story ends on `last` instead.
 */
function series({ stories, season, label, captionTag, idTag, batch, start, last }) {
  return stories.flatMap((s, i) => {
    const n = i + 1;
    const num = idTag === "dec" ? String(n) : pad(n);
    const final = n === stories.length;
    return [1, 2, 3, 4].map((ep) => {
      const e = s.eps[ep - 1];
      const cards = [{ headline: e.cover, body: `Photo Wahala ${label} · Story ${n} · Ep ${ep} of 4` }];
      if (ep > 1) cards.push({ eyebrow: "Previously", headline: e.previously });
      for (const [eyebrow, headline, body] of e.beats) cards.push({ eyebrow, headline, body: body ?? "" });

      const twist = ep < 4 ? e.twist : final ? last.twist : ["Next Monday on Photo Wahala", ...stories[i + 1].hook];
      cards.push({ eyebrow: twist[0], headline: twist[1], body: twist[2] ?? "" });
      cards.push({
        eyebrow: ep < 4 ? `To be continued · Ep ${ep + 1} on ${NEXT_DAY[ep]}` : final ? last.eyebrow : "New story · next Monday",
        headline: e.close,
        body: commentBody(s.trigger),
      });

      const next = ep < 4 ? `Ep ${ep + 1} drops ${NEXT_DAY[ep]}. 👀\n\n` : final ? (last.next ?? "") : "A new story starts Monday. 👀\n\n";
      const caption =
        `🎬 PHOTO WAHALA ${captionTag} · Story ${n}, Ep ${ep}: ${s.title}\n\n` +
        `${e.caption}\n\n${next}` +
        `📸 ${e.ask} ${captionCta(s.trigger)}\n\n` +
        "The story is made up. The result is real.\n\n" +
        ["#photowahala", ...s.tags, "#aluxart"].join(" ");

      return {
        id: `${idTag}-${num}-${ep}`, batch,
        hidden: !start, when: start ? dateFor(start, n, ep) : null,
        title: `${label === "December Special" ? "December" : label} · Story ${num} · Ep ${ep} — ${s.title}`,
        product: s.product, trigger: s.trigger,
        photos: s.photos + (s.person ? CAST : NO_PERSON),
        cards, caption,
        storyboard: storyboardOf(s, ep, season, n),
        gifLines: e.gif ?? [],
      };
    });
  });
}

const season1 = series({
  stories: SEASON1, season: 1, label: "S1", captionTag: "S1", idTag: "s1", batch: "season1",
  start: SEASON1_START,
  last: {
    twist: ["Tomorrow: Season 2 begins", ...SEASON2[0].hook],
    eyebrow: "Season 1 · The end",
    next: "Season 2 starts tomorrow at 7pm. 👀\n\n",
  },
});

const season2 = series({
  stories: SEASON2, season: 2, label: "S2", captionTag: "S2", idTag: "s2", batch: "season2",
  start: SEASON2_START,
  last: {
    twist: ["That's the end of Season 2", "Which story was yours? Tell us in the comments.", "Season 3 is being written. Your photo wahala could be in it."],
    eyebrow: "Season 2 · The end",
    next: "That's the end of Season 2 of Photo Wahala. Which story was yours? Tell us in the comments. Season 3 is being written. 🎬\n\n",
  },
});

const december = series({
  stories: DECEMBER, season: "december", label: "December Special", captionTag: "· DECEMBER SPECIAL",
  idTag: "dec", batch: "december", start: null,
  last: {
    twist: ["That's the end of the December specials", "Merry Christmas from Photo Wahala.", "A new story starts Monday."],
    eyebrow: "December specials · The end",
  },
});

/** Every post, in posting order; the December specials last, undated. */
export const SCHEDULE = [...season1, ...season2, ...december];
