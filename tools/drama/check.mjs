// Checks every story in tools/drama/stories against the engine (ENGINE.md).
//   node tools/drama/check.mjs            all stories
//   node tools/drama/check.mjs aso-ebi    one story
// Exits 1 if any rule is broken. Prints word counts so a writer can see the budget.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "stories");
export const GENRES = ["power", "thriller", "crime", "romance", "romcom", "family", "mystery", "supernatural", "period", "political"];
export const ARCHETYPES = ["The Oga", "The Guardian", "The Innocent", "The Jester", "The Rebel", "The Warrior", "The Lover", "The Companion", "The Hustler", "The Maker", "The Visionary", "The Sage"];
const SIDES = ["light", "too much", "too little"];
const TIERS = ["lead", "main", "cameo"];
const CLIFFS = ["arrival", "reveal", "clock", "message", "mirror", "loss"];
const MIDDLE = ["beat", "line", "text"];
// Alux's own published products a slot may fall back to (templates.title, published, public).
export const HOUSE = [
  "Noir Director Editorial", "Nursing Induction", "Call to Bar — The New Wig (Female)", "Call to Bar — The New Wig (Male)",
  "Emerald Empress: Beaded Column Gown with Draped Veil", "Asunma / Elite Eid", "The Gear Equalizer — Pro Studio Upgrade",
  "Instagram GIF Maker", "Luma lux", "Regal Burgundy & Gold Tapestry Ensemble", "Penthouse Dusk Paparazzi",
  "Navy Regal Gele & structured capes (Color-Shift)", "Amethyst Opulence: Embellished Traditional Gown", "Emerald Onyx / Matrix Lux",
  "THE CANON G7x iii", "The Asset Extractor",
];
export const words = (s) => (String(s ?? "").match(/[\p{L}\p{N}'’%.-]+/gu) ?? []).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
const EMOJI = /\p{Extended_Pictographic}/u;

export function checkStory(s, file) {
  const errs = [];
  const bad = (m) => errs.push(m);
  if (!s || typeof s !== "object") return ["not an object"];
  if (file && s.slug !== path.basename(file, ".mjs")) bad(`slug "${s.slug}" must match the file name`);
  for (const k of ["slug", "title", "tagline", "genre", "city", "logline"]) if (!String(s[k] ?? "").trim()) bad(`missing ${k}`);
  if (!GENRES.includes(s.genre)) bad(`genre "${s.genre}" is not one of ${GENRES.join(", ")}`);
  if (words(s.title) > 4) bad("title over 4 words");
  if (words(s.tagline) > 8) bad(`tagline ${words(s.tagline)} words (max 8)`);
  if (words(s.logline) > 32) bad(`logline ${words(s.logline)} words (max 32)`);
  if (!Number.isInteger(s.minVotes) || s.minVotes < 2) bad("minVotes must be a whole number, 2 or more");

  const cast = Array.isArray(s.cast) ? s.cast : [];
  const regulars = cast.filter((c) => !c.guest);
  if (regulars.length < 5 || regulars.length > 6) bad(`cast has ${regulars.length} roles (5 or 6, guests not counted)`);
  for (const g of cast.filter((c) => c.guest)) {
    if (g.tier !== "cameo") bad(`${g.key}: a guest is a cameo`);
    if (!Number.isInteger(g.enters) || g.enters < 2) bad(`${g.key}: a guest needs enters: the episode they first appear in (2 or later)`);
  }
  const keys = new Set();
  for (const c of cast) {
    if (keys.has(c.key)) bad(`duplicate role key ${c.key}`);
    keys.add(c.key);
    if (!ARCHETYPES.includes(c.archetype)) bad(`${c.key}: archetype "${c.archetype}" unknown`);
    if (!SIDES.includes(c.side)) bad(`${c.key}: side must be light / too much / too little`);
    if (!TIERS.includes(c.tier)) bad(`${c.key}: tier must be lead / main / cameo`);
    for (const k of ["name", "role", "look", "want", "secret"]) if (!String(c[k] ?? "").trim()) bad(`${c.key}: missing ${k}`);
    if (typeof c.open !== "boolean") bad(`${c.key}: open must be true or false`);
  }
  if (!cast.some((c) => c.tier === "lead")) bad("no lead role");

  const eps = Array.isArray(s.episodes) ? s.episodes : [];
  if (!eps.length) bad("no episodes");
  eps.forEach((e, i) => {
    if (e.n !== i + 1) bad(`episode ${e.n ?? "?"}: episodes must be numbered 1, 2, 3…`);
    checkEpisode(e, `episode ${e.n ?? "?"}`, keys, bad);
  });

  // Episodes written ahead, one per road the votes can take (ENGINE.md §4).
  // `after` is the winning words so far, oldest first ("SPEAK.STAY"), or a
  // "*."-prefixed ending that fits any earlier road ("*.STAY").
  const drafts = s.drafts === undefined ? [] : Array.isArray(s.drafts) ? s.drafts : (bad("drafts must be a list"), []);
  const seen = new Set();
  for (const d of drafts) {
    const tag = `draft ${d.n ?? "?"} after ${d.after ?? "?"}`;
    const parts = String(d.after ?? "").split(".");
    const wild = parts[0] === "*";
    const roadWords = wild ? parts.slice(1) : parts;
    if (!Number.isInteger(d.n) || d.n < 2) bad(`${tag}: n must be 2 or more`);
    if (!roadWords.length || roadWords.some((w) => !/^[A-Z]{2,10}$/.test(w))) bad(`${tag}: after must be words like SPEAK.STAY or *.STAY`);
    if (!wild && roadWords.length !== d.n - 1) bad(`${tag}: after must name one word for each episode before it (${d.n - 1})`);
    if (wild && roadWords.length > d.n - 1) bad(`${tag}: after names more words than there are episodes before it`);
    if (seen.has(`${d.n}:${d.after}`)) bad(`${tag}: written twice`);
    seen.add(`${d.n}:${d.after}`);
    // The last word must be one the episode before it actually offers.
    const parents = d.n === 2 ? eps.filter((e) => e.n === 1) : drafts.filter((p) => p.n === d.n - 1);
    const last = roadWords[roadWords.length - 1];
    if (!parents.some((p) => (p.choice?.options ?? []).some((o) => o.word === last))) bad(`${tag}: no episode ${d.n - 1} offers the word ${last}`);
    checkEpisode(d, tag, keys, bad);
  }

  // A guest is sold until their first episode is made, so that episode must
  // show them on every road, and nothing before it may show them at all.
  const appears = (e, key) => (e.slides ?? []).some((x) => x.who === key);
  for (const g of cast.filter((c) => c.guest && Number.isInteger(c.enters))) {
    for (const e of [...eps, ...drafts]) {
      const tag = e.after ? `draft ${e.n} after ${e.after}` : `episode ${e.n}`;
      if (e.n < g.enters && appears(e, g.key)) bad(`${tag}: guest ${g.key} appears before episode ${g.enters}`);
      if (e.n === g.enters && !appears(e, g.key)) bad(`${tag}: guest ${g.key} enters in this episode but has no slide (who: "${g.key}")`);
    }
    if (![...eps, ...drafts].some((e) => e.n === g.enters)) bad(`${g.key}: episode ${g.enters} is not written on any road yet`);
  }
  return errs;
}

/** The rules every episode follows, posted or written ahead. Returns its caption word count. */
function checkEpisode(e, tag, keys, bad) {
  {
    if (!String(e.title ?? "").trim() || words(e.title) > 4) bad(`${tag}: title missing or over 4 words`);
    const sl = Array.isArray(e.slides) ? e.slides : [];
    if (sl.length !== 8) bad(`${tag}: ${sl.length} slides (must be 8)`);
    const want = ["cover", "time", null, null, null, null, "cliff", "choice"];
    let total = 0;
    sl.forEach((x, j) => {
      const at = `${tag} slide ${j + 1}`;
      if (want[j] ? x.kind !== want[j] : !MIDDLE.includes(x.kind)) bad(`${at}: kind "${x.kind}" (expected ${want[j] ?? MIDDLE.join("/")})`);
      if (!String(x.see ?? "").trim()) bad(`${at}: missing the picture direction (see)`);
      const w = words(x.say);
      if (x.kind === "cover" || x.kind === "choice") { if (w) bad(`${at}: the ${x.kind} slide carries no caption`); return; }
      if (!w) bad(`${at}: empty caption`);
      if (w > 12) bad(`${at}: caption ${w} words (max 12): ${x.say}`);
      total += w;
      if (x.who && !keys.has(x.who)) bad(`${at}: who "${x.who}" is not in the cast`);
      if (x.kind === "line" && !/[“"]/.test(x.say)) bad(`${at}: a line is spoken — put it in quotes`);
      if (x.kind !== "line" && x.kind !== "cliff" && /!/.test(x.say)) bad(`${at}: no exclamation marks outside speech`);
      if (EMOJI.test(x.say)) bad(`${at}: no emoji`);
      if (x.scene !== undefined) {
        if (words(x.scene) > 8) bad(`${at}: scene line ${words(x.scene)} words (max 8): ${x.scene}`);
        if (EMOJI.test(x.scene) || /!/.test(x.scene)) bad(`${at}: scene line takes no emoji or exclamation marks`);
      }
    });
    if (total > 70) bad(`${tag}: ${total} caption words (max 70)`);
    e._words = total;
    if (!CLIFFS.includes(e.cliff?.type)) bad(`${tag}: cliff.type must be one of ${CLIFFS.join(", ")}`);
    const opts = e.choice?.options ?? [];
    if (words(e.choice?.question) < 3 || words(e.choice?.question) > 10) bad(`${tag}: choice question must be 3-10 words`);
    if (opts.length !== 2) bad(`${tag}: exactly two options`);
    for (const o of opts) {
      if (!/^[A-Z]{2,10}$/.test(o.word ?? "")) bad(`${tag}: option word "${o.word}" must be one uppercase word`);
      if (!String(o.label ?? "").trim() || words(o.label) > 4) bad(`${tag}: option label "${o.label}" (max 4 words)`);
      if (!String(e.branches?.[o.word] ?? "").trim()) bad(`${tag}: no branch written for ${o.word}`);
    }
    if (opts.length === 2 && opts[0].word === opts[1].word) bad(`${tag}: the two words must differ`);
    const slots = Array.isArray(e.slots) ? e.slots : [];
    if (slots.length < 1 || slots.length > 2) bad(`${tag}: 1 or 2 brand slots`);
    for (const sl2 of slots) {
      if (!sl2.key || !String(sl2.object ?? "").trim()) bad(`${tag}: slot needs a key and an object`);
      if (!(sl2.slide >= 1 && sl2.slide <= 8)) bad(`${tag}: slot ${sl2.key} needs a slide number 1-8`);
      if (!HOUSE.includes(sl2.house)) bad(`${tag}: slot ${sl2.key} house product "${sl2.house}" is not an Alux product`);
    }
    if (!HOUSE.includes(e.alux?.product) || !String(e.alux?.where ?? "").trim()) bad(`${tag}: needs an Alux moment (alux.product + where)`);
  }
  return e._words;
}

export async function loadStories(only) {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".mjs") && (!only || f === `${only}.mjs`)).sort();
  const out = [];
  for (const f of files) out.push({ file: f, story: (await import(pathToFileURL(path.join(DIR, f)).href)).default });
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const list = await loadStories(process.argv[2]);
  let failed = 0;
  const slugs = new Set();
  for (const { file, story } of list) {
    const errs = checkStory(story, file);
    if (slugs.has(story.slug)) errs.push("slug used by another story");
    slugs.add(story.slug);
    const w = [...(story.episodes ?? []).map((e) => `ep${e.n} ${e._words ?? "?"}w`),
      ...(story.drafts ?? []).map((d) => `ep${d.n} after ${d.after} ${d._words ?? "?"}w`)].join(", ");
    console.log(`${errs.length ? "FAIL" : "ok  "}  ${story.slug} (${story.genre}, ${story.city}) — ${w}`);
    for (const e of errs) console.log(`        - ${e}`);
    if (errs.length) failed++;
  }
  console.log(`\n${list.length} stories, ${failed} with problems`);
  process.exit(failed ? 1 : 0);
}
