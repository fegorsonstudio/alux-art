#!/usr/bin/env node
/**
 * A listening test of the AUTOMATIC path for any written episode — the same
 * writer, voices and engine the job uses — saved under admin/sound-tests/.
 * Nothing is attached to a post.
 *
 *   node --env-file=.env.local tools/drama/sound/try.mjs <slug> <episode n> [road, e.g. SPEAK.STAY] --cover <R2 key of a cover slide>
 *
 * The cover is only the picture for the preview video (an unrendered draft has
 * no slides yet, so any slide 1 will do).
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { writeScript } from "./writer.mjs";
import { makeSound } from "./engine.mjs";
import { resolveVoices } from "./cast.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const coverAt = args.indexOf("--cover");
const coverKey = coverAt >= 0 ? args[coverAt + 1] : null;
const [slug, nRaw, road] = args.filter((a, i) => !a.startsWith("--") && i !== coverAt + 1);
const n = Number(nRaw);
if (!slug || !n || !coverKey) { console.error("usage: try.mjs <slug> <n> [road] --cover <R2 key>"); process.exit(1); }

const story = (await import(pathToFileURL(path.join(HERE, "..", "stories", `${slug}.mjs`)).href)).default;
const episode = story.episodes.find((e) => e.n === n)
  ?? (story.drafts ?? []).find((d) => d.n === n && (!road || d.after === road || (d.after.startsWith("*.") && road.endsWith(d.after.slice(1)))));
if (!episode) { console.error(`no episode ${n}${road ? ` for ${road}` : ""}`); process.exit(1); }
console.log(`${story.title} — Episode ${n} "${episode.title}"${episode.after ? ` (after ${episode.after})` : ""}`);

const voices = resolveVoices(slug);
const { script, problems } = await writeScript({ story, episode, voices });
if (!script) { console.log(`NO SCRIPT: ${problems.join(" | ")}`); process.exit(1); }
console.log("\nScript:");
for (const l of script.lines) console.log(`  ${l.at.toFixed(1)}–${l.by.toFixed(1)} s  ${l.who} (${voices[l.who]}): "${l.text}"  [${l.style}]`);

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const res = await makeSound(script, { coverKey, outBase: `admin/sound-tests/${slug}-ep${n}-${stamp}` });
console.log(`\n${res.ok ? "OK — every check passed" : "NOT OK"} — calls ${JSON.stringify(res.report.calls)}, about $${res.report.usd}`);
if (res.problems.length) console.log(`Problems: ${res.problems.join(" | ")}`);
if (res.report.supervisor) console.log(`Listening check: ${JSON.stringify(res.report.supervisor)}`);
for (const r of res.report.refused ?? []) console.log(`Lyria refused this ${r.kind} prompt:\n${r.prompt}`);
if (res.keys.preview) console.log(`PREVIEW ${res.keys.preview}`);
process.exit(res.ok ? 0 : 1);
