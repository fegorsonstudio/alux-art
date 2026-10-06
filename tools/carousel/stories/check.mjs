/**
 * Checks every Photo Wahala story file against ../COPY-FORMULA.md.
 *
 *   node tools/carousel/stories/check.mjs              every story
 *   node tools/carousel/stories/check.mjs s1-01 s2-07  only these
 *
 * Exits 1 when anything breaks a hard rule. Character limits are what fits
 * the slide renderer; word limits are the research's (RESEARCH.md) — one
 * thought per slide, lines that can be read while scrolling.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const pad = (n) => String(n).padStart(2, "0");
const ALL = [
  ...Array.from({ length: 11 }, (_, i) => `s1-${pad(i + 1)}`),
  ...Array.from({ length: 18 }, (_, i) => `s2-${pad(i + 1)}`),
  ...Array.from({ length: 4 }, (_, i) => `dec-${i + 1}`),
];

/** The product each slot sells — fixed by the calendar, so the mix stays as planned. */
const PRODUCT = {
  "s1-01": "relight", "s1-02": "assets", "s1-03": "studio", "s1-04": "relight", "s1-05": "shoot", "s1-06": "gif",
  "s1-07": "relight", "s1-08": "studio", "s1-09": "shoot", "s1-10": "relight", "s1-11": "shoot",
  "s2-01": "shoot", "s2-02": "relight", "s2-03": "gif", "s2-04": "studio", "s2-05": "shoot", "s2-06": "relight",
  "s2-07": "studio", "s2-08": "relight", "s2-09": "relight", "s2-10": "relight", "s2-11": "relight", "s2-12": "studio",
  "s2-13": "assets", "s2-14": "relight", "s2-15": "shoot", "s2-16": "gif", "s2-17": "relight", "s2-18": "studio",
  "dec-1": "relight", "dec-2": "assets", "dec-3": "studio", "dec-4": "studio",
};
const WORD = { relight: "LIGHT", studio: "STUDIO", shoot: "BOOK", assets: "ASSETS", gif: "GIF" };
/** Episodes that post on a holiday, and the word they must use. */
const HOLIDAY = {
  "s1-11": [3, "Christmas"], "s2-01": [3, "New Year"], "s2-07": [4, "Valentine"],
  "s2-10": [4, "Mothering Sunday"], "s2-13": [4, "Easter"], "dec-4": [3, "Christmas"],
};
const CLIFFS = ["reveal", "reversal", "deadline", "intrusion", "document"];
const EMOJI = /\p{Extended_Pictographic}/u;
const HYPE = /\b(stunning|masterpiece|epic|breathtaking|flawless|insane|jaw-dropping|mind-blowing)\b/i;
const MAX = { cover: 75, previously: 90, eyebrow: 34, headline: 75, body: 120, close: 60, caption: 600, gif: 26, label: 40 };
const WORDS = { cover: 14, previously: 15, headline: 14, body: 22, quote: 10, insult: 10 };

const wanted = process.argv.slice(2);
const ids = wanted.length ? wanted : ALL;

let errors = 0;
let warnings = 0;
let missing = 0;
const err = (id, where, msg) => { errors++; console.log(`ERROR  ${id} ${where}: ${msg}`); };
const warn = (id, where, msg) => { warnings++; console.log(`warn   ${id} ${where}: ${msg}`); };
const str = (v) => typeof v === "string" && v.trim().length > 0;
const words = (v) => String(v).trim().split(/\s+/).filter(Boolean).length;

function slideText(id, where, label, v, max, maxWords, { optional = false } = {}) {
  if (v === undefined || v === "") { if (!optional) err(id, where, `${label} is missing`); return; }
  if (typeof v !== "string") { err(id, where, `${label} must be text`); return; }
  if (v.length > max) err(id, where, `${label} is ${v.length} characters (max ${max}): "${v}"`);
  if (maxWords && words(v) > maxWords) err(id, where, `${label} is ${words(v)} words (max ${maxWords}): "${v}"`);
  // A spoken line is short: one breath, read while scrolling.
  for (const q of v.match(/“[^”]*”/g) ?? []) {
    if (words(q) > WORDS.quote + 2) warn(id, where, `a line of dialogue runs ${words(q)} words — 10 reads best: ${q}`);
  }
  if (EMOJI.test(v)) err(id, where, `${label} has an emoji — slides can't draw them: "${v}"`);
  if (/#\w/.test(v)) err(id, where, `${label} has a hashtag — those belong in the caption: "${v}"`);
  if (HYPE.test(v)) err(id, where, `${label} uses a hype word (${v.match(HYPE)[0]}): "${v}"`);
}

for (const id of ids) {
  const file = join(HERE, `${id}.mjs`);
  if (!existsSync(file)) { missing++; if (wanted.length) err(id, "file", "not written yet"); continue; }
  let s;
  try { s = (await import(pathToFileURL(file).href)).default; }
  catch (e) { err(id, "file", `does not load: ${e.message}`); continue; }

  if (s?.id !== id) err(id, "id", `should be "${id}"`);
  if (!str(s.title)) err(id, "title", "missing");
  if (PRODUCT[id] && s.product !== PRODUCT[id]) err(id, "product", `this slot sells ${PRODUCT[id]}, not ${s.product}`);
  if (s.trigger !== WORD[s.product]) err(id, "trigger", `${s.product} must use ${WORD[s.product]}, not ${s.trigger}`);
  if (!Array.isArray(s.tags) || s.tags.length !== 3 || !s.tags.every((t) => /^#[a-z0-9]+$/.test(t))) {
    err(id, "tags", "three lowercase hashtags like #lekki");
  }
  if (!str(s.photos)) err(id, "photos", "missing");
  if (typeof s.person !== "boolean") err(id, "person", "true or false");
  if (!str(s.engine)) err(id, "engine", "one sentence: who must do what before when, while who stands in the way");
  if (!str(s.antiTrope)) err(id, "antiTrope", "where does this story refuse the expected move?");

  // The hook is the cliffhanger on the previous story's Sunday post.
  if (!Array.isArray(s.hook) || s.hook.length !== 2) err(id, "hook", "two lines: the slap, then the stakes");
  else {
    slideText(id, "hook", "line 1", s.hook[0], MAX.headline, WORDS.headline);
    slideText(id, "hook", "line 2", s.hook[1], MAX.body, WORDS.body);
  }

  const sec = s.secret ?? {};
  if (!str(sec.truth)) err(id, "secret", "the hidden truth is missing");
  if (![1, 2].includes(sec.planted)) err(id, "secret", "planted must be episode 1 or 2");
  if (![3, 4].includes(sec.paid)) err(id, "secret", "paid must be episode 3 or 4");

  const names = new Set();
  const cast = Array.isArray(s.cast) ? s.cast : [];
  if (!cast.length) err(id, "cast", "missing");
  if (cast.length > 4) err(id, "cast", `${cast.length} named characters — three, four at the very most`);
  else if (cast.length === 4) warn(id, "cast", "four named characters — three track best");
  for (const c of cast) {
    if (!str(c.name)) err(id, "cast", "a member has no name");
    if (names.has(c.name)) err(id, "cast", `"${c.name}" twice`);
    names.add(c.name);
    if (typeof c.real !== "boolean") err(id, `cast ${c.name}`, "real must be true or false");
    if (!str(c.who)) err(id, `cast ${c.name}`, "needs a description");
    if (!str(c.label)) err(id, `cast ${c.name}`, "needs a label — \"the group admin\"");
    else if (c.label.length > MAX.label) err(id, `cast ${c.name}`, `label is ${c.label.length} characters (max ${MAX.label})`);
  }
  if (s.person && !cast.some((c) => c.real)) err(id, "cast", "the photos show a person, so one cast member must be real");

  if (!Array.isArray(s.eps) || s.eps.length !== 4) { err(id, "eps", "exactly 4 episodes"); continue; }

  const epText = s.eps.map((e) => [e.cover, e.previously, ...(e.beats ?? []).flat(), ...(e.twist ?? []), e.close]
    .filter((x) => typeof x === "string").join(" \n "));

  for (const [key, eps] of [["insult", [1, 2]], ["throwback", [3, 4]]]) {
    const x = s[key] ?? {};
    if (!eps.includes(x.ep)) err(id, key, `ep must be ${eps.join(" or ")}`);
    if (!str(x.line)) { err(id, key, "line missing"); continue; }
    if (words(x.line) > WORDS.insult + 2) err(id, key, `${words(x.line)} words — a quotable line is 10 or fewer`);
    if (eps.includes(x.ep) && !epText[x.ep - 1].includes(x.line)) err(id, key, `"${x.line}" is not on the ep ${x.ep} slides word for word`);
  }

  let priceCards = 0;
  const cliffs = [];
  s.eps.forEach((e, i) => {
    const ep = i + 1;
    const at = `ep ${ep}`;
    slideText(id, at, "cover", e.cover, MAX.cover, WORDS.cover);
    if (ep === 1 && e.previously) err(id, at, "episode 1 has no Previously card");
    if (ep > 1) slideText(id, at, "previously", e.previously, MAX.previously, WORDS.previously);

    const beats = Array.isArray(e.beats) ? e.beats : [];
    if (beats.length !== (ep === 1 ? 3 : 2)) err(id, at, `needs ${ep === 1 ? 3 : 2} beats, has ${beats.length}`);
    beats.forEach((b, j) => {
      if (!Array.isArray(b) || b.length < 2 || b.length > 3) { err(id, `${at} beat ${j + 1}`, "is [eyebrow, headline, body]"); return; }
      slideText(id, `${at} beat ${j + 1}`, "eyebrow", b[0], MAX.eyebrow);
      slideText(id, `${at} beat ${j + 1}`, "headline", b[1], MAX.headline, WORDS.headline);
      slideText(id, `${at} beat ${j + 1}`, "body", b[2], MAX.body, WORDS.body, { optional: true });
    });

    if (ep < 4) {
      const t = Array.isArray(e.twist) ? e.twist : [];
      if (t.length < 2 || t.length > 3) err(id, at, "twist is [eyebrow, headline, body?]");
      slideText(id, `${at} twist`, "eyebrow", t[0], MAX.eyebrow);
      slideText(id, `${at} twist`, "headline", t[1], MAX.headline, WORDS.headline);
      slideText(id, `${at} twist`, "body", t[2], MAX.body, WORDS.body, { optional: true });
      if (/to be continued/i.test(t.join(" "))) err(id, `${at} twist`, "a cliffhanger adds something new — \"to be continued\" is added by the builder");
      if (!CLIFFS.includes(e.cliff)) err(id, at, `cliff must be one of ${CLIFFS.join(", ")}`);
      else cliffs.push(e.cliff);
    } else if (e.twist) err(id, at, "episode 4 has no twist — the next story's hook goes there");

    const exclaims = (epText[i].match(/!/g) ?? []).length;
    if (exclaims > 1) err(id, at, `${exclaims} exclamation marks on the slides — one at most`);

    slideText(id, at, "close", e.close, MAX.close);
    if (!str(e.caption)) err(id, at, "caption missing");
    else {
      if (e.caption.length > MAX.caption) err(id, at, `caption is ${e.caption.length} characters (max ${MAX.caption})`);
      if (/The story is made up/i.test(e.caption)) err(id, at, "leave out \"The story is made up…\" — it is added automatically");
      if (/#\w/.test(e.caption)) err(id, at, "leave hashtags out of the caption — they are added automatically");
      if (HYPE.test(e.caption)) err(id, at, `caption uses a hype word (${e.caption.match(HYPE)[0]})`);
    }
    if (!str(e.ask)) err(id, at, "ask missing");

    priceCards += (epText[i].match(/₦1,000/g) ?? []).length;
    if ((s.trigger === "BOOK" || s.trigger === "GIF") && /₦1,000/.test(epText[i])) {
      err(id, at, `${s.trigger} never names a price on the slides`);
    }

    const sc = Array.isArray(e.scenes) ? e.scenes : [];
    const after = ep === 1 ? [2, 4] : [3, 4];
    if (sc.length !== 2) err(id, at, "exactly 2 scenes");
    sc.forEach((x, j) => {
      if (x.after !== after[j]) err(id, `${at} scene ${j + 1}`, `goes after card ${after[j]}, not ${x.after}`);
      if (!Array.isArray(x.attach) || !x.attach.length) err(id, `${at} scene ${j + 1}`, "attach is a list of cast names");
      for (const a of x.attach ?? []) if (!names.has(a)) err(id, `${at} scene ${j + 1}`, `attaches "${a}", who is not in the cast`);
      for (const k of ["setting", "subject", "details"]) if (!str(x[k])) err(id, `${at} scene ${j + 1}`, `${k} missing`);
    });

    const g = Array.isArray(e.gif) ? e.gif : [];
    if (g.length !== 4) err(id, at, "gif needs exactly 4 lines");
    g.forEach((l, j) => {
      if (!str(l)) err(id, `${at} gif ${j + 1}`, "empty");
      else {
        if (l.length > MAX.gif) err(id, `${at} gif ${j + 1}`, `${l.length} characters (max ${MAX.gif}): "${l}"`);
        else if (l.length > 22) warn(id, `${at} gif ${j + 1}`, `${l.length} characters — 22 reads best: "${l}"`);
        if (EMOJI.test(l) || /₦/.test(l)) err(id, `${at} gif ${j + 1}`, "no emoji or ₦ in a GIF line");
      }
    });
  });

  if (new Set(cliffs).size < 2) err(id, "cliffs", `the three cliffhangers are all "${cliffs[0]}" — use at least two kinds`);
  if (priceCards > 1) warn(id, "price", `₦1,000 appears ${priceCards} times on the slides — once per story is plenty`);
  const h = HOLIDAY[id];
  if (h) {
    const e = s.eps[h[0] - 1];
    if (!JSON.stringify([epText[h[0] - 1], e.caption]).includes(h[1])) err(id, `ep ${h[0]}`, `posts on ${h[1]} and must say so`);
  }
}

console.log(`\n${ids.length - missing} checked${missing ? `, ${missing} not written yet` : ""} · ${errors} error(s), ${warnings} warning(s)`);
process.exit(errors ? 1 : 0);
