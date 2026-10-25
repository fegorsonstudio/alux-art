// Adds the HOOK slide (slide 1, the story in a few lines for a stranger) to every
// episode of a story written before 2026-10-25, with DeepSeek, then re-checks.
//   node --env-file=.env.local tools/drama/hooks.mjs <slug>
// About $0.01–0.03 a story. Episodes that already have nine slides are left alone.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chat, configured, parseJson, MODEL } from "./brain.mjs";
import { checkStory } from "./check.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const slug = process.argv[2];
if (!slug) { console.error("usage: node --env-file=.env.local tools/drama/hooks.mjs <slug>"); process.exit(2); }
if (!configured()) { console.error("DEEPSEEK_API_KEY is not set"); process.exit(2); }
const file = path.join(HERE, "stories", `${slug}.mjs`);
const story = (await import(pathToFileURL(file).href)).default;

const all = [...(story.episodes ?? []), ...(story.drafts ?? [])].filter((e) => (e.slides ?? []).length === 8);
if (!all.length) { console.log(`${slug}: every episode already has its hook`); process.exit(0); }

const roadOf = (e) => (e.after ? e.after.replace(/^\*\./, "…").split(".").join(" → ") : "the start");
const brief = all.map((e, i) => `#${i} episode ${e.n} (road: ${roadOf(e)}) "${e.title}":\n` + e.slides.map((s, j) => `  ${j + 1} [${s.kind}] ${s.say || ""}`).join("\n")).join("\n\n");
const system = "You write the HOOK slide of Alux Micro Drama episodes: the story in a few plain lines for someone who has never seen it. Third person, present tense, short declarative sentences, LABELS not names (\"the quiet finance director\", \"the CEO\", \"her assistant\"), no emoji, no exclamation marks, no spoiler of the episode's own cliff. 15–45 words. Episode 1's hook introduces the story (who, what they want, what stands in the way); a later episode's hook says the story so far ON ITS ROAD — what the votes decided — and where we are now. Answer with JSON only.";
const user = `Story: "${story.title}" — ${story.logline}\nCast (key: name, role): ${(story.cast ?? []).map((c) => `${c.key}: ${c.name}, ${c.role}`).join("; ")}\n\nEpisodes needing a hook:\n\n${brief}\n\nAnswer as JSON: {"hooks": [{"i": 0, "say": "…", "see": "a short picture direction for a designed text slide, e.g. 'Designed slide: the story in a few lines on the genre's ground'"}, …]} — one entry per episode, in order.`;

process.stdout.write(`writing ${all.length} hook(s) with ${MODEL}… `);
const r = await chat({ system, user, json: true, maxTokens: 12_000, temperature: 0.7 });
console.log(`${r.usage.input} in / ${r.usage.output} out, $${r.usd}`);
const { hooks } = parseJson(r.text);
if (!Array.isArray(hooks) || hooks.length !== all.length) { console.error(`expected ${all.length} hooks, got ${hooks?.length}`); process.exit(1); }
for (const h of hooks) {
  const e = all[h.i];
  e.slides.unshift({ kind: "hook", see: String(h.see || "Designed slide: the story in a few lines on the genre's ground."), say: String(h.say).trim() });
  // Slot slide numbers and the Alux moment's slide move down by one.
  for (const sl of e.slots ?? []) sl.slide = Number(sl.slide) + 1;
  if (e.alux?.where) e.alux.where = String(e.alux.where).replace(/slide (\d+)\s*$/, (_, n) => `slide ${Number(n) + 1}`);
}
const errs = checkStory(story, file);
for (const k of Object.keys(story)) if (k.startsWith("_")) delete story[k];
for (const e of [...(story.episodes ?? []), ...(story.drafts ?? [])]) for (const k of Object.keys(e)) if (k.startsWith("_")) delete e[k];
if (errs.length) { console.error("the referee refuses:\n" + errs.map((x) => `- ${x}`).join("\n")); process.exit(1); }
const header = fs.readFileSync(file, "utf8").split("\n").filter((l) => l.startsWith("//")).join("\n");
fs.writeFileSync(file, `${header}\n// Hook slides added ${new Date().toISOString().slice(0, 10)} (tools/drama/hooks.mjs).\nexport default ${JSON.stringify(story, null, 2)};\n`);
console.log(`wrote ${path.relative(process.cwd(), file)} — ${all.length} hook(s) added, passes the referee`);
