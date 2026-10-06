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
 * Ids read as season-story-episode, and so do the titles:
 * "S1 · Story 01 · Ep 1 — The Asoebi Group Chat".
 *
 * Season 2 runs in calendar order rather than the order the stories were
 * written in (season2/s2-NN.mjs), so New Year's Day, Valentine's Day and
 * Mothering Sunday land on their day. Each story's last episode teases the
 * story that actually follows it, worked out here.
 */
import { PLAN3 } from "./plan-microdrama.mjs";
import { STORIES_S2 } from "./plan-season2.mjs";
import { storyboardFor } from "./storyboard.mjs";
import { GIF_SCRIPTS } from "./gif-scripts.mjs";

const HOUR = 19;
const SEASON1_START = "2026-10-12";
const SEASON2_START = "2026-12-28";

/** Written stories (by their file number) in the order Season 2 airs them. */
const SEASON2_ORDER = [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 1, 2, 3, 4, 5, 6, 7, 8];
/** The December stories, held for December 2027. */
const DECEMBER_ORDER = [9, 10, 11, 12];

const NEXT_DAY = { 1: "Wednesday", 2: "Friday", 3: "Sunday" };
const pad = (n) => String(n).padStart(2, "0");

/** Monday + week + day (A-D = Mon, Wed, Fri, Sun) at 7pm, as a Lagos time. */
export function dateFor(startMonday, week, ep) {
  const d = new Date(`${startMonday}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (week - 1) * 7 + [0, 2, 4, 6][ep - 1]);
  return `${d.toISOString().slice(0, 10)}T${pad(HOUR)}:00:00+01:00`;
}

const CAST =
  " Use someone who agreed to play this part — including AI-made story pictures of them: a model, " +
  "a friend, staff. Not a customer's photo from the consent ask. The same person in all four episodes.";
const NO_PERSON = " No person needed.";

function commentBody(word) {
  if (word === "GIF") return "Comment GIF and we'll make yours together, right there in the chat.";
  if (word === "BOOK") return "Comment BOOK and I'll send you the link. The packages and prices are on it.";
  return `Comment ${word} and I'll send you the link. One photo, ₦1,000, back the same day.`;
}
function captionCta(word) {
  if (word === "GIF") return "Comment GIF and we'll make yours right there in the chat.";
  if (word === "BOOK") return "Comment BOOK and I'll send you the link.";
  return `Comment ${word} and I'll send you the link. ₦1,000 a photo.`;
}

// ── Season 1 ────────────────────────────────────────────────────────────────
// Built by plan-microdrama.mjs; renamed and dated here. Its finale now hands
// over to Season 2, which starts the next day.
const season1 = PLAN3.map((p) => {
  const story = p.week;
  const ep = "ABCD".indexOf(p.slot) + 1;
  let cards = p.cards;
  let caption = p.caption.replace(/^🎬 PHOTO WAHALA · /, "🎬 PHOTO WAHALA S1 · ");
  if (story === 11 && ep === 4) {
    cards = cards.map((c) => (c.body === "Season 2 is on now, every night at 7." ? { ...c, body: "Season 2 starts tomorrow at 7pm." } : c));
    caption = caption.replace("Season 2 is on now, every night at 7.", "Season 2 starts tomorrow at 7pm.");
  }
  const title = p.title.replace(/^Photo Wahala \d+\.\d: /, "");
  return {
    id: `s1-${pad(story)}-${ep}`, batch: "season1", hidden: false,
    when: dateFor(SEASON1_START, story, ep),
    title: `S1 · Story ${pad(story)} · Ep ${ep} — ${title}`,
    product: p.product, trigger: p.trigger, photos: p.photos,
    cards, caption,
    storyboard: storyboardFor(p.id),
    gifLines: GIF_SCRIPTS[p.id] ?? [],
  };
});

// ── Season 2 and the December specials ─────────────────────────────────────
const byFile = Object.fromEntries(STORIES_S2.map((s) => [s.n, s]));

/**
 * The hook that introduces a written story: the two lines the story before it
 * (in writing order) ended on. Story 1 opened the season, so it has its own.
 */
function hookFor(file) {
  if (file === 1) return ["Ify posted the birthday photo and tagged 40 people.", "Temi, the birthday girl, looks like a bruise in it."];
  const t = byFile[file - 1].eps[3].twist;
  return [t[1], t[2] ?? ""];
}

const SEASON2_FINALE = "That's the end of Season 2 of Photo Wahala. Which story was yours? Tell us in the comments. Season 3 is being written. 🎬";

function series({ order, season, label, titleTag, idTag, batch, start, last }) {
  return order.flatMap((file, i) => {
    const s = byFile[file];
    const n = i + 1;
    const final = n === order.length;
    return [1, 2, 3, 4].map((ep) => {
      const e = s.eps[ep - 1];
      const cards = [{ headline: e.cover, body: `Photo Wahala ${label} · Story ${n} · Ep ${ep} of 4` }];
      if (ep > 1) cards.push({ eyebrow: "Previously", headline: e.previously });
      for (const [eyebrow, headline, body] of e.beats) cards.push({ eyebrow, headline, body: body ?? "" });

      let twist = e.twist;
      if (ep === 4) twist = final ? last.twist : ["Next Monday on Photo Wahala", ...hookFor(order[i + 1])];
      cards.push({ eyebrow: twist[0], headline: twist[1], body: twist[2] ?? "" });
      cards.push({
        eyebrow: ep < 4 ? `To be continued · Ep ${ep + 1} on ${NEXT_DAY[ep]}` : final ? last.eyebrow : "New story · next Monday",
        headline: e.close,
        body: commentBody(s.trigger),
      });

      // The written finale paragraph belongs to whichever story now ends the season.
      let body = e.caption.replace(/\n*That's the end of Season 2[\s\S]*$/, "").trimEnd();
      if (ep === 4 && final && last.caption) body += `\n\n${last.caption}`;
      const next = ep < 4 ? `Ep ${ep + 1} drops ${NEXT_DAY[ep]}. 👀\n\n` : final ? "" : "A new story starts Monday. 👀\n\n";
      const caption =
        `🎬 PHOTO WAHALA ${season} · Story ${n}, Ep ${ep}: ${s.title}\n\n` +
        `${body}\n\n${next}` +
        `📸 ${e.ask} ${captionCta(s.trigger)}\n\n` +
        "The story is made up. The result is real.\n\n" +
        ["#photowahala", ...s.tags, "#aluxart"].join(" ");

      const original = `p${pad((file - 1) * 4 + ep)}`;
      return {
        id: `${idTag}-${idTag === "dec" ? n : pad(n)}-${ep}`, batch,
        hidden: !start, when: start ? dateFor(start, n, ep) : null,
        title: `${titleTag} · Story ${idTag === "dec" ? n : pad(n)} · Ep ${ep} — ${s.title}`,
        product: s.product, trigger: s.trigger,
        photos: s.photos + (s.person ? CAST : NO_PERSON),
        cards, caption,
        storyboard: storyboardFor(original),
        gifLines: GIF_SCRIPTS[original] ?? [],
      };
    });
  });
}

const season2 = series({
  order: SEASON2_ORDER, season: "S2", label: "S2", titleTag: "S2", idTag: "s2", batch: "season2",
  start: SEASON2_START,
  last: {
    twist: ["That's the end of Season 2", "Which story was yours? Tell us in the comments.", "Season 3 is being written. Your photo wahala could be in it."],
    eyebrow: "Season 2 · The end",
    caption: SEASON2_FINALE,
  },
});

const december = series({
  order: DECEMBER_ORDER, season: "· DECEMBER SPECIAL", label: "December Special", titleTag: "December",
  idTag: "dec", batch: "december", start: null,
  last: {
    twist: ["That's the end of the December specials", "Merry Christmas from Photo Wahala.", "A new story starts Monday."],
    eyebrow: "December specials · The end",
    caption: "",
  },
});

/** Every post, in posting order; the December specials last, undated. */
export const SCHEDULE = [...season1, ...season2, ...december];
