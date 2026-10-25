// The engine-2 screenwriter (owner, 2026-10-25: "update our story writing engine to
// match exactly how their stories are written"). DeepSeek writes the story the way
// Higgsfield's Short Drama Screenwriter + Seedance Prompt Writer write one —
// their two skills are the system prompt, verbatim — and our game layer on top.
//
//   node --env-file=.env.local tools/drama/screenwriter2.mjs --brief "…" --slug my-story --city Lagos --genre romance [--episodes 6] [--force]
//
// Two stages, so nothing is cut off:
//   1. THE BIBLE — cast (want, behaviour under pressure, voice, look), references with
//      their generation prompts (faces, outfits, sheets, group, location, props),
//      continuity, the season plan: every episode's four parts and its two-word vote,
//      on every road (branch and bottleneck: two versions per middle episode, a shared ending).
//   2. EACH EPISODE VERSION — the scenes (INT./EXT., action, exact dialogue, shots,
//      references), a complete clip prompt per scene in their block structure with
//      ACTING TASKS, the edit order, and the carousel slides derived from the scenes.
// Each answer is refereed (check2.mjs) and repaired up to 2 times. Cost ≈ $0.15–0.40 a season.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chat, configured, parseJson, MODEL } from "./brain.mjs";
import { checkStory, GENRES, HOUSE } from "./check.mjs";
import { PROMPT_BLOCKS, REF_KINDS } from "./check2.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPAIR = 2;
const args = process.argv.slice(2);
const flag = (name, d) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : d; };
const brief = flag("brief"), slug = flag("slug"), city = flag("city", "Lagos"), genre = flag("genre", "romance");
const episodes = parseInt(flag("episodes", "6"), 10);
if (!brief || !slug) { console.error("usage: screenwriter2.mjs --brief \"…\" --slug my-story [--city Lagos] [--genre romance] [--episodes 6] [--force]"); process.exit(2); }
if (!/^[a-z0-9][a-z0-9-]{2,59}$/.test(slug)) { console.error("slug: lowercase letters, digits and dashes"); process.exit(2); }
if (!GENRES.includes(genre)) { console.error(`genre must be one of ${GENRES.join(", ")}`); process.exit(2); }
if (!configured()) { console.error("DEEPSEEK_API_KEY is not set"); process.exit(2); }
const brandName = flag("brand", "");
const productsFile = flag("products", "");
const products = productsFile ? JSON.parse(fs.readFileSync(productsFile, "utf8")) : [];
const out = path.join(HERE, "stories", `${slug}.mjs`);
if (fs.existsSync(out) && !args.includes("--force")) { console.error(`${out} exists — add --force to overwrite`); process.exit(2); }

const read = (p) => fs.readFileSync(path.join(HERE, p), "utf8");
const strip = (md) => md.replace(/^---[\s\S]*?---\n/, "");
const theirScreenwriter = strip(read("skills/source/higgsfield-short-drama-screenwriter.md"));
const theirPromptWriter = strip(read("skills/source/higgsfield-seedance-2.5-prompt-writer.md"));
const example1 = read("skills/source/examples/05-scene-5-big-entrance.md");
const example2 = read("skills/source/examples/07-scene-6-cliffhanger.md");

const SYSTEM = [
  "You are the Short Drama Screenwriter and the Seedance 2.5 Prompt Writer, working for Alux Micro Drama (Nigeria). Follow the two skills below EXACTLY — their steps, their package, their clip-prompt blocks, their rules. You answer with ONE JSON object only, no prose, no markdown.",
  "", "=== SKILL 1: Short Drama Screenwriter (verbatim) ===", theirScreenwriter,
  "", "=== SKILL 2: Seedance 2.5 Prompt Writer (verbatim) ===", theirPromptWriter,
  "", "=== TWO OF THEIR CLIP PROMPTS, VERBATIM (the SOUL Angel episode) — match this density and shape ===", example1, "", example2,
  "", "=== ALUX ADDENDUM — what is different here ===",
  `- Nigeria, all of it: real cities, weather, fabrics, food, speech; names from the place; Pidgin and local languages sparingly, in a character's mouth. Never real politicians or living people, tribes or faiths as villains, mockery of accents, graphic violence, explicit sex, investment schemes.`,
  `- References are made with fal-ai/nano-banana-2/edit (an edit model: reference images in, one picture out). In clip prompts the tags are @Name as in the skill; keep a table of which image is which. Character sheets: three panels on one grey (full body FRONT with the FACE ERASED to a blank oval, full body BACK, one large head-and-shoulders PORTRAIT), exactly their three rules.`,
  `- Every episode is also a GAME: it ends on a two-way choice about what the hero DOES, both options right and costly, each one UPPERCASE comment word (2–10 letters) with a label of ≤4 words; "branches" says in one line where each word leads. The season is written on EVERY road: episode 2 has a version per word of episode 1; from episode 3 on, two versions per episode (after "*.WORD" for each word the previous episode offers), each opening on its own road and ending on the SAME cliff and the SAME vote, so every road through the finale is complete. The last episode has "finale": true and its vote decides season two.`,
  `- Each episode is ONE short drama of about one to two minutes: 3–7 scenes, at most 5 speaking characters, the four parts (hook, context, escalation, cliffhanger) named per scene. Keep every character's voice description word for word in every clip where they speak. Every dialogue line must appear in that scene's ACTION TIMING with its timestamp and how it is said.`,
  ...(products.length ? [`- THIS IS A BRAND'S OWN SERIES for ${brandName}. Its products are: ${products.map((p) => `${p.key} = ${p.name}${p.what ? ` (${p.what})` : ""}${p.note ? ` — ${p.note}` : ""}`).join("; ")}. Every product is a "prop" reference (kind prop, "product": its key) made from the brand's own picture (inputs: the picture). Every episode places at least one product where the STORY needs it — something a character uses, gives, loses, finds, fights over — never as wallpaper; "placements": [{ "product", "scene", "how" }] says what it does in that scene. No health, slimming or money-making claims. The brand is credited, the story comes first.`] : []),
  `- The CAROUSEL is derived from the scenes: slide 1 "hook" (15–45 words that tell a stranger the story — episode 1: who, what they want, what stands in the way; later episodes: the story so far on this road), slide 2 "cover" (no caption), then 3–8 slides each taken from a scene ("scene": n) — a spoken line as kind "line" with "who" and the line in “quotes” exactly as in the dialogue, or an action beat as kind "beat"/"time"/"text" (≤16 words) — in story order, the second-to-last slide the "cliff", the last the "choice" (no caption). Each slide's "see" is the shot it is cut from, written for the camera.`,
].join("\n");

const CAST_SHAPE = `{ "key": "amaka", "name", "age", "role", "want": "what they want in this episode", "pressure": "how they behave under pressure", "voice": "accent, pitch, pace, timbre — repeated word for word in every clip", "look": "what the house version looks like, for the camera", "tier": "lead|main|cameo", "open": true, "secret": "…" }`;
const REF_SHAPE = `{ "name": "@AmakaFace", "kind": one of ${REF_KINDS.join("|")}, "for": "<cast key, for face/outfit/sheet/look>", "aspect": "3:4|16:9|9:16|4:5|1:1", "inputs": ["@AmakaFace", "@AmakaOutfit"] (for a sheet or a look), "prompt": "the full generation prompt in the skill's style" }`;

async function ask(messages, label, maxTokens = 40_000) {
  process.stdout.write(`${label}… `);
  const r = await chat({ messages, json: true, maxTokens, temperature: 0.75 });
  console.log(`${r.usage.input} in / ${r.usage.output} out, $${r.usd}${r.finish === "length" ? " (CUT OFF)" : ""}`);
  spend += r.usd;
  return r;
}
let spend = 0;

// ── Stage 1: the bible ────────────────────────────────────────────────────────
const bibleUser = [
  `Write the STORY BIBLE and SEASON PLAN for a new Alux Micro Drama. Brief: ${brief}`,
  `City: ${city}. Genre: ${genre}. Slug: ${slug}. ${episodes} episodes in season one.`,
  `Answer as JSON: {`,
  `  "title": "2–5 words", "tagline": "≤8 words", "logline": "≤40 words",`,
  `  "cast": [2–6 × ${CAST_SHAPE}],`,
  `  "references": [${REF_SHAPE}, …] — per main character: a face (3:4), an outfit (3:4) and a sheet (16:9, inputs face+outfit, prompt following the three rules); any changed look (16:9, inputs: the sheet); small details that must be exact; one group (16:9) if extras appear; ONE location (16:9, a three-quarter view showing the whole layout the scenes need, no people); story props.`,
  `  "continuity": ["what each character wears and carries and when it changes, scene by scene, in sentences"],`,
  `  "voices": { "narrator": { "gender", "language": "en-US", "designed": "a film-trailer / drama-recap narrator voice in 30–50 words" }, "<cast key>": { "gender": "male|female", "nigerian": "30–50 words: age, origin, the Nigerian English accent, pitch, pace, manner" } … } — every cast key,`,
  products.length ? `  "placementsPlan": { "<episode n>": "which product serves which beat, in one line" },` : "",
  `  "season": [ for every episode version on every road: { "n", "after": null for episode 1 | "WORD" for episode 2 | "*.WORD" from episode 3 on, "title", "parts": { "hook", "context", "escalation", "cliffhanger" } (one or two sentences each), "cliffType": one of arrival|reveal|clock|message|mirror|loss, "choice": { "question", "options": [{ "word", "label" }, { "word", "label" }] }, "branches": { "WORD": "…" }, "finale": true only on episode ${episodes} } ] — the two versions of a middle episode share the same cliff, choice and branches (only their first half differs); episode ${episodes} has two versions, both ending on one season-two hook.`,
  `}`,
].join("\n");
const bibleMsgs = [{ role: "system", content: SYSTEM }, { role: "user", content: bibleUser }];
const bibleCache = path.join(HERE, "stories", `.bible-${slug}.json`);
let bible = fs.existsSync(bibleCache) && args.includes("--reuse-bible") ? JSON.parse(fs.readFileSync(bibleCache, "utf8")) : null;
if (bible) console.log(`reusing the saved bible (${bibleCache})`);
for (let round = 0; round <= REPAIR && !bible; round++) {
  const r = await ask(bibleMsgs, round ? `bible repair ${round}` : "writing the bible");
  try { bible = parseJson(r.text); } catch (e) { bibleMsgs.push({ role: "assistant", content: r.text }, { role: "user", content: `Not valid JSON (${e.message}). Answer again with the complete JSON object only.` }); continue; }
  const problems = [];
  if (!Array.isArray(bible.cast) || bible.cast.length < 2) problems.push("cast missing");
  if (!Array.isArray(bible.season) || !bible.season.some((x) => x.n === 1)) problems.push("season plan missing episode 1");
  for (let n = 2; n <= episodes; n++) if (!bible.season.some((x) => x.n === n)) problems.push(`season plan has no episode ${n}`);
  for (const c of bible.cast ?? []) if (c.tier !== "cameo" && !(bible.references ?? []).some((x) => x.kind === "sheet" && x.for === c.key)) problems.push(`no sheet reference for ${c.key}`);
  if (!(bible.references ?? []).some((x) => x.kind === "location")) problems.push("no location reference");
  for (const c of bible.cast ?? []) if (!bible.voices?.[c.key]) problems.push(`voices: no entry for ${c.key}`);
  if (!problems.length) { fs.writeFileSync(bibleCache, JSON.stringify(bible, null, 2)); break; }
  console.log(`  problems: ${problems.join("; ")}`);
  if (round === REPAIR) { fs.writeFileSync(bibleCache, JSON.stringify(bible, null, 2)); console.error(`the bible could not be fixed — saved to ${bibleCache}; fix it by hand and rerun with --reuse-bible`); process.exit(1); }
  bibleMsgs.push({ role: "assistant", content: JSON.stringify(bible) }, { role: "user", content: `Fix these and answer with the COMPLETE corrected JSON: ${problems.join("; ")}` });
  bible = null;
}

// ── Stage 2: every episode version ───────────────────────────────────────────
const story = {
  engine: 2, slug, title: bible.title, tagline: bible.tagline, genre, city, logline: bible.logline, minVotes: 2,
  cast: bible.cast, references: bible.references, continuity: bible.continuity ?? [], voices: bible.voices,
  ...(products.length ? { brand: { name: brandName, products } } : {}),
  episodes: [], drafts: [],
};
const plan = [...bible.season].sort((a, b) => a.n - b.n || String(a.after).localeCompare(String(b.after)));
const refTable = story.references.map((r) => `${r.name} (${r.kind}${r.for ? `, ${r.for}` : ""})`).join("; ");
for (const p of plan) {
  const isFirst = p.n === 1;
  const prev = isFirst ? null : plan.filter((x) => x.n === p.n - 1);
  const episodeUser = [
    `Write EPISODE ${p.n}${p.after ? ` on the road ${p.after}` : ""} of "${story.title}" — "${p.title}" — as a complete short drama in the skills' package, then its carousel.`,
    `The plan for this episode: ${JSON.stringify({ parts: p.parts, cliffType: p.cliffType, choice: p.choice, branches: p.branches, finale: !!p.finale })}`,
    prev ? `The episode before it ended on: ${JSON.stringify(prev.map((x) => ({ after: x.after, cliffhanger: x.parts?.cliffhanger, choice: x.choice })))}. This version follows the word ${String(p.after).split(".").pop()}.` : "",
    `Cast (use these exact keys, names and VOICE descriptions, word for word): ${JSON.stringify(story.cast.map((c) => ({ key: c.key, name: c.name, age: c.age, role: c.role, voice: c.voice, look: c.look })))}`,
    `References you may attach (by exact name): ${refTable}`,
    `Alux house products that may appear as a natural prop (one per episode, never on the cliff or choice slide): ${HOUSE.slice(0, 8).join(" | ")}.`,
    `Answer as JSON: { "n": ${p.n}, ${p.after ? `"after": "${p.after}", ` : ""}"title": "${p.title}", "parts": {…}, ${p.finale ? '"finale": true, ' : ""}`,
    `  "scenes": [3–7 × { "n", "part": hook|context|escalation|cliffhanger, "heading": "INT./EXT. PLACE — TIME", "action": "what we see, in sentences", "dialogue": [{ "who": "<cast key>", "line": "exact words", "how": "how it is said" }], "shots": "the camera shots in prose", "references": ["@Name", …] (≤6, only what is in the shot), "clip": { "seconds": ≤30, "use": "whole scene | insert | …" },`,
    `     "prompt": { ${PROMPT_BLOCKS.map((b) => `"${b}": "…"`).join(", ")} } — each block written out in full exactly like their examples: SCENE CONTEXT, ACTIVE REFERENCES (@Name + minimal anchor + voice + "100% match the reference"), LOCATION MAP (compass, where the camera is), FIRST FRAME AND SPATIAL BLOCKING (x/y %), FORMAT MODE (segments, HARD CUTs at seconds), OPTICS (FOV in degrees per segment), CAMERA, ACTION TIMING (every beat and every line with timestamps and how it is said), PHYSICS, LIGHTING (Kelvin), AUDIO, ACTING TASKS (per speaking character: direction, motive, goal, obstacle, tactic), POSITIVE LOCKS } ],`,
    `  "editOrder": [{ "clip": 1, "seconds", "use" }, …],`,
    `  "cliff": { "type": "${p.cliffType}" }, "choice": ${JSON.stringify(p.choice)}, "branches": ${JSON.stringify(p.branches)},`,
    `  "slots": [1–2 × { "key", "object": "an object in a scene a brand could take", "slide": <slide number 3+>, "house": "<an Alux product>" }], "alux": { "product": "<an Alux product>", "where": "scene N, …" },`,
    products.length ? `  "placements": [{ "product": "<product key>", "scene": n, "how": "what the product does in that scene, in a sentence" }, …] — at least one,` : "",
    `  "slides": [ { "kind": "hook", "see": "Designed slide", "say": "15–45 words" }, { "kind": "cover", "see": "Designed cover", "say": "" }, 3–8 × { "kind": "line|beat|time|text", "scene": n, "who"?: "<key> (for a line)", "see": "the shot, for the camera", "say": "the exact line in “quotes” or an action beat ≤16 words" } in story order, then { "kind": "cliff", "scene": n, "see", "say": "≤16 words — the peak" }, { "kind": "choice", "see": "close on the object the vote turns on", "say": "" } ]`,
    `}`,
  ].filter(Boolean).join("\n");
  const msgs = [{ role: "system", content: SYSTEM }, { role: "user", content: episodeUser }];
  let ep;
  for (let round = 0; round <= REPAIR; round++) {
    const r = await ask(msgs, round ? `  episode ${p.n}${p.after ? ` (${p.after})` : ""} repair ${round}` : `episode ${p.n}${p.after ? ` (${p.after})` : ""}`, 48_000);
    try { ep = parseJson(r.text); } catch (e) { msgs.push({ role: "assistant", content: r.text }, { role: "user", content: `Not valid JSON (${e.message}). Answer again with the complete JSON object only.` }); continue; }
    ep.n = p.n; if (p.after) ep.after = p.after; else delete ep.after;
    if (p.finale) ep.finale = true;
    // Referee the story as it stands with this episode in place.
    const trial = JSON.parse(JSON.stringify(story));
    if (isFirst) trial.episodes = [ep]; else trial.drafts = [...trial.drafts, ep];
    const errs = checkStory(trial, out).filter((m) => !/not written yet|open/.test(m));
    for (const k of Object.keys(ep)) if (k.startsWith("_")) delete ep[k];
    const mine = errs.filter((m) => m.includes(isFirst ? "episode 1" : `draft ${p.n} after ${p.after}`) || /slug|cast|reference|voices|location/.test(m));
    if (!mine.length) break;
    console.log(`  referee: ${mine.length} problem(s)\n${mine.slice(0, 12).map((m) => `   - ${m}`).join("\n")}`);
    if (round === REPAIR) { console.log("  keeping the last answer — fix by hand"); break; }
    msgs.push({ role: "assistant", content: JSON.stringify(ep) }, { role: "user", content: `The referee found these problems. Fix every one and answer with the COMPLETE corrected JSON object:\n${mine.map((m) => `- ${m}`).join("\n")}` });
  }
  if (isFirst) story.episodes.push(ep); else story.drafts.push(ep);
}

const final = checkStory(story, out);
for (const k of Object.keys(story)) if (k.startsWith("_")) delete story[k];
const header = `// ${story.title} — engine 2: written the way Higgsfield's Short Drama Screenwriter writes a short drama
// (scene scripts with exact dialogue, voices, references and a clip prompt per scene), by tools/drama/screenwriter2.mjs
// (${MODEL}) on ${new Date().toISOString().slice(0, 10)} from the brief: ${brief.replace(/\n/g, " ").slice(0, 300)}
// Check with \`node tools/drama/check.mjs ${slug}\`, read it like an editor, then seed with scripts/drama-seed.mjs.
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${header}export default ${JSON.stringify(story, null, 2)};\n`);
console.log(`\nwrote ${path.relative(process.cwd(), out)} — ${final.length ? `${final.length} problem(s) left:\n${final.slice(0, 20).map((m) => ` - ${m}`).join("\n")}` : "passes the referee"} — brain spend $${spend.toFixed(3)}`);
