// The screenwriter: DeepSeek writes a story file for the drama engine, checked by check.mjs.
//
//   node --env-file=.env.local tools/drama/screenwriter.mjs --brief "A cleaner the staff humiliate is the new owner" \
//        --slug the-new-cleaner --city Abuja --genre power [--episodes 6] [--out tools/drama/stories/the-new-cleaner.mjs]
//   node tools/drama/screenwriter.mjs --check tools/drama/stories/the-silent-partner.mjs      (free: the referee only)
//
// What it does: loads the engine rules (ENGINE.md), the screenwriter skill
// (skills/alux-short-drama-screenwriter.md) and one finished story as the worked
// example, asks DeepSeek for the whole season as JSON in the story-file shape,
// runs checkStory on the answer, and sends the referee's complaints back for
// repair — up to REPAIR rounds — before writing the file. Nothing is seeded:
// read the file, then `node tools/drama/check.mjs <slug>` and `scripts/drama-seed.mjs`.
//
// Cost: one season is roughly 90k tokens in and 16k out per round — about
// $0.05 on deepseek-flash. The brain prints what each round used.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chat, configured, parseJson, MODEL } from "./brain.mjs";
import { checkStory, GENRES, HOUSE } from "./check.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPAIR = 3;

const args = process.argv.slice(2);
const flag = (name, d) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : d; };

// ── --check: the free path, the referee alone ──────────────────────────────────
if (flag("check")) {
  const file = path.resolve(flag("check"));
  const story = (await import(pathToFileURL(file).href)).default;
  const errs = checkStory(story, file);
  console.log(errs.length ? errs.map((e) => `- ${e}`).join("\n") : "ok — no problems");
  process.exit(errs.length ? 1 : 0);
}

const brief = flag("brief");
const slug = flag("slug");
const city = flag("city", "Lagos");
const genre = flag("genre", "power");
const episodes = parseInt(flag("episodes", "6"), 10);
if (!brief || !slug) {
  console.error("usage: node --env-file=.env.local tools/drama/screenwriter.mjs --brief \"…\" --slug my-story [--city Lagos] [--genre power] [--episodes 6]");
  process.exit(2);
}
if (!/^[a-z0-9][a-z0-9-]{2,59}$/.test(slug)) { console.error("slug: lowercase letters, digits and dashes"); process.exit(2); }
if (!GENRES.includes(genre)) { console.error(`genre must be one of ${GENRES.join(", ")}`); process.exit(2); }
if (!configured()) { console.error("DEEPSEEK_API_KEY is not set. Add it to .env.local and run with `node --env-file=.env.local …`."); process.exit(2); }
const out = path.resolve(flag("out", path.join(HERE, "stories", `${slug}.mjs`)));
if (fs.existsSync(out) && !args.includes("--force")) { console.error(`${out} exists — add --force to overwrite`); process.exit(2); }

// ── The brief for the brain ────────────────────────────────────────────────────
const read = (p) => fs.readFileSync(path.join(HERE, p), "utf8");
const engine = read("ENGINE.md");
const skill = read("skills/alux-short-drama-screenwriter.md").replace(/^---[\s\S]*?---\n/, "");
const example = read("stories/the-silent-partner.mjs");
const exampleStory = (await import(pathToFileURL(path.join(HERE, "stories/the-silent-partner.mjs")).href)).default;

const system = [
  "You are the Alux Short Drama Screenwriter. You write Alux Micro Drama seasons for the drama engine below.",
  "You answer with ONE JSON object only — the story file's default export as JSON — no prose, no markdown.",
  "Dates, names and places are Nigerian. Never a real living person. Classy, platform-safe, no investment schemes.",
  "",
  "=== THE ENGINE (tools/drama/ENGINE.md) ===", engine,
  "",
  "=== THE SKILL (how to write) ===", skill,
].join("\n");

const shape = `The JSON must have exactly this shape (the worked example below is a real story file; copy its structure, not its story):
{
  "slug": "${slug}", "title": "2–4 words", "tagline": "≤8 words", "genre": "${genre}", "city": "${city}", "logline": "≤32 words: who + what they want + what stands in the way + the secret", "minVotes": 2,
  "cast": [5 or 6 roles: { "key", "name", "age", "role", "archetype" (one of the twelve), "side" ("light"|"too much"|"too little"), "tier" ("lead"|"main"|"cameo"), "open": true, "look" (for the camera), "want", "secret" }],
  "episodes": [ episode 1 only ],
  "drafts": [ every later episode on every road: { "n", "after": "SPEAK" | "SPEAK.STAY" | "*.STAY", …, "finale": true on episode ${episodes} } ]
}
An episode: { "n", "title" (≤4 words), "slides": [8 slides], "cliff": { "type": one of arrival|reveal|clock|message|mirror|loss }, "choice": { "question" (3–10 words), "options": [{ "word": "UPPERCASE", "label": "≤4 words" }, { … }] }, "branches": { "WORD": "one line each" }, "slots": [1–2 × { "key", "object", "slide" (2–6), "house": one of the Alux products }], "alux": { "product": an Alux product, "where": "slide N", "word"?: "LIGHT"|"GIF"|"BOOK", "line"?: "… Comment WORD …" } }
A slide: { "kind": cover|time|beat|line|text|cliff|choice, "see": the picture direction for the camera, "say": the caption (≤12 words; empty on cover and choice; a line in “quotes”), "who"?: cast key, "scene": ≤8 words }
Slide kinds in order: cover, time, four of beat/line/text, cliff, choice. ≤70 caption words an episode. No emoji, no exclamation marks outside speech.
Roads: episode 2 has a draft for each of episode 1's two words; from episode 3 on, write TWO versions per episode ("*.WORD" for each word the previous episode offers), each opening on its own road and ending on the SAME cliff and the SAME vote, so every road through episode ${episodes} is complete. Episode ${episodes} has "finale": true and its vote decides season two.
Alux products you may name: ${HOUSE.join(" | ")}. Product words: LIGHT (The Gear Equalizer — Pro Studio Upgrade), GIF (Instagram GIF Maker), BOOK (any studio portrait template). A product word at most every other episode, never on slides 7–8.`;

const user = [
  `Write the whole first season (${episodes} episodes, every vote road) of a new Alux Micro Drama.`,
  `Brief: ${brief}`,
  `City: ${city}. Genre: ${genre}. Slug: ${slug}.`,
  "", shape, "",
  "=== WORKED EXAMPLE: tools/drama/stories/the-silent-partner.mjs (a finished story; match its structure and its telling) ===",
  example.slice(0, 60_000),
  "",
  "Answer with the JSON object only.",
].join("\n");

// ── Write, check, repair ───────────────────────────────────────────────────────
const messages = [{ role: "system", content: system }, { role: "user", content: user }];
let story = null, totalUsd = 0;
for (let round = 0; round <= REPAIR; round++) {
  process.stdout.write(`${round ? `repair ${round}` : "writing"} with ${MODEL}… `);
  const r = await chat({ messages, json: true, maxTokens: 60_000, temperature: round ? 0.5 : 0.85 });
  totalUsd += r.usd;
  console.log(`${r.usage.input} in / ${r.usage.output} out, $${r.usd}${r.finish === "length" ? " (CUT OFF — the answer hit max_tokens)" : ""}`);
  let candidate;
  try { candidate = parseJson(r.text); } catch (e) {
    messages.push({ role: "assistant", content: r.text }, { role: "user", content: `That was not valid JSON (${e.message}). Answer again with the complete JSON object only.` });
    continue;
  }
  candidate.slug = slug;
  const errs = checkStory(candidate, out);
  // The checker leaves its working notes on the object; strip them before saving.
  for (const k of Object.keys(candidate)) if (k.startsWith("_")) delete candidate[k];
  for (const e of [...(candidate.episodes ?? []), ...(candidate.drafts ?? [])]) for (const k of Object.keys(e)) if (k.startsWith("_")) delete e[k];
  if (!errs.length) { story = candidate; break; }
  console.log(`  referee: ${errs.length} problem(s)` + (errs.length <= 12 ? "\n" + errs.map((e) => `   - ${e}`).join("\n") : ` (first 12)\n` + errs.slice(0, 12).map((e) => `   - ${e}`).join("\n")));
  if (round === REPAIR) { story = candidate; console.log("  saving the last answer anyway — fix the problems by hand, then run check.mjs"); break; }
  messages.push(
    { role: "assistant", content: JSON.stringify(candidate) },
    { role: "user", content: `The referee (tools/drama/check.mjs) found these problems. Fix every one and answer with the COMPLETE corrected JSON object, nothing else:\n${errs.map((e) => `- ${e}`).join("\n")}` },
  );
}

const header = `// ${story.title} — written by the screenwriter (tools/drama/screenwriter.mjs, ${MODEL}) on ${new Date().toISOString().slice(0, 10)}
// from the brief: ${brief.replace(/\n/g, " ")}
// Check with \`node tools/drama/check.mjs ${slug}\`, read it like an editor, then seed with scripts/drama-seed.mjs.
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${header}export default ${JSON.stringify(story, null, 2)};\n`);
const final = checkStory((await import(pathToFileURL(out).href + `?t=${Date.now()}`)).default, out);
console.log(`\nwrote ${path.relative(process.cwd(), out)} — ${final.length ? `${final.length} problem(s) left` : "passes the referee"} — brain spend $${totalUsd.toFixed(3)}`);
