#!/usr/bin/env node
/**
 * The drama series' sound kit, made ONCE (owner approved, 2026-10-22): the
 * trailer hits, booms and risers the engine lays to the frame in every episode,
 * and the "Alux Drama" signature sting that closes each soundtrack.
 *
 *   node --env-file=.env.local tools/drama/sound/kit.mjs            make it (2 Lyria calls + 2 listens, about $0.20)
 *   node --env-file=.env.local tools/drama/sound/kit.mjs --list     show what is in the kit, with links to hear it (free)
 *   node --env-file=.env.local tools/drama/sound/kit.mjs --use logo=<slice key>   choose a different piece (free)
 *   node --env-file=.env.local tools/drama/sound/kit.mjs --derive   cut usable risers, booms and a short sting out of long pieces (free)
 *
 * Lyria composes each set as separate pieces with silence between them; they are
 * cut apart where the silence is, a director (Gemini 3.1 Pro) names and grades
 * every piece, and the best boom, hit, riser and sting are recorded in
 * generated-4k/drama/sound-kit/kit.json. Every piece is kept, so the owner can
 * pick another sting by ear without paying again. Until a kit exists the engine
 * uses a plain built-in one.
 */
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import path from "node:path";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { MODELS, KIT_BASE, seconds } from "./engine.mjs";

const run = promisify(execFile);
const API = "https://generativelanguage.googleapis.com/v1beta";
const KEY = process.env.GEMINI_API_KEY;
const BUCKET = "generated-4k";
const s3 = new S3Client({ region: "auto", endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } });
const ff = (args) => run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { maxBuffer: 64 * 1024 * 1024 });
const link = (k) => getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: k }), { expiresIn: 7 * 24 * 3600 });
const get = async (k) => Buffer.from(await (await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: k }))).Body.transformToByteArray());
const put = (k, body, type) => s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: k, Body: body, ContentType: type }));

const SETS = {
  impacts: {
    kinds: ["boom", "hit", "riser"],
    prompt: [
      "Sound design only. No music, no melody, no vocals. Separate cinematic movie-trailer sound effects for a premium drama series, each one followed by complete silence. Studio quality, huge and clean.",
      "[0:00 - 0:04] A massive trailer BOOM: a deep, heavy impact with a metallic crack and a long rumbling sub-bass tail.",
      "[0:04 - 0:06] Complete silence.",
      "[0:06 - 0:08] A short, tight, punchy cinematic hit.",
      "[0:08 - 0:10] Complete silence.",
      "[0:10 - 0:13] A tense rising riser: noise and strings building fast and stopping dead.",
      "[0:13 - 0:16] Complete silence.",
      "[0:16 - 0:20] A second massive trailer boom, darker and deeper.",
      "[0:20 - 0:22] Complete silence.",
      "[0:22 - 0:25] A second riser: a reversed cymbal and whoosh swelling into a sudden stop.",
      "[0:25 - 0:27] Complete silence.",
      "[0:27 - 0:28] A short, deep hit.",
      "[0:28 - 0:30] Complete silence.",
    ].join("\n"),
  },
  sting: {
    kinds: ["logo"],
    prompt: [
      "Instrumental only, no vocals. Three versions of a short sonic logo — a signature sting like a streaming service's — for \"Alux Drama\", a prestige Nigerian drama series. Each is about 3 seconds, premium and cinematic, followed by complete silence.",
      "[0:00 - 0:03] Version one: a deep talking-drum double hit answered by one rich, low orchestral brass and string chord that blooms and resolves.",
      "[0:03 - 0:09] Complete silence.",
      "[0:09 - 0:12] Version two: two low piano notes and a sub-bass swell with a soft talking-drum accent, ending on one warm, dark chord.",
      "[0:12 - 0:18] Complete silence.",
      "[0:18 - 0:21] Version three: a short shekere shimmer into one huge, warm cinematic chord with a deep impact.",
      "[0:21 - 0:30] Complete silence.",
    ].join("\n"),
  },
};

function findAudio(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) { for (const n of node) findAudio(n, out); return out; }
  if ((node.type === "audio" || /^audio\//.test(node.mime_type ?? node.mimeType ?? "")) && typeof node.data === "string") out.push(node);
  for (const v of Object.values(node)) if (v && typeof v === "object") findAudio(v, out);
  return out;
}

/** Cuts a recording apart where it falls silent; pieces shorter than 0.4 s are dropped. */
async function slices(file, dir, name) {
  const { stderr } = await run("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "silencedetect=noise=-42dB:d=0.35", "-f", "null", "-"]);
  const total = await seconds(file);
  const quiet = [];
  let start = null;
  for (const line of stderr.split("\n")) {
    const s = line.match(/silence_start: (-?[\d.]+)/), e = line.match(/silence_end: ([\d.]+)/);
    if (s) start = Math.max(0, Number(s[1]));
    if (e && start != null) { quiet.push([start, Number(e[1])]); start = null; }
  }
  if (start != null) quiet.push([start, total]);
  const sound = [];
  let t = 0;
  for (const [a, b] of quiet) { if (a - t >= 0.4) sound.push([t, a]); t = b; }
  if (total - t >= 0.4) sound.push([t, total]);
  const out = [];
  for (const [i, [a, b]] of sound.slice(0, 12).entries()) {
    const f = path.join(dir, `${name}-${i + 1}.wav`);
    const from = Math.max(0, a - 0.02), len = Math.min(b + 0.12, total) - from;
    await ff(["-ss", from.toFixed(3), "-t", len.toFixed(3), "-i", file, "-af", `afade=t=out:st=${Math.max(0, len - 0.08).toFixed(3)}:d=0.08`, "-ar", "48000", "-ac", "2", f]);
    out.push({ file: f, from: +from.toFixed(2), seconds: +len.toFixed(2) });
  }
  return out;
}

async function judge(pieces, kinds) {
  const parts = [];
  pieces.forEach((p, i) => { parts.push({ text: `PIECE ${i + 1}:` }); parts.push({ inline_data: { mime_type: "audio/wav", data: p.b64 } }); });
  parts.push({ text:
    `You are the supervising sound designer of a premium streaming drama series, choosing pieces for the series' sound kit. Above are ${pieces.length} short pieces. ` +
    `Name each one as one of: ${[...kinds, "other"].join(", ")} (boom = a huge low trailer impact with a tail; hit = a short punchy impact; riser = a rising swell that builds and stops; logo = a short musical signature sting). ` +
    "Grade its quality as a top trailer house would (1–10): clean, powerful, premium, no glitches, no clicks, no vocals or melody where there should be none. " +
    'Answer as JSON: {"pieces":[{"piece":1,"kind":"...","quality":0,"notes":"..."}]}' });
  const r = await fetch(`${API}/models/${MODELS.director}:generateContent`, { method: "POST", headers: { "x-goog-api-key": KEY, "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: "application/json", temperature: 0 } }) });
  const j = await r.json();
  if (!r.ok) throw new Error(`${MODELS.director} answered ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  const v = JSON.parse(j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "{}");
  return (Array.isArray(v) ? v[0] : v).pieces ?? [];
}

async function readIndex() {
  try { return JSON.parse((await get(`${KIT_BASE}/kit.json`)).toString("utf8")); } catch { return null; }
}
async function show(index) {
  console.log(`Kit made ${index.made}. In use:`);
  for (const [k, v] of Object.entries(index.use ?? {})) console.log(`  ${k}: ${v ?? "(built-in)"}${v ? `\n    ${await link(v)}` : ""}`);
  console.log("All pieces:");
  for (const p of index.pieces ?? []) console.log(`  ${p.key}  ${p.kind} q${p.quality} ${p.seconds}s — ${p.notes ?? ""}\n    ${await link(p.key)}`);
}

const args = process.argv.slice(2);
if (args[0] === "--list") {
  const index = await readIndex();
  if (!index) console.log("No kit yet: the engine uses the built-in one."); else await show(index);
  process.exit(0);
}
if (args[0] === "--use") {
  const [name, key] = String(args[1] ?? "").split("=");
  const index = await readIndex();
  if (!index || !["boom", "hit", "riser", "logo"].includes(name) || !index.pieces?.some((p) => p.key === key)) { console.error("usage: --use boom|hit|riser|logo=<a piece key from --list>"); process.exit(1); }
  index.use[name] = key;
  await put(`${KIT_BASE}/kit.json`, JSON.stringify(index, null, 2), "application/json");
  console.log(`${name} is now ${key}`);
  process.exit(0);
}

/** The loudest moment of a recording (50 ms windows), in seconds. */
async function loudestAt(file) {
  const { stdout } = await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", file, "-ac", "1", "-ar", "8000", "-f", "f32le", "-"], { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
  const a = new Float32Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.length / 4));
  const win = 400; let best = 0, at = 0;
  for (let i = 0; i + win <= a.length; i += win) {
    let s = 0; for (let j = i; j < i + win; j++) s += a[j] * a[j];
    if (s > best) { best = s; at = i; }
  }
  // The start of the loudest window, nudged back to where that hit begins.
  return Math.max(0, at / 8000 - 0.03);
}
// Lyria often ignores "silence" and hands back a riser that builds, hits and rings
// on (14 s), or a sting that keeps going. --derive cuts the usable parts out of
// what was already made — free, no new Lyria call:
//   a long riser → "riser" (the build, ending on the hit) + "boom" (the hit and its tail);
//   a long sting → its first 3.6 s with a clean fade.
if (args[0] === "--derive") {
  const index = await readIndex();
  if (!index) { console.error("no kit yet"); process.exit(1); }
  const dir = await mkdtemp(path.join(tmpdir(), "drama-kit-"));
  try {
    const made = [];
    const cut = async (src, name, from, len, fadeIn, fadeOut, kind, quality, notes) => {
      const out = path.join(dir, `${name}.wav`);
      const fx = [fadeIn ? `afade=t=in:st=0:d=${fadeIn}` : null, `afade=t=out:st=${Math.max(0, len - fadeOut).toFixed(3)}:d=${fadeOut}`].filter(Boolean).join(",");
      await ff(["-ss", from.toFixed(3), "-t", len.toFixed(3), "-i", src, "-af", fx, "-ar", "48000", "-ac", "2", out]);
      const key = `${KIT_BASE}/${index.made}/${name}.wav`;
      await put(key, await readFile(out), "audio/wav");
      index.pieces = (index.pieces ?? []).filter((p) => p.key !== key);
      index.pieces.push({ key, set: "derived", kind, quality, seconds: +(await seconds(out)).toFixed(2), notes });
      made.push(`${name} (${kind}, ${len.toFixed(1)} s from ${from.toFixed(2)} s)`);
    };
    for (const p of index.pieces.filter((x) => x.set !== "derived")) {
      if (p.kind === "riser" && p.seconds > 6) {
        const src = path.join(dir, path.basename(p.key));
        await writeFile(src, await get(p.key));
        const hit = await loudestAt(src);
        if (hit >= 2.5) await cut(src, path.basename(p.key, ".wav") + "-build", hit - 2.8, 2.8, 0.4, 0.04, "riser", p.quality, `the build of ${path.basename(p.key)}, ending on its hit`);
        if (p.seconds - hit >= 2) await cut(src, path.basename(p.key, ".wav") + "-hit", hit, Math.min(3.8, p.seconds - hit), 0, 0.9, "boom", p.quality, `the hit and tail of ${path.basename(p.key)}`);
      }
      if (p.kind === "logo" && p.seconds > 4.5 && p.seconds < 6) {
        const src = path.join(dir, path.basename(p.key));
        await writeFile(src, await get(p.key));
        await cut(src, path.basename(p.key, ".wav") + "-short", 0, 3.6, 0, 0.7, "logo", p.quality, `${path.basename(p.key)} trimmed to 3.6 s`);
      }
    }
    for (const kind of ["boom", "hit", "riser", "logo"]) {
      if (index.use[kind]) continue;
      const best = index.pieces.filter((p) => p.kind === kind && p.quality >= 7 && p.seconds <= (kind === "boom" ? 6 : 4.5)).sort((a, b) => b.quality - a.quality)[0];
      index.use[kind] = best?.key ?? null;
    }
    await put(`${KIT_BASE}/kit.json`, JSON.stringify(index, null, 2), "application/json");
    console.log(`derived: ${made.join("; ") || "nothing"}`);
    await show(index);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dir = await mkdtemp(path.join(tmpdir(), "drama-kit-"));
const index = { made: stamp, models: { music: MODELS.music, judge: MODELS.director }, prompts: {}, pieces: [], use: { boom: null, hit: null, riser: null, logo: null } };
let lyria = 0, listens = 0;
try {
  for (const [set, spec] of Object.entries(SETS)) {
    console.log(`${set}: asking Lyria…`);
    index.prompts[set] = spec.prompt;
    lyria++;
    const r = await fetch(`${API}/interactions`, { method: "POST", headers: { "x-goog-api-key": KEY, "content-type": "application/json" },
      body: JSON.stringify({ model: MODELS.music, input: spec.prompt, response_format: { type: "audio" } }) });
    const t = await r.text();
    if (!r.ok) { console.log(`  Lyria refused (${r.status}): ${t.slice(0, 200)}`); continue; }
    const a = findAudio(JSON.parse(t));
    if (!a.length) { console.log("  no audio in the answer"); continue; }
    const bytes = Buffer.from(a[a.length - 1].data, "base64");
    const raw = path.join(dir, `${set}.${bytes.subarray(0, 4).toString("latin1") === "RIFF" ? "wav" : "mp3"}`);
    await writeFile(raw, bytes);
    await put(`${KIT_BASE}/${stamp}/${set}-whole${path.extname(raw)}`, bytes, path.extname(raw) === ".wav" ? "audio/wav" : "audio/mpeg");
    const cut = await slices(raw, dir, set);
    console.log(`  ${(await seconds(raw)).toFixed(1)} s, cut into ${cut.length} pieces`);
    if (!cut.length) continue;
    for (const c of cut) c.b64 = (await readFile(c.file)).toString("base64");
    listens++;
    const grades = await judge(cut, spec.kinds);
    for (const [i, c] of cut.entries()) {
      const gr = grades.find((x) => Number(x.piece) === i + 1) ?? {};
      const key = `${KIT_BASE}/${stamp}/${set}-${i + 1}.wav`;
      await put(key, await readFile(c.file), "audio/wav");
      index.pieces.push({ key, set, kind: String(gr.kind ?? "other"), quality: Number(gr.quality ?? 0), seconds: c.seconds, from: c.from, notes: gr.notes ?? "" });
      console.log(`  piece ${i + 1}: ${gr.kind ?? "?"} q${gr.quality ?? "?"} ${c.seconds}s — ${gr.notes ?? ""}`);
    }
  }
  // The best of each kind, if it is good enough; otherwise the engine keeps its built-in piece.
  for (const kind of ["boom", "hit", "riser", "logo"]) {
    const best = index.pieces.filter((p) => p.kind === kind && p.quality >= 7 && p.seconds <= (kind === "logo" ? 4.5 : kind === "riser" ? 4.5 : 6)).sort((a, b) => b.quality - a.quality)[0];
    index.use[kind] = best?.key ?? null;
  }
  index.calls = { lyria, listens };
  index.usd = +(lyria * 0.08 + listens * 0.015).toFixed(2);
  await put(`${KIT_BASE}/kit.json`, JSON.stringify(index, null, 2), "application/json");
  console.log(`\nKit saved (${lyria} Lyria calls, ${listens} listens, about $${index.usd}).`);
  await show(index);
} finally {
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}
