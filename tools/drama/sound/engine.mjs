/**
 * The drama sound engine (owner, 2026-10-22): one episode's 30-second film
 * soundtrack — Gemini 3.8 TTS voices, Lyria 3 Pro score and effects — checked,
 * mixed to Instagram loudness, and the cover video (slide 1 for the whole length
 * with the soundtrack) that the publisher posts as the carousel's first item.
 *
 *   makeSound(script, { coverKey, outBase, fake }) → { ok, problems, report, keys }
 *
 * Used by scripts/drama-sound.mjs (automatic, before an episode posts) and
 * tools/drama/sound/make.mjs (a manual test). `fake: true` makes every sound with
 * ffmpeg instead of the paid models, so the whole path can be tested for free.
 *
 * Nothing here posts anything. "ok" is true only when EVERY check passed —
 * each line made, said right and fitting its window; score and effects made,
 * long enough and not silent; the mix at -14 LUFS, true peak at or below -1 dBTP,
 * exactly the episode length; the cover video made; and the listening check
 * clean. Anything less and the episode posts silent, as before.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import path from "node:path";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const run = promisify(execFile);
const API = "https://generativelanguage.googleapis.com/v1beta";
export const MODELS = {
  tts: process.env.SOUND_TTS_MODEL || "gemini-3.8-flash-tts",
  music: process.env.SOUND_MUSIC_MODEL || "lyria-3-pro-preview",
  check: process.env.SOUND_CHECK_MODEL || "gemini-2.5-flash",
};
/** Per episode, so a fault can never run up a bill. */
const CAP = { tts: 20, music: 3, check: 24 };
/** What each call costs (USD), for the record kept with the episode. */
const PRICE = { tts: 0.002, music: 0.08, check: 0.002 };
const BUCKET = "generated-4k";

const s3 = () => new S3Client({ region: "auto", endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } });

// ── Small helpers ────────────────────────────────────────────────────────────
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

// Words as a listener writes them: no punctuation, numbers spelled out.
const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const say = (n) => n < 20 ? ONES[n] : n < 100 ? `${TENS[Math.floor(n / 10)]}${n % 10 ? " " + ONES[n % 10] : ""}` : `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? " " + say(n % 100) : ""}`;
export const words = (s) => String(s).toLowerCase()
  .replace(/(\d+):(\d+)/g, (_, h, m) => `${say(+h)} ${say(+m)}`).replace(/\d+/g, (d) => (+d < 1000 ? say(+d) : d))
  .replace(/p\.?\s?m\.?/g, "pm").replace(/a\.?\s?m\.?/g, "am").replace(/%/g, " percent")
  .replace(/[’']/g, "").replace(/[^a-z ]+/g, " ").split(/\s+/).filter(Boolean);
export function overlap(script, heard) {
  const want = words(script), pool = [...words(heard)]; let hit = 0;
  for (const w of want) { const i = pool.indexOf(w); if (i >= 0) { hit++; pool.splice(i, 1); } }
  return want.length ? hit / want.length : 0;
}

function findAudio(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) { for (const n of node) findAudio(n, out); return out; }
  if ((node.type === "audio" || /^audio\//.test(node.mime_type ?? node.mimeType ?? "")) && typeof node.data === "string") out.push(node);
  for (const v of Object.values(node)) if (v && typeof v === "object") findAudio(v, out);
  return out;
}

/** The engine's paid calls, counted and capped; `fake` makes stand-ins with ffmpeg. */
function caller({ fake, dir, used }) {
  const key = process.env.GEMINI_API_KEY;
  const count = (kind) => { if (++used[kind] > CAP[kind]) throw new Error(`cap reached for ${kind} calls (${CAP[kind]})`); };
  return {
    async tts(text, style, voice, room) {
      count("tts");
      if (fake) {
        const f = path.join(dir, `fake-tts-${used.tts}.wav`);
        const d = Math.max(0.6, Math.min(words(text).length / 2.2, room - 0.2));
        await ff(["-f", "lavfi", "-i", `sine=f=${180 + used.tts * 25}:d=${d.toFixed(2)}:sample_rate=24000`, "-af", "volume=0.4", f]);
        return readFile(f);
      }
      const r = await fetch(`${API}/interactions`, { method: "POST", headers: { "x-goog-api-key": key, "content-type": "application/json" }, body: JSON.stringify({
        model: MODELS.tts,
        input: [{ type: "user_input", content: [{ type: "text", text, annotations: [{ type: "speech_metadata", style }] }] }],
        response_format: { type: "audio" },
        generation_config: { speech_config: [{ voice }] },
      }) });
      const t = await r.text();
      if (!r.ok) throw new Error(`${MODELS.tts} answered ${r.status}: ${t.slice(0, 400)}`);
      const a = findAudio(JSON.parse(t));
      if (!a.length) throw new Error(`${MODELS.tts}: no audio in the answer`);
      return Buffer.from(a[a.length - 1].data, "base64");
    },
    async music(prompt, kind) {
      count("music");
      if (fake) {
        const f = path.join(dir, `fake-${kind}.mp3`);
        const src = kind === "score" ? "sine=f=110:d=60:sample_rate=44100" : "anoisesrc=d=55:c=pink:r=44100:a=0.25";
        await ff(["-f", "lavfi", "-i", src, "-ac", "2", "-b:a", "192k", f]);
        return readFile(f);
      }
      const r = await fetch(`${API}/interactions`, { method: "POST", headers: { "x-goog-api-key": key, "content-type": "application/json" },
        body: JSON.stringify({ model: MODELS.music, input: prompt, response_format: { type: "audio" } }) });
      const t = await r.text();
      if (!r.ok) throw new Error(`${MODELS.music} answered ${r.status}: ${t.slice(0, 400)}`);
      const a = findAudio(JSON.parse(t));
      if (!a.length) throw new Error(`${MODELS.music}: no audio in the answer`);
      return Buffer.from(a[a.length - 1].data, "base64");
    },
    async listen(prompt, file, mime, fakeAnswer) {
      count("check");
      if (fake) return fakeAnswer;
      const data = (await readFile(file)).toString("base64");
      const r = await fetch(`${API}/models/${MODELS.check}:generateContent`, {
        method: "POST", headers: { "x-goog-api-key": key, "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: mime, data } }, { text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0 } }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(`${MODELS.check} answered ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
      const t = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      try { const v = JSON.parse(t); return Array.isArray(v) ? v[0] : v; } catch { return { raw: t }; }
    },
  };
}

/** The listening check passes only on a clean, explicit verdict. */
export function supervisorPasses(n) {
  return !!n && n.every_line_clear === true && n.music_drowns_voices === false
    && Array.isArray(n.glitches_or_artifacts) && n.glitches_or_artifacts.length === 0
    && Array.isArray(n.lines_cut_or_garbled) && n.lines_cut_or_garbled.length === 0
    && Number(n.score_1_to_10) >= 7;
}

/**
 * Make, check and mix one episode's soundtrack and its cover video.
 * @param S       sound script: { story, episode, title, length, mood?, voices: {who: {voice}}, lines, score, effects }
 * @param opts    { coverKey: R2 key of slide 1, outBase: R2 folder for the results, fake?: boolean, log?: fn }
 */
export async function makeSound(S, opts) {
  const log = opts.log ?? ((m) => console.log(m));
  const L = S.length ?? 30;
  const used = { tts: 0, music: 0, check: 0 };
  const report = { story: S.story, episode: S.episode, models: MODELS, fake: !!opts.fake, lines: [], checks: [], started: new Date().toISOString() };
  const problems = [];
  const ok = (name, pass, detail = "") => {
    report.checks.push({ name, pass, detail });
    log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
    if (!pass) problems.push(`${name}${detail ? `: ${detail}` : ""}`);
    return pass;
  };
  const dir = await mkdtemp(path.join(tmpdir(), "drama-sound-"));
  const api = caller({ fake: !!opts.fake, dir, used });
  const keys = {};
  try {
    // 1. Voices, one line at a time.
    log("1. Voices");
    const lineFiles = [];
    for (const [i, ln] of S.lines.entries()) {
      const voice = S.voices[ln.who]?.voice;
      if (!voice) { ok(`line ${i + 1}: a voice for "${ln.who}"`, false); continue; }
      const room = ln.by - ln.at;
      let best = null;
      for (let attempt = 1; attempt <= 3 && !best; attempt++) {
        const style = attempt === 1 ? ln.style : `${ln.style} A little quicker than before — it must fit in ${room.toFixed(1)} seconds.`;
        const bytes = await api.tts(ln.text, style, voice, room);
        const raw = path.join(dir, `line${i + 1}-try${attempt}.${ext(bytes)}`);
        await writeFile(raw, bytes);
        // The model's own silence at both ends goes, so `at` means the first word.
        const trimmed = path.join(dir, `line${i + 1}-try${attempt}-trim.wav`);
        await ff(["-i", raw, "-af", "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.12,areverse", "-ar", "48000", trimmed]);
        const dur = await seconds(trimmed);
        const heard = await api.listen(
          "Transcribe exactly the words spoken, nothing else. Answer as JSON: {\"words\": \"...\"}",
          trimmed, "audio/wav", { words: ln.text });
        const match = overlap(ln.text, heard.words ?? heard.raw ?? "");
        log(`  line ${i + 1} (${ln.who}, ${voice}) try ${attempt}: ${dur.toFixed(2)} s of ${room.toFixed(1)}, words ${(match * 100).toFixed(0)}%`);
        const entry = { line: i + 1, who: ln.who, voice, attempt, seconds: +dur.toFixed(2), room: +room.toFixed(2), heard: heard.words ?? null, match: +match.toFixed(2) };
        if (match < 0.85) { report.lines.push({ ...entry, rejected: "words" }); continue; }
        if (dur <= room) { best = { file: trimmed, tempo: 1, ...entry }; break; }
        if (dur <= room * 1.12) { best = { file: trimmed, tempo: +(dur / room + 0.005).toFixed(3), ...entry }; break; }
        report.lines.push({ ...entry, rejected: "too long" });
      }
      if (!best) { ok(`line ${i + 1} (${ln.who}) made, said right and fits`, false, "three tries"); continue; }
      const { file: _f, ...kept } = best;
      report.lines.push(kept);
      ok(`line ${i + 1} (${ln.who}) says the script`, true, `${(best.match * 100).toFixed(0)}% words${best.tempo > 1 ? `, sped up ${best.tempo}x` : ""}`);
      lineFiles.push({ ...best, at: ln.at });
    }
    if (lineFiles.length !== S.lines.length) throw new Error("a voice line could not be made: stopping before the paid music");

    // 2. Score and effects.
    log("2. Score and effects");
    const beds = {};
    for (const [name, prompt] of [["score", S.score], ["effects", S.effects]]) {
      try {
        const bytes = await api.music(prompt, name);
        const f = path.join(dir, `${name}.${ext(bytes)}`);
        await writeFile(f, bytes);
        const dur = await seconds(f), vol = await meanVolume(f);
        const a = ok(`${name} made and long enough`, dur >= L - 0.5, `${dur.toFixed(1)} s`);
        const b = ok(`${name} is not silent`, vol > -45, `mean ${vol} dB`);
        if (a && b) beds[name] = f;
      } catch (e) {
        ok(`${name} made`, false, String(e.message).slice(0, 300));
      }
    }
    if (!beds.score || !beds.effects) throw new Error("the score or the effects could not be made");

    // 3. Mix: voices on top; score and effects under them, ducked while anyone speaks.
    log("3. Mix");
    const inputs = [beds.score, beds.effects, ...lineFiles.map((l) => l.file)];
    const g = [];
    g.push(`[0:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${L},asetpts=PTS-STARTPTS,loudnorm=I=-26:TP=-6,aresample=48000,afade=t=in:d=0.6,afade=t=out:st=${L - 2}:d=2[score]`);
    g.push(`[1:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${L},asetpts=PTS-STARTPTS,loudnorm=I=-29:TP=-6,aresample=48000,afade=t=out:st=${L - 1.5}:d=1.5[fx]`);
    lineFiles.forEach((l, i) => {
      const ms = Math.round(l.at * 1000);
      const tempo = l.tempo > 1 ? `atempo=${l.tempo},` : "";
      g.push(`[${i + 2}:a]aresample=48000,${tempo}highpass=f=90,acompressor=threshold=-20dB:ratio=3:attack=5:release=150,loudnorm=I=-18:TP=-3,aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[v${i}]`);
    });
    // The voices sit on a full-length silent base: mixed on their own they end
    // with the last line (0.8 s short in the first test).
    g.push(`anullsrc=r=48000:cl=stereo,atrim=0:${L}[base]`);
    g.push(`[base]${lineFiles.map((_, i) => `[v${i}]`).join("")}amix=inputs=${lineFiles.length + 1}:normalize=0:duration=first[dlg]`);
    g.push(`[dlg]asplit=3[d][k1][k2]`);
    g.push(`[score][k1]sidechaincompress=threshold=0.015:ratio=8:attack=20:release=450[sd]`);
    g.push(`[fx][k2]sidechaincompress=threshold=0.02:ratio=4:attack=20:release=350[fd]`);
    g.push(`[d][sd][fd]amix=inputs=3:normalize=0:duration=first,atrim=0:${L}[mix]`);
    const pre = path.join(dir, "premix.wav");
    await ff([...inputs.flatMap((f) => ["-i", f]), "-filter_complex", g.join(";"), "-map", "[mix]", "-ar", "48000", "-c:a", "pcm_s24le", pre]);
    const { stderr } = await run("ffmpeg", ["-hide_banner", "-i", pre, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"]);
    const m = JSON.parse(stderr.slice(stderr.lastIndexOf("{"), stderr.lastIndexOf("}") + 1));
    const wav = path.join(dir, "mix.wav"), m4a = path.join(dir, "mix.m4a");
    await ff(["-i", pre, "-af", `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,aresample=48000,apad=whole_dur=${L},atrim=0:${L}`, "-c:a", "pcm_s24le", wav]);
    await ff(["-i", wav, "-c:a", "aac", "-b:a", "256k", m4a]);
    const lv = await loudness(wav), mixLen = await seconds(wav);
    ok("mix is exactly the episode length", Math.abs(mixLen - L) < 0.06, `${mixLen.toFixed(2)} s`);
    ok("mix loudness is Instagram's -14 LUFS", Math.abs(lv.lufs + 14) <= 1, `${lv.lufs} LUFS`);
    ok("mix never clips", lv.peak <= -0.9, `peak ${lv.peak} dBFS`);

    // 4. The listening check.
    log("4. Listening check");
    const cue = S.lines.map((l) => `${l.at.toFixed(1)}s ${l.who}: "${l.text}"`).join("\n");
    const notes = await api.listen(
      `You are a film sound supervisor checking a ${L}-second drama soundtrack before release. The script, with start times:\n${cue}\n` +
      "Listen to the whole mix and answer as JSON: {\"every_line_clear\": true/false, \"lines_cut_or_garbled\": [..], " +
      "\"music_drowns_voices\": true/false, \"glitches_or_artifacts\": [..], " +
      `\"mood_fits\": true/false (the mood should be: ${S.mood ?? "a prestige drama series"}), \"score_1_to_10\": n, \"notes\": \"...\"}`,
      m4a, "audio/mp4",
      { every_line_clear: true, lines_cut_or_garbled: [], music_drowns_voices: false, glitches_or_artifacts: [], mood_fits: true, score_1_to_10: 8, notes: "fake run" });
    report.supervisor = notes;
    log(`  ${JSON.stringify(notes)}`);
    ok("the listening check is clean", supervisorPasses(notes), notes?.notes ? String(notes.notes).slice(0, 200) : "");

    // 5. The cover video: slide 1 for the whole length, with the soundtrack.
    log("5. Cover video");
    const jpg = path.join(dir, "cover.jpg"), video = path.join(dir, "cover.mp4");
    const o = await s3().send(new GetObjectCommand({ Bucket: BUCKET, Key: opts.coverKey }));
    await writeFile(jpg, Buffer.from(await o.Body.transformToByteArray()));
    const frames = Math.round(L * 30);
    // One still in, `frames` out: a slow push-in across the whole length.
    // Instagram carousel video: H.264 + AAC, 4:5 like the slides, 30 fps, under 60 s.
    await ff(["-i", jpg, "-i", m4a, "-filter_complex",
      `[0:v]scale=2160:-2,zoompan=z='min(zoom+${(0.04 / frames).toFixed(6)},1.04)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1350:fps=30,format=yuv420p[v]`,
      "-map", "[v]", "-map", "1:a", "-frames:v", String(frames), "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-profile:v", "high",
      "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-shortest", "-movflags", "+faststart", video]);
    const vLen = await seconds(video);
    ok("cover video made at the full length", Math.abs(vLen - L) < 0.2, `${vLen.toFixed(2)} s`);

    // 6. Keep everything (voice lines too, so a re-mix never needs a paid call).
    const client = s3();
    const put = async (name, file, type) => {
      const k = `${opts.outBase}/${name}`;
      await client.send(new PutObjectCommand({ Bucket: BUCKET, Key: k, Body: await readFile(file), ContentType: type }));
      return k;
    };
    keys.video = await put("cover-sound.mp4", video, "video/mp4");
    keys.mix = await put("mix.m4a", m4a, "audio/mp4");
    keys.master = await put("mix.wav", wav, "audio/wav");
    keys.score = await put(`score.${path.extname(beds.score).slice(1)}`, beds.score, "audio/mpeg");
    keys.effects = await put(`effects.${path.extname(beds.effects).slice(1)}`, beds.effects, "audio/mpeg");
    for (const l of lineFiles) await put(`lines/line${l.line}-${l.who}.wav`, l.file, "audio/wav");
    keys.preview = await getSignedUrl(client, new GetObjectCommand({ Bucket: BUCKET, Key: keys.video }), { expiresIn: 7 * 24 * 3600 });
  } catch (e) {
    problems.push(String(e.message).slice(0, 400));
    log(`  STOPPED  ${e.message}`);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  report.calls = { ...used };
  report.usd = opts.fake ? 0 : +(used.tts * PRICE.tts + used.music * PRICE.music + used.check * PRICE.check).toFixed(3);
  report.finished = new Date().toISOString();
  return { ok: problems.length === 0 && !!keys.video, problems, report, keys };
}
