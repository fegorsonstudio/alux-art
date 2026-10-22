#!/usr/bin/env node
/**
 * Film sound for one drama episode (owner, 2026-10-22): voices from Gemini TTS,
 * score and sound effects from Lyria, cut to the episode's slide clock, checked,
 * mixed to Instagram loudness, and a preview video of the slides with the sound.
 *
 *   node --env-file=.env.local tools/drama/sound/make.mjs <sound-script.mjs> <r2 slide prefix>
 *
 * Paid calls: one Gemini TTS call per line (fractions of a cent), two Lyria
 * calls ($0.08 each), a few short Gemini listening checks. Hard caps below stop
 * a runaway. Nothing is posted anywhere: the result goes to R2 under
 * generated-4k/admin/sound-tests/ and a 7-day link is printed.
 *
 * Every step is checked, and a failed check is reported, never hidden:
 *   - each line must fit its window (re-made faster, then gently sped up, else it fails);
 *   - each line is transcribed back and must say the script's words;
 *   - the score and effects must be long enough and not silent;
 *   - the mix must land at -14 LUFS with true peak at or below -1 dBTP, exactly the episode length;
 *   - a Gemini "sound supervisor" listens to the final mix and writes notes.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const run = promisify(execFile);
const KEY = process.env.GEMINI_API_KEY;
const API = "https://generativelanguage.googleapis.com/v1beta";
const TTS_MODEL = process.env.SOUND_TTS_MODEL || "gemini-3.8-flash-tts";
const MUSIC_MODEL = process.env.SOUND_MUSIC_MODEL || "lyria-3-pro-preview";
const CHECK_MODEL = process.env.SOUND_CHECK_MODEL || "gemini-2.5-flash";
const CAP = { tts: 20, music: 3, check: 24 };
const used = { tts: 0, music: 0, check: 0 };
const BUCKET = "generated-4k";

const s3 = new S3Client({ region: "auto", endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } });

const report = { started: new Date().toISOString(), models: { tts: TTS_MODEL, music: MUSIC_MODEL, check: CHECK_MODEL }, lines: [], checks: [], problems: [] };
const problem = (msg) => { report.problems.push(msg); console.log(`  PROBLEM  ${msg}`); };
const ok = (name, pass, detail = "") => { report.checks.push({ name, pass, detail }); console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`); if (!pass) report.problems.push(`${name}${detail ? `: ${detail}` : ""}`); return pass; };

// ── Gemini calls ─────────────────────────────────────────────────────────────
function findAudio(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) { for (const n of node) findAudio(n, out); return out; }
  if ((node.type === "audio" || /^audio\//.test(node.mime_type ?? node.mimeType ?? "")) && typeof node.data === "string") out.push(node);
  for (const v of Object.values(node)) if (v && typeof v === "object") findAudio(v, out);
  return out;
}
async function interaction(kind, body) {
  if (++used[kind] > CAP[kind]) throw new Error(`cap reached for ${kind} calls (${CAP[kind]})`);
  const r = await fetch(`${API}/interactions`, { method: "POST", headers: { "x-goog-api-key": KEY, "content-type": "application/json" }, body: JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${body.model} answered ${r.status}: ${text.slice(0, 500)}`);
  const audio = findAudio(JSON.parse(text));
  if (!audio.length) throw new Error(`${body.model}: no audio in the answer: ${text.slice(0, 300)}`);
  return Buffer.from(audio[audio.length - 1].data, "base64");
}
async function listen(prompt, file, mime) {
  if (++used.check > CAP.check) throw new Error("cap reached for listening checks");
  const data = (await readFile(file)).toString("base64");
  const r = await fetch(`${API}/models/${CHECK_MODEL}:generateContent`, {
    method: "POST", headers: { "x-goog-api-key": KEY, "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: mime, data } }, { text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0 } }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${CHECK_MODEL} answered ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  const t = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  try { const v = JSON.parse(t); return Array.isArray(v) ? v[0] : v; } catch { return { raw: t }; }
}

// ── Audio helpers ────────────────────────────────────────────────────────────
const ff = (args) => run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { maxBuffer: 64 * 1024 * 1024 });
async function seconds(file) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Number(stdout.trim());
}
async function meanVolume(file) {
  const { stderr } = await run("ffmpeg", ["-hide_banner", "-i", file, "-af", "volumedetect", "-f", "null", "-"]);
  return Number(stderr.match(/mean_volume:\s*(-?[\d.]+)/)?.[1] ?? -99);
}
async function loudness(file) {
  const { stderr } = await run("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"]);
  const tail = stderr.slice(stderr.lastIndexOf("Summary:"));
  return { lufs: Number(tail.match(/I:\s*(-?[\d.]+) LUFS/)?.[1]), peak: Number(tail.match(/Peak:\s*(-?[\d.]+) dBFS/)?.[1]) };
}
const ext = (b) => (b.subarray(0, 4).toString("latin1") === "RIFF" ? "wav" : "mp3");

// Words, as a listener would write them: no punctuation, numbers spelled out.
const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const say = (n) => n < 20 ? ONES[n] : n < 100 ? `${TENS[Math.floor(n / 10)]}${n % 10 ? " " + ONES[n % 10] : ""}` : `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? " " + say(n % 100) : ""}`;
const words = (s) => String(s).toLowerCase()
  .replace(/(\d+):(\d+)/g, (_, h, m) => `${say(+h)} ${say(+m)}`).replace(/\d+/g, (d) => (+d < 1000 ? say(+d) : d))
  .replace(/p\.?\s?m\.?/g, "pm").replace(/a\.?\s?m\.?/g, "am").replace(/%/g, " percent")
  .replace(/[’']/g, "").replace(/[^a-z ]+/g, " ").split(/\s+/).filter(Boolean);
function overlap(script, heard) {
  const want = words(script), got = words(heard);
  const pool = [...got]; let hit = 0;
  for (const w of want) { const i = pool.indexOf(w); if (i >= 0) { hit++; pool.splice(i, 1); } }
  return want.length ? hit / want.length : 0;
}

// ── R2 ──────────────────────────────────────────────────────────────────────
async function r2Get(key, file) {
  const o = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  await writeFile(file, Buffer.from(await o.Body.transformToByteArray()));
}
async function r2Put(key, file, type) {
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: await readFile(file), ContentType: type }));
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: 7 * 24 * 3600 });
}

// ── The job ─────────────────────────────────────────────────────────────────
async function main() {
  const [scriptPath, slidePrefix] = process.argv.slice(2);
  if (!KEY) throw new Error("GEMINI_API_KEY is not set");
  if (!scriptPath) throw new Error("usage: make.mjs <sound-script.mjs> <r2 slide prefix>");
  const S = (await import(pathToFileURL(path.resolve(scriptPath)).href)).default;
  const L = S.length;
  // "cover": the soundtrack plays over slide 1 for the whole length (the owner's
  // choice: slide 1 is posted as a video). Otherwise one window per slide.
  const windows = S.picture === "cover" ? [L] : S.slides;
  const total = windows.reduce((a, b) => a + b, 0);
  if (Math.abs(total - L) > 0.01) throw new Error(`picture windows add up to ${total}, not ${L}`);
  const dir = await mkdtemp(path.join(tmpdir(), "drama-sound-"));
  report.episode = `${S.story} ep ${S.episode}`;
  console.log(`Sound for ${S.story} ep ${S.episode} "${S.title}", ${L} s, ${S.lines.length} lines — working in ${dir}`);

  try {
    // 1. Voices: one line at a time, so every line can be checked and placed.
    console.log("\n1. Voices");
    const lineFiles = [];
    for (const [i, ln] of S.lines.entries()) {
      const v = S.voices[ln.who];
      if (!v) throw new Error(`line ${i + 1}: no voice for "${ln.who}"`);
      const room = ln.by - ln.at;
      let best = null;
      for (let attempt = 1; attempt <= 3 && !best; attempt++) {
        const style = attempt === 1 ? ln.style : `${ln.style} A little quicker than before — it must fit in ${room.toFixed(1)} seconds.`;
        const bytes = await interaction("tts", {
          model: TTS_MODEL,
          input: [{ type: "user_input", content: [{ type: "text", text: ln.text, annotations: [{ type: "speech_metadata", style }] }] }],
          response_format: { type: "audio" },
          generation_config: { speech_config: [{ voice: v.voice }] },
        });
        const raw = path.join(dir, `line${i + 1}-try${attempt}.${ext(bytes)}`);
        await writeFile(raw, bytes);
        // Trim the model's leading/trailing silence so `at` means the first word.
        const trimmed = path.join(dir, `line${i + 1}-try${attempt}-trim.wav`);
        await ff(["-i", raw, "-af", "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.12,areverse", "-ar", "48000", trimmed]);
        const dur = await seconds(trimmed);
        const heard = await listen(
          "Transcribe exactly the words spoken, nothing else, and name the speaker's accent in a few words. " +
          'Answer as JSON: {"words": "...", "accent": "..."}', trimmed, "audio/wav");
        const match = overlap(ln.text, heard.words ?? heard.raw ?? "");
        console.log(`  line ${i + 1} (${ln.who}, ${v.voice}) try ${attempt}: ${dur.toFixed(2)} s of ${room.toFixed(1)}, words ${(match * 100).toFixed(0)}%, accent "${heard.accent ?? "?"}"`);
        const entry = { line: i + 1, who: ln.who, voice: v.voice, attempt, seconds: +dur.toFixed(2), room, heard: heard.words, accent: heard.accent, match: +match.toFixed(2) };
        if (match < 0.85) { entry.rejected = "words"; report.lines.push(entry); continue; }
        if (dur <= room) { best = { file: trimmed, tempo: 1, ...entry }; break; }
        if (dur <= room * 1.12) { best = { file: trimmed, tempo: +(dur / room + 0.005).toFixed(3), ...entry }; break; }
        entry.rejected = "too long"; report.lines.push(entry);
      }
      if (!best) { ok(`line ${i + 1} made, said right and fits`, false, "three tries"); continue; }
      report.lines.push(best);
      ok(`line ${i + 1} (${ln.who}) says the script`, true, `${(best.match * 100).toFixed(0)}% words${best.tempo > 1 ? `, sped up ${best.tempo}x` : ""}`);
      lineFiles.push({ ...best, at: ln.at });
    }

    // 2. Score and effects (Lyria).
    console.log("\n2. Score and effects");
    const beds = {};
    for (const [name, prompt] of [["score", S.score], ["effects", S.effects]]) {
      try {
        const bytes = await interaction("music", { model: MUSIC_MODEL, input: prompt, response_format: { type: "audio" } });
        const f = path.join(dir, `${name}.${ext(bytes)}`);
        await writeFile(f, bytes);
        const dur = await seconds(f), vol = await meanVolume(f);
        ok(`${name} made and long enough`, dur >= L - 0.5, `${dur.toFixed(1)} s`);
        ok(`${name} is not silent`, vol > -45, `mean ${vol} dB`);
        beds[name] = f;
      } catch (e) {
        ok(`${name} made`, false, String(e.message).slice(0, 300));
      }
    }
    if (!beds.score) throw new Error("no score: stopping before the mix");

    // 3. Mix: voices on top, score and effects under them, ducked while anyone speaks.
    console.log("\n3. Mix");
    const inputs = [beds.score, beds.effects ?? beds.score, ...lineFiles.map((l) => l.file)];
    const g = [];
    g.push(`[0:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${L},asetpts=PTS-STARTPTS,loudnorm=I=-26:TP=-6,aresample=48000,afade=t=in:d=0.6,afade=t=out:st=${L - 2}:d=2[score]`);
    g.push(beds.effects
      ? `[1:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${L},asetpts=PTS-STARTPTS,loudnorm=I=-29:TP=-6,aresample=48000,afade=t=out:st=${L - 1.5}:d=1.5[fx]`
      : `anullsrc=r=48000:cl=stereo,atrim=0:${L}[fx]`);
    lineFiles.forEach((l, i) => {
      const ms = Math.round(l.at * 1000);
      const tempo = l.tempo > 1 ? `atempo=${l.tempo},` : "";
      g.push(`[${i + 2}:a]aresample=48000,${tempo}highpass=f=90,acompressor=threshold=-20dB:ratio=3:attack=5:release=150,loudnorm=I=-18:TP=-3,aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[v${i}]`);
    });
    // The voices sit on a full-length silent base: mixed on their own, the track
    // ended with the last line (29.2 s in the first test), not at the full length.
    g.push(`anullsrc=r=48000:cl=stereo,atrim=0:${L}[base]`);
    g.push(`[base]${lineFiles.map((_, i) => `[v${i}]`).join("")}amix=inputs=${lineFiles.length + 1}:normalize=0:duration=first[dlg]`);
    g.push(`[dlg]asplit=3[d][k1][k2]`);
    g.push(`[score][k1]sidechaincompress=threshold=0.015:ratio=8:attack=20:release=450[sd]`);
    g.push(`[fx][k2]sidechaincompress=threshold=0.02:ratio=4:attack=20:release=350[fd]`);
    g.push(`[d][sd][fd]amix=inputs=3:normalize=0:duration=first,atrim=0:${L}[mix]`);
    const pre = path.join(dir, "premix.wav");
    await ff([...inputs.flatMap((f) => ["-i", f]), "-filter_complex", g.join(";"), "-map", "[mix]", "-ar", "48000", "-c:a", "pcm_s24le", pre]);
    // Two-pass loudness to Instagram's -14 LUFS, true peak -1.5 dBTP.
    const { stderr } = await run("ffmpeg", ["-hide_banner", "-i", pre, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"]);
    const m = JSON.parse(stderr.slice(stderr.lastIndexOf("{"), stderr.lastIndexOf("}") + 1));
    const wav = path.join(dir, "mix.wav"), m4a = path.join(dir, "mix.m4a");
    await ff(["-i", pre, "-af", `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,aresample=48000,apad=whole_dur=${L},atrim=0:${L}`, "-c:a", "pcm_s24le", wav]);
    await ff(["-i", wav, "-c:a", "aac", "-b:a", "256k", m4a]);
    const lv = await loudness(wav), mixLen = await seconds(wav);
    ok("mix is exactly the episode length", Math.abs(mixLen - L) < 0.06, `${mixLen.toFixed(2)} s`);
    ok("mix loudness is Instagram's -14 LUFS", Math.abs(lv.lufs + 14) <= 1, `${lv.lufs} LUFS`);
    ok("mix never clips", lv.peak <= -0.9, `peak ${lv.peak} dBFS`);

    // 4. A sound supervisor's listen.
    console.log("\n4. Listening check");
    const cue = S.lines.map((l) => `${l.at.toFixed(1)}s ${l.who}: "${l.text}"`).join("\n");
    const notes = await listen(
      "You are a film sound supervisor checking a 30-second drama soundtrack before release. The script, with start times:\n" + cue +
      "\nListen to the whole mix and answer as JSON: {\"every_line_clear\": true/false, \"lines_cut_or_garbled\": [..], " +
      "\"music_drowns_voices\": true/false, \"glitches_or_artifacts\": [..], \"accent\": \"...\", " +
      "\"mood_fits_a_dark_boardroom_thriller\": true/false, \"score_1_to_10\": n, \"notes\": \"...\"}", m4a, "audio/mp4");
    report.supervisor = notes;
    console.log(`  ${JSON.stringify(notes)}`);

    // 5. Preview: the episode's own slides, cut to the same clock, with the sound.
    console.log("\n5. Preview video");
    let previewFile = null;
    if (slidePrefix) {
      const list = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: slidePrefix }));
      const keys = (list.Contents ?? []).map((o) => o.Key).filter((k) => /\/\d\d\.jpg$/.test(k)).sort();
      const use = S.picture === "cover" ? keys.slice(0, 1) : keys;
      ok("slides found for the preview", use.length === windows.length, `${use.length} of ${windows.length}`);
      if (use.length === windows.length) {
        const clips = [];
        for (const [i, k] of use.entries()) {
          const jpg = path.join(dir, `s${i + 1}.jpg`), clip = path.join(dir, `s${i + 1}.mp4`);
          await r2Get(k, jpg);
          const frames = Math.round(windows[i] * 30);
          // One still in, `frames` out: zoompan makes the slow push-in itself.
          await ff(["-i", jpg, "-vf",
            `scale=2160:-2,zoompan=z='min(zoom+${(0.04 / frames).toFixed(6)},1.04)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1350:fps=30,format=yuv420p`,
            "-frames:v", String(frames), "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", clip]);
          clips.push(clip);
        }
        const listFile = path.join(dir, "clips.txt");
        await writeFile(listFile, clips.map((c) => `file '${c}'`).join("\n"));
        previewFile = path.join(dir, "preview.mp4");
        await ff(["-f", "concat", "-safe", "0", "-i", listFile, "-i", m4a, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "copy", "-shortest", "-movflags", "+faststart", previewFile]);
        ok("preview video made", Math.abs((await seconds(previewFile)) - L) < 0.2, `${(await seconds(previewFile)).toFixed(2)} s`);
      }
    }

    // 6. Store and hand back links.
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const base = `admin/sound-tests/${S.story}-ep${S.episode}-${stamp}`;
    const links = {};
    links.mix_m4a = await r2Put(`${base}/mix.m4a`, m4a, "audio/mp4");
    links.mix_wav = await r2Put(`${base}/mix.wav`, wav, "audio/wav");
    if (beds.score) links.score = await r2Put(`${base}/score.${path.extname(beds.score).slice(1)}`, beds.score, "audio/wav");
    if (beds.effects) links.effects = await r2Put(`${base}/effects.${path.extname(beds.effects).slice(1)}`, beds.effects, "audio/wav");
    if (previewFile) links.preview_mp4 = await r2Put(`${base}/preview.mp4`, previewFile, "video/mp4");
    // Every voice line too, so a re-mix never needs a paid call.
    for (const l of lineFiles) await r2Put(`${base}/lines/line${l.line}-${l.who}.wav`, l.file, "audio/wav");
    report.calls = { ...used };
    report.estimated_usd = +(used.music * 0.08 + used.tts * 0.002 + used.check * 0.002).toFixed(3);
    report.r2 = `${BUCKET}/${base}/`;
    await writeFile(path.join(dir, "report.json"), JSON.stringify(report, null, 2));
    await r2Put(`${base}/report.json`, path.join(dir, "report.json"), "application/json");
    console.log(`\nCalls: ${JSON.stringify(used)}  ≈ $${report.estimated_usd}`);
    console.log(`Problems: ${report.problems.length ? report.problems.join(" | ") : "none"}`);
    console.log(`Saved in ${report.r2}`);
    console.log(`LINKS ${JSON.stringify(links)}`);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((e) => { console.error(`STOPPED: ${e.message}`); console.error(`Calls so far: ${JSON.stringify(used)}`); process.exit(1); });
