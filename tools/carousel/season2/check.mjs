/**
 * Checks Season 2 story files (s2-01.mjs … s2-22.mjs) against the writers'
 * rules in OUTLINE.md and the house style in ../COPY-FORMULA.md.
 *
 *   node tools/carousel/season2/check.mjs          every story file present
 *   node tools/carousel/season2/check.mjs 7 8 9    only these stories
 *
 * Exits 1 when anything breaks a hard rule. Lengths are what fits the slide
 * renderer and a GIF in a comment, not taste.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORD = { relight: "LIGHT", studio: "STUDIO", shoot: "BOOK", assets: "ASSETS", gif: "GIF" };
const EMOJI = /\p{Extended_Pictographic}/u;
const MAX = { cover: 75, previously: 90, eyebrow: 34, headline: 75, body: 120, close: 60, caption: 600, gif: 26 };
const HOLIDAY = { 12: [3, "Christmas"], 13: [3, "New Year"], 19: [4, "Valentine"], 22: [4, "Mothering Sunday"] };

const wanted = process.argv.slice(2).map(Number).filter(Boolean);
const numbers = wanted.length ? wanted : Array.from({ length: 22 }, (_, i) => i + 1);

let errors = 0;
let warnings = 0;
const err = (n, where, msg) => { errors++; console.log(`ERROR  story ${n} ${where}: ${msg}`); };
const warn = (n, where, msg) => { warnings++; console.log(`warn   story ${n} ${where}: ${msg}`); };
const str = (v) => typeof v === "string" && v.trim().length > 0;

function slideText(n, where, label, v, max, { optional = false } = {}) {
  if (v === undefined || v === "") { if (!optional) err(n, where, `${label} is missing`); return; }
  if (typeof v !== "string") { err(n, where, `${label} must be text`); return; }
  if (v.length > max) err(n, where, `${label} is ${v.length} characters (max ${max}): "${v}"`);
  if (EMOJI.test(v)) err(n, where, `${label} has an emoji — slides can't draw them: "${v}"`);
  if (/#\w/.test(v)) err(n, where, `${label} has a hashtag — those belong in the caption: "${v}"`);
}

for (const n of numbers) {
  const file = join(HERE, `s2-${String(n).padStart(2, "0")}.mjs`);
  if (!existsSync(file)) { if (wanted.length) err(n, "file", "not written yet"); continue; }
  let s;
  try { s = (await import(pathToFileURL(file).href)).default; }
  catch (e) { err(n, "file", `does not load: ${e.message}`); continue; }

  if (s?.n !== n) err(n, "n", `should be ${n}`);
  if (!str(s.title)) err(n, "title", "missing");
  if (!WORD[s.product]) err(n, "product", `"${s.product}" is not one of ${Object.keys(WORD).join(", ")}`);
  else if (s.trigger !== WORD[s.product]) err(n, "trigger", `${s.product} must use ${WORD[s.product]}, not ${s.trigger}`);
  if (!Array.isArray(s.tags) || s.tags.length !== 3 || !s.tags.every((t) => /^#[a-z0-9]+$/.test(t))) {
    err(n, "tags", "three lowercase hashtags like #lekki");
  }
  if (!str(s.photos)) err(n, "photos", "missing");
  if (typeof s.person !== "boolean") err(n, "person", "true or false");

  const names = new Set();
  if (!Array.isArray(s.cast) || !s.cast.length) err(n, "cast", "missing");
  for (const c of s.cast ?? []) {
    if (!str(c.name)) err(n, "cast", "a member has no name");
    if (names.has(c.name)) err(n, "cast", `"${c.name}" twice`);
    names.add(c.name);
    if (typeof c.real !== "boolean") err(n, `cast ${c.name}`, "real must be true or false");
    if (!str(c.who)) err(n, `cast ${c.name}`, "needs a description");
  }
  if (s.person && !(s.cast ?? []).some((c) => c.real)) err(n, "cast", "the photos show a person, so one cast member must be real");

  if (!Array.isArray(s.eps) || s.eps.length !== 4) { err(n, "eps", "exactly 4 episodes"); continue; }
  let priceCards = 0;
  s.eps.forEach((e, i) => {
    const ep = i + 1;
    const at = `ep ${ep}`;
    slideText(n, at, "cover", e.cover, MAX.cover);
    if (ep === 1 && e.previously) err(n, at, "episode 1 has no Previously card");
    if (ep > 1) slideText(n, at, "previously", e.previously, MAX.previously);

    const beats = Array.isArray(e.beats) ? e.beats : [];
    if (beats.length !== (ep === 1 ? 3 : 2)) err(n, at, `needs ${ep === 1 ? 3 : 2} beats, has ${beats.length}`);
    beats.forEach((b, j) => {
      if (!Array.isArray(b) || b.length < 2 || b.length > 3) { err(n, `${at} beat ${j + 1}`, "is [eyebrow, headline, body]"); return; }
      slideText(n, `${at} beat ${j + 1}`, "eyebrow", b[0], MAX.eyebrow);
      slideText(n, `${at} beat ${j + 1}`, "headline", b[1], MAX.headline);
      slideText(n, `${at} beat ${j + 1}`, "body", b[2], MAX.body, { optional: true });
    });

    const t = Array.isArray(e.twist) ? e.twist : [];
    if (t.length < 2 || t.length > 3) err(n, at, "twist is [eyebrow, headline, body?]");
    slideText(n, `${at} twist`, "eyebrow", t[0], MAX.eyebrow);
    slideText(n, `${at} twist`, "headline", t[1], MAX.headline);
    slideText(n, `${at} twist`, "body", t[2], MAX.body, { optional: true });
    if (ep === 4) {
      const want = n < 22 ? "Next Monday on Photo Wahala" : "That's the end of Season 2";
      if (t[0] !== want) err(n, `${at} twist`, `eyebrow must be "${want}"`);
    }

    slideText(n, at, "close", e.close, MAX.close);
    if (!str(e.caption)) err(n, at, "caption missing");
    else {
      if (e.caption.length > MAX.caption) err(n, at, `caption is ${e.caption.length} characters (max ${MAX.caption})`);
      if (/The story is made up/i.test(e.caption)) err(n, at, "leave out \"The story is made up…\" — it is added automatically");
      if (/#\w/.test(e.caption)) err(n, at, "leave hashtags out of the caption — they are added automatically");
    }
    if (!str(e.ask)) err(n, at, "ask missing");

    const cards = [e.cover, e.previously, ...beats.flat(), ...t, e.close].filter((x) => typeof x === "string").join(" ");
    priceCards += (cards.match(/₦1,000/g) ?? []).length;
    if ((s.trigger === "BOOK" || s.trigger === "GIF") && /₦1,000/.test(cards)) {
      err(n, at, `${s.trigger} never names a price on the slides`);
    }

    const sc = Array.isArray(e.scenes) ? e.scenes : [];
    const after = ep === 1 ? [2, 4] : [3, 4];
    if (sc.length !== 2) err(n, at, "exactly 2 scenes");
    sc.forEach((x, j) => {
      if (x.after !== after[j]) err(n, `${at} scene ${j + 1}`, `goes after card ${after[j]}, not ${x.after}`);
      if (!Array.isArray(x.attach)) err(n, `${at} scene ${j + 1}`, "attach is a list of cast names");
      for (const a of x.attach ?? []) if (!names.has(a)) err(n, `${at} scene ${j + 1}`, `attaches "${a}", who is not in the cast`);
      for (const k of ["setting", "subject", "details"]) if (!str(x[k])) err(n, `${at} scene ${j + 1}`, `${k} missing`);
    });

    const g = Array.isArray(e.gif) ? e.gif : [];
    if (g.length !== 4) err(n, at, "gif needs exactly 4 lines");
    g.forEach((l, j) => {
      if (!str(l)) err(n, `${at} gif ${j + 1}`, "empty");
      else {
        if (l.length > MAX.gif) err(n, `${at} gif ${j + 1}`, `${l.length} characters (max ${MAX.gif}): "${l}"`);
        else if (l.length > 22) warn(n, `${at} gif ${j + 1}`, `${l.length} characters — 22 reads best: "${l}"`);
        if (EMOJI.test(l) || /₦/.test(l)) err(n, `${at} gif ${j + 1}`, "no emoji or ₦ in a GIF line");
      }
    });
  });

  if (priceCards > 1) warn(n, "price", `₦1,000 appears ${priceCards} times on the slides — once per story is plenty`);
  const h = HOLIDAY[n];
  if (h) {
    const e = s.eps[h[0] - 1];
    const text = JSON.stringify([e.cover, e.previously, e.beats, e.twist, e.close, e.caption]);
    if (!text.includes(h[1])) err(n, `ep ${h[0]}`, `posts on ${h[1]} and must say so`);
  }
}

console.log(`\n${errors} error(s), ${warnings} warning(s)`);
process.exit(errors ? 1 : 0);
