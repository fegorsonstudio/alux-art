// Engine 2 (owner, 2026-10-25): a story is written the way Higgsfield's Short
// Drama Screenwriter writes one — a scene-by-scene script with exact dialogue,
// a voice per character, named references, and a full clip prompt for every
// scene (SCENE CONTEXT … POSITIVE LOCKS, with ACTING TASKS) — plus our game
// layer (the vote, the roads) and the carousel slides DERIVED from the scenes.
// `checkStory2(story, file)` returns the problems; check.mjs calls it for any
// story with `engine: 2` and keeps the old rules for the rest.
import path from "node:path";
import { words } from "./check.mjs";

export const PROMPT_BLOCKS = ["sceneContext", "activeReferences", "locationMap", "firstFrame", "formatMode", "optics", "camera", "actionTiming", "physics", "lighting", "audio", "actingTasks", "positiveLocks"];
export const REF_KINDS = ["face", "outfit", "sheet", "look", "detail", "group", "location", "prop"];
export const PARTS = ["hook", "context", "escalation", "cliffhanger"];
const CLIFFS = ["arrival", "reveal", "clock", "message", "mirror", "loss"];
const TIERS = ["lead", "main", "cameo"];
const EMOJI = /\p{Extended_Pictographic}/u;
const MAX_STORY_SLIDES = 8; // hook + cover + 8 + choice = 11 designed; with storyboard pictures ≤ 19 (Instagram allows 20)

export function checkStory2(s, file) {
  const errs = [];
  const bad = (m) => errs.push(m);
  if (file && s.slug !== path.basename(file, ".mjs")) bad(`slug "${s.slug}" must match the file name`);
  for (const k of ["slug", "title", "tagline", "genre", "city", "logline"]) if (!String(s[k] ?? "").trim()) bad(`missing ${k}`);
  if (words(s.title) > 5) bad("title over 5 words");
  if (words(s.logline) > 40) bad(`logline ${words(s.logline)} words (max 40)`);
  if (!Number.isInteger(s.minVotes) || s.minVotes < 2) bad("minVotes must be a whole number, 2 or more");

  // Cast: 2–5 speaking characters per their rule; every one with a want, how they behave under pressure, a voice and a look.
  const cast = Array.isArray(s.cast) ? s.cast : [];
  const regulars = cast.filter((c) => !c.guest);
  if (regulars.length < 2 || regulars.length > 6) bad(`cast has ${regulars.length} roles (2–6)`);
  const keys = new Set();
  for (const c of cast) {
    if (!c.key || keys.has(c.key)) bad(`cast: missing or duplicate key ${c.key ?? "?"}`);
    keys.add(c.key);
    for (const k of ["name", "age", "role", "want", "pressure", "voice", "look"]) if (!String(c[k] ?? "").trim()) bad(`${c.key}: missing ${k}`);
    if (words(c.voice) < 6) bad(`${c.key}: the voice description is too thin (accent, pitch, pace, timbre)`);
    if (!TIERS.includes(c.tier)) bad(`${c.key}: tier must be lead / main / cameo`);
    if (typeof c.open !== "boolean") bad(`${c.key}: open must be true or false`);
  }
  if (!cast.some((c) => c.tier === "lead")) bad("no lead role");

  // References: every asset the scenes attach, with the prompt that makes it.
  const refs = Array.isArray(s.references) ? s.references : [];
  const refNames = new Set();
  for (const r of refs) {
    if (!/^@[A-Z][A-Za-z0-9]{1,30}$/.test(r.name ?? "")) bad(`reference "${r.name}" must be named like @LucyFace`);
    if (refNames.has(r.name)) bad(`reference ${r.name} listed twice`);
    refNames.add(r.name);
    if (!REF_KINDS.includes(r.kind)) bad(`${r.name}: kind must be one of ${REF_KINDS.join(", ")}`);
    if (!String(r.prompt ?? "").trim() || words(r.prompt) < 20) bad(`${r.name}: needs a full generation prompt`);
    if (!String(r.aspect ?? "").trim()) bad(`${r.name}: needs an aspect ratio`);
    if (r.kind === "sheet" && !String(r.prompt).match(/erase|blank|featureless|oval/i)) bad(`${r.name}: a sheet prompt must erase the face on the full-body front view`);
    if (r.kind === "sheet" && !String(r.prompt).match(/grey|gray/i)) bad(`${r.name}: a sheet prompt must ask for a grey background`);
  }
  // Their rule: main characters get a sheet; side characters may come from the group image or a look.
  for (const c of cast) {
    if (c.tier === "cameo") continue;
    if (!refs.some((r) => r.kind === "sheet" && r.for === c.key)) bad(`${c.key}: no character sheet reference (kind sheet, for: "${c.key}")`);
  }
  if (!refs.some((r) => r.kind === "location")) bad("no location reference (a three-quarter view of the main place)");

  // A brand's series: every product is a prop reference, and every episode places at least one product in a scene.
  if (s.brand) {
    const products = Array.isArray(s.brand.products) ? s.brand.products : [];
    if (!String(s.brand.name ?? "").trim()) bad("brand.name missing");
    if (!products.length) bad("brand.products is empty");
    for (const pr of products) {
      if (!pr.key || !String(pr.name ?? "").trim()) bad(`brand product missing key or name`);
      if (!refs.some((r) => r.kind === "prop" && r.product === pr.key)) bad(`product ${pr.key}: no prop reference (kind prop, product: "${pr.key}")`);
    }
  }
  if (!(Array.isArray(s.voices) || (s.voices && typeof s.voices === "object"))) bad("missing voices (narrator + every cast key) for the sound engine");
  else for (const c of cast) if (!s.voices[c.key]) bad(`voices: no entry for ${c.key}`);

  const eps = Array.isArray(s.episodes) ? s.episodes : [];
  if (!eps.length) bad("no episodes");
  eps.forEach((e, i) => { if (e.n !== i + 1) bad(`episode ${e.n ?? "?"}: episodes must be numbered 1, 2, 3…`); checkEpisode2(e, `episode ${e.n ?? "?"}`, s, keys, refNames, bad); });

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
    if (seen.has(`${d.n}:${d.after}`)) bad(`${tag}: written twice`);
    seen.add(`${d.n}:${d.after}`);
    const parents = d.n === 2 ? eps.filter((e) => e.n === 1) : drafts.filter((p) => p.n === d.n - 1);
    const last = roadWords[roadWords.length - 1];
    if (!parents.some((p) => (p.choice?.options ?? []).some((o) => o.word === last))) bad(`${tag}: no episode ${d.n - 1} offers the word ${last}`);
    checkEpisode2(d, tag, s, keys, refNames, bad);
  }
  return errs;
}

function checkEpisode2(e, tag, s, keys, refNames, bad) {
  if (!String(e.title ?? "").trim() || words(e.title) > 5) bad(`${tag}: title missing or over 5 words`);
  // The four parts, each in one or two sentences.
  for (const p of PARTS) if (!String(e.parts?.[p] ?? "").trim()) bad(`${tag}: parts.${p} missing`);
  // Scenes: the script.
  const scenes = Array.isArray(e.scenes) ? e.scenes : [];
  if (scenes.length < 3 || scenes.length > 7) bad(`${tag}: ${scenes.length} scenes (3–7)`);
  const speaking = new Set();
  scenes.forEach((sc, i) => {
    const at = `${tag} scene ${i + 1}`;
    if (sc.n !== i + 1) bad(`${at}: scenes must be numbered 1, 2, 3…`);
    if (!PARTS.includes(sc.part)) bad(`${at}: part must be one of ${PARTS.join(", ")}`);
    if (!/^(INT|EXT)\.? /i.test(String(sc.heading ?? ""))) bad(`${at}: heading must start INT. or EXT. (place — time)`);
    if (!String(sc.action ?? "").trim() || words(sc.action) < 12) bad(`${at}: action too thin (what we see, in sentences)`);
    const lines = Array.isArray(sc.dialogue) ? sc.dialogue : [];
    for (const l of lines) {
      if (!keys.has(l.who)) bad(`${at}: dialogue by "${l.who}" who is not in the cast`);
      speaking.add(l.who);
      if (!String(l.line ?? "").trim()) bad(`${at}: an empty line`);
      if (EMOJI.test(String(l.line))) bad(`${at}: no emoji in dialogue`);
    }
    if (!String(sc.shots ?? "").trim()) bad(`${at}: missing the camera shots`);
    const used = Array.isArray(sc.references) ? sc.references : [];
    if (!used.length) bad(`${at}: no references attached`);
    for (const r of used) if (!refNames.has(r)) bad(`${at}: reference ${r} is not in the story's references`);
    if (used.length > 6) bad(`${at}: ${used.length} references (at most 6 per clip)`);
    const p = sc.prompt ?? {};
    for (const b of PROMPT_BLOCKS) {
      const v = String(p[b] ?? "").trim();
      if (!v) bad(`${at}: prompt.${b} missing`);
    }
    if (p.actionTiming && !/\d+(\.\d+)?s/.test(String(p.actionTiming))) bad(`${at}: actionTiming needs timestamps (e.g. 0.0s to 2.2s)`);
    if (p.optics && !/\d+°/.test(String(p.optics))) bad(`${at}: optics needs a field of view in degrees`);
    if (p.lighting && !/\d{4}K/.test(String(p.lighting))) bad(`${at}: lighting needs a colour temperature in Kelvin`);
    for (const l of lines) if (p.actionTiming && !String(p.actionTiming).includes(String(l.line).slice(0, 24))) bad(`${at}: the line "${String(l.line).slice(0, 30)}…" is not in actionTiming`);
    if (!(sc.clip?.seconds > 0 && sc.clip.seconds <= 30)) bad(`${at}: clip.seconds must be 1–30 (one Seedance generation)`);
  });
  if (speaking.size > 5) bad(`${tag}: ${speaking.size} speaking characters (at most 5)`);
  if (!Array.isArray(e.editOrder) || e.editOrder.length !== scenes.length) bad(`${tag}: editOrder must list every scene's clip once`);

  // A brand's series: the placements, each tied to a scene and the way the product serves it.
  if (s.brand) {
    const pl = Array.isArray(e.placements) ? e.placements : [];
    if (!pl.length) bad(`${tag}: a brand series places at least one product (placements)`);
    for (const x of pl) {
      if (!(s.brand.products ?? []).some((pr) => pr.key === x.product)) bad(`${tag}: placement of unknown product ${x.product}`);
      if (!(x.scene >= 1 && x.scene <= scenes.length)) bad(`${tag}: placement needs the scene it is in`);
      if (!String(x.how ?? "").trim() || words(x.how) < 6) bad(`${tag}: placement.how must say what the product does in the scene`);
    }
  }
  // The game layer.
  if (!CLIFFS.includes(e.cliff?.type)) bad(`${tag}: cliff.type must be one of ${CLIFFS.join(", ")}`);
  const opts = e.choice?.options ?? [];
  if (words(e.choice?.question) < 3 || words(e.choice?.question) > 12) bad(`${tag}: choice question must be 3–12 words`);
  if (opts.length !== 2) bad(`${tag}: exactly two options`);
  for (const o of opts) {
    if (!/^[A-Z]{2,10}$/.test(o.word ?? "")) bad(`${tag}: option word "${o.word}" must be one uppercase word`);
    if (!String(o.label ?? "").trim() || words(o.label) > 4) bad(`${tag}: option label "${o.label}" (max 4 words)`);
    if (!String(e.branches?.[o.word] ?? "").trim()) bad(`${tag}: no branch written for ${o.word}`);
  }
  if (opts.length === 2 && opts[0].word === opts[1].word) bad(`${tag}: the two words must differ`);

  // The carousel: derived from the scenes — hook, cover, up to 8 story slides each from a scene, cliff, choice.
  const sl = Array.isArray(e.slides) ? e.slides : [];
  if (sl.length < 6 || sl.length > MAX_STORY_SLIDES + 3) bad(`${tag}: ${sl.length} slides (hook, cover, 3–${MAX_STORY_SLIDES} from the scenes incl. the cliff, choice)`);
  sl.forEach((x, j) => {
    const at = `${tag} slide ${j + 1}`;
    const want = j === 0 ? "hook" : j === 1 ? "cover" : j === sl.length - 1 ? "choice" : j === sl.length - 2 ? "cliff" : null;
    if (want ? x.kind !== want : !["time", "beat", "line", "text"].includes(x.kind)) bad(`${at}: kind "${x.kind}" (expected ${want ?? "time/beat/line/text"})`);
    if (!String(x.see ?? "").trim()) bad(`${at}: missing see`);
    const w = words(x.say);
    if (x.kind === "hook") { if (w < 15 || w > 45) bad(`${at}: hook ${w} words (15–45)`); return; }
    if (x.kind === "cover" || x.kind === "choice") { if (w) bad(`${at}: the ${x.kind} slide carries no caption`); return; }
    if (!w) bad(`${at}: empty caption`);
    if (w > 16) bad(`${at}: caption ${w} words (max 16): ${x.say}`);
    if (x.kind === "line" && !/[“"]/.test(x.say)) bad(`${at}: a line is spoken — put it in quotes`);
    if (x.kind === "line" && !keys.has(x.who)) bad(`${at}: a line needs who (a cast key)`);
    if (!(x.scene >= 1 && x.scene <= scenes.length)) bad(`${at}: needs scene (which scene it comes from)`);
    if (EMOJI.test(x.say)) bad(`${at}: no emoji`);
  });
  // Every spoken slide line must exist in that scene's dialogue, word for word.
  for (const x of sl) {
    if (x.kind !== "line" || !(x.scene >= 1)) continue;
    const sc = scenes[x.scene - 1];
    const said = String(x.say).replace(/[“”"]/g, "").trim();
    if (sc && !(sc.dialogue ?? []).some((l) => String(l.line).replace(/[“”"]/g, "").trim() === said)) bad(`${tag} slide line "${said.slice(0, 30)}…" is not a line of scene ${x.scene}`);
  }
  e._words = sl.reduce((n, x) => n + (x.kind === "hook" || x.kind === "cover" || x.kind === "choice" ? 0 : words(x.say)), 0);
}
