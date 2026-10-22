#!/usr/bin/env node
/**
 * Manual test of the drama sound engine (tools/drama/sound/engine.mjs): one
 * sound script in, the soundtrack and the cover video out, under
 * generated-4k/admin/sound-tests/ — nothing is posted.
 *
 *   node --env-file=.env.local tools/drama/sound/make.mjs <sound-script.mjs> <R2 key of slide 1> [--fake]
 *
 * --fake makes every sound with ffmpeg instead of the paid models (free).
 * The automatic job is scripts/drama-sound.mjs.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeSound } from "./engine.mjs";

const [scriptPath, coverKey] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const fake = process.argv.includes("--fake");
if (!scriptPath || !coverKey) {
  console.error("usage: make.mjs <sound-script.mjs> <R2 key of slide 1> [--fake]");
  process.exit(1);
}
const S = (await import(pathToFileURL(path.resolve(scriptPath)).href)).default;
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const res = await makeSound(S, { coverKey, outBase: `admin/sound-tests/${S.story}-ep${S.episode}-${stamp}`, fake });
console.log(`\n${res.ok ? "OK" : "NOT OK"} — calls ${JSON.stringify(res.report.calls)}, about $${res.report.usd}`);
if (res.problems.length) console.log(`Problems: ${res.problems.join(" | ")}`);
if (res.keys.preview) console.log(`Preview (7 days): ${res.keys.preview}`);
process.exit(res.ok ? 0 : 1);
