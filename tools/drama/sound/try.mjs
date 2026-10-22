#!/usr/bin/env node
/**
 * A listening test of the AUTOMATIC path for any written episode — the same
 * writer, voices and engine the job uses — saved under admin/sound-tests/.
 * Nothing is attached to a post.
 *
 *   node --env-file=.env.local tools/drama/sound/try.mjs <slug> <episode n> [road, e.g. SPEAK.STAY] --cover <R2 key of a cover slide>
 *   … --again <outBase of an earlier run>   same script, reuses every take the director passed; only the rest is recorded
 *   … --fake                                 free: stand-in script and ffmpeg sounds
 *
 * The cover is only the picture for the preview video (an unrendered draft has
 * no slides yet, so any slide 1 will do).
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { writeScript } from "./writer.mjs";
import { makeSound } from "./engine.mjs";
import { resolveVoices } from "./cast.mjs";
import VOICES from "./voices.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const valueOf = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const coverKey = valueOf("--cover"), againBase = valueOf("--again");
const taken = new Set(["--cover", "--again"].map((f) => args.indexOf(f)).filter((i) => i >= 0).map((i) => i + 1));
const [slug, nRaw, road] = args.filter((a, i) => !a.startsWith("--") && !taken.has(i));
const n = Number(nRaw);
const fake = args.includes("--fake");
if (!slug || !n || !coverKey) { console.error("usage: try.mjs <slug> <n> [road] --cover <R2 key> [--again <outBase>] [--fake]"); process.exit(1); }

const story = (await import(pathToFileURL(path.join(HERE, "..", "stories", `${slug}.mjs`)).href)).default;
const episode = story.episodes.find((e) => e.n === n)
  ?? (story.drafts ?? []).find((d) => d.n === n && (!road || d.after === road || (d.after.startsWith("*.") && road.endsWith(d.after.slice(1)))));
if (!episode) { console.error(`no episode ${n}${road ? ` for ${road}` : ""}`); process.exit(1); }
console.log(`${story.title} — Episode ${n} "${episode.title}"${episode.after ? ` (after ${episode.after})` : ""}`);

let voices;
try { voices = resolveVoices(slug); } catch (e) {
  if (!fake) throw e;
  voices = Object.fromEntries(Object.keys(VOICES[slug]).map((k) => [k, "fake"])); // a free run needs no real voice
}

let script, reuse;
if (againBase) {
  // The same script as before, so every take the director already passed matches and is reused.
  const s3 = new S3Client({ region: "auto", endpoint: process.env.R2_ENDPOINT,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } });
  const get = async (k) => JSON.parse(Buffer.from(await (await s3.send(new GetObjectCommand({ Bucket: "generated-4k", Key: k }))).Body.transformToByteArray()).toString("utf8"));
  script = await get(`${againBase}/script.json`);
  reuse = await get(`${againBase}/takes.json`).catch(() => ({}));
  console.log(`  again: the script of ${againBase}, ${Object.keys(reuse).length} take(s) to reuse`);
} else {
  const r = await writeScript({ story, episode, voices, fake });
  if (!r.script) { console.log(`NO SCRIPT: ${r.problems.join(" | ")}`); process.exit(1); }
  script = r.script;
}
console.log(`\nScript (twist = beat ${script.twist}, cliff = beat ${script.cliff}):`);
script.beats.forEach((b, i) => console.log(`  ${String(i + 1).padStart(2)}. ${b.who} (${voices[b.who]}): ${b.text}${b.style ? `  [${b.style}]` : ""}`));
console.log(`  score: ${script.score_style}\n  scene: ${script.scene_sound}\n  moments: ${script.moments.map((m) => `beat ${m.beat}: ${m.sound}`).join("; ")}`);

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outBase = `admin/sound-tests/${slug}-ep${n}-${fake ? "fake-" : ""}${stamp}`;
const res = await makeSound(script, { coverKey, outBase, fake, reuse });
console.log(`\n${res.ok ? "OK — every check passed" : "NOT OK"} — calls ${JSON.stringify(res.report.calls)}, about $${res.report.usd}`);
if (res.problems.length) console.log(`Problems: ${res.problems.join(" | ")}`);
if (res.report.supervisor) console.log(`Release check: ${JSON.stringify(res.report.supervisor)}`);
for (const r of res.report.refused ?? []) console.log(`Lyria refused this ${r.kind} prompt:\n${r.prompt}`);
console.log(`OUTBASE ${outBase}`);
if (res.keys.preview) console.log(`PREVIEW ${res.keys.preview}`);
process.exit(res.ok ? 0 : 1);
