/**
 * The drama sound engine: one episode's 30-second film soundtrack and the cover
 * video (slide 1 for the whole length) that the publisher posts as the
 * carousel's first item.
 *
 * Owner, 2026-10-22: "cinematic, premium, Hollywood-like … the voice direction,
 * giving the voice life, giving it emotions … as good as the graphics." So:
 *   1. VOICES — the narrator reads in continuous blocks, every sentence with its
 *      own delivery (Gemini 3.8 TTS turn styles + marks like <gasp>, CAPS for
 *      stress); characters cut in with their own designed voices. Every block is
 *      recorded THREE times and a voice director (Gemini 3.1 Pro) listens to the
 *      takes, writes down what was said and keeps the one with the most life — or
 *      sends a note for one more round.
 *   2. TIMELINE — built from the real takes: hook at once, a drop before the
 *      twist, the cliff, the vote, the series sting. Fitted to 30 s.
 *   3. MUSIC — Lyria 3 Pro composes a trailer underscore and the scene's sound to
 *      that exact timeline; the mixer enforces the drops and lays the sound kit's
 *      hits, riser and sting to the frame (tools/drama/sound/kit.mjs).
 *   4. MIX — a studio voice chain (EQ, de-ess, compression, a close room for the
 *      narrator, the scene's room for characters), music ducked under every word,
 *      bus compression, -14 LUFS / -1.5 dBTP, exactly 30 s.
 *   5. RELEASE CHECK — the director listens to the finished mix and scores it like
 *      a streaming release; anything below the bar and the episode posts silent.
 *
 *   makeSound(script, { coverKey, outBase, fake }) → { ok, problems, report, keys }
 *
 * `fake: true` makes every sound with ffmpeg instead of the paid models, so the
 * whole path can be tested for free. Nothing here posts anything.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const run = promisify(execFile);
const API = "https://generativelanguage.googleapis.com/v1beta";
export const MODELS = {
  tts: process.env.SOUND_TTS_MODEL || "gemini-3.8-flash-tts",
  music: process.env.SOUND_MUSIC_MODEL || "lyria-3-pro-preview",
  director: process.env.SOUND_DIRECTOR_MODEL || "gemini-3.1-pro-preview",
};
/** Per episode, so a fault can never run up a bill. */
const CAP = { tts: 56, music: 4, director: 20 };
/** What each call costs (USD), roughly, for the record kept with the episode. */
const PRICE = { tts: 0.003, music: 0.08, director: 0.012 };
const BUCKET = "generated-4k";
export const KIT_BASE = "drama/sound-kit";
/** Performance marks the voice model understands (Gemini TTS docs). No <whispers>: half-heard in tests. */
export const TAGS = ["<gasp>", "<short pause>", "<long pause>", "<breath>", "<sigh>", "<exhales>", "<chuckle>", "<laugh>", "<sob>", "<tsk>"];
const TAKES = 4, RETAKES = 3;
// A narrator sentence with no delivery note still drives on (first real run: most
// bare takes came back "too slow, lacks urgency").
const NARRATOR_DEFAULT = "brisk, gripping storytelling";

const s3 = () => new S3Client({ region: "auto", endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } });

// ── Small helpers ────────────────────────────────────────────────────────────
const ff = (args) => run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { maxBuffer: 64 * 1024 * 1024 });
export async function seconds(file) {
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
const r2 = (n) => Math.round(n * 100) / 100;
const ts = (sec) => { const s = Math.max(0, Math.min(30, Math.round(sec))); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/** The words actually spoken: performance marks off. */
export const spoken = (s) => String(s ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
// Words as a listener writes them: no punctuation, numbers spelled out.
const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const say = (n) => n < 20 ? ONES[n] : n < 100 ? `${TENS[Math.floor(n / 10)]}${n % 10 ? " " + ONES[n % 10] : ""}` : `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? " " + say(n % 100) : ""}`;
export const words = (s) => spoken(s).toLowerCase()
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
const parseJson = (t) => { try { const v = JSON.parse(t); return Array.isArray(v) ? v[0] : v; } catch { return { raw: t }; } };

/** The engine's paid calls, counted and capped; `fake` makes stand-ins with ffmpeg. */
function caller({ fake, dir, used }) {
  const key = process.env.GEMINI_API_KEY;
  const count = (kind) => { if (++used[kind] > CAP[kind]) throw new Error(`cap reached for ${kind} calls (${CAP[kind]})`); };
  return {
    /** One performance: `items` = [{ text, style }] read as one continuous take by one voice. */
    async tts(items, voice) {
      count("tts");
      if (fake) {
        const f = path.join(dir, `fake-tts-${used.tts}.wav`);
        const d = Math.max(0.6, items.reduce((n, it) => n + words(it.text).length, 0) / 2.4 + 0.2 * (items.length - 1));
        await ff(["-f", "lavfi", "-i", `sine=f=${170 + (used.tts % 9) * 20}:d=${d.toFixed(2)}:sample_rate=24000`, "-af", "volume=0.4", "-ac", "1", f]);
        return readFile(f);
      }
      const content = items.map((it) => ({ type: "text", text: it.text,
        ...(it.style ? { annotations: [{ type: "speech_metadata", style: it.style }] } : {}) }));
      const r = await fetch(`${API}/interactions`, { method: "POST", headers: { "x-goog-api-key": key, "content-type": "application/json" }, body: JSON.stringify({
        model: MODELS.tts, input: [{ type: "user_input", content }],
        response_format: { type: "audio" }, generation_config: { speech_config: [{ voice }] },
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
        const src = kind === "score" ? "sine=f=110:d=40:sample_rate=44100" : "anoisesrc=d=40:c=pink:r=44100:a=0.25";
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
    /** The director listens: `parts` = text and { file, mime } items in order. */
    async director(parts, fakeAnswer) {
      count("director");
      if (fake) return typeof fakeAnswer === "function" ? fakeAnswer() : fakeAnswer;
      const body = [];
      for (const p of parts) {
        if (typeof p === "string") body.push({ text: p });
        else body.push({ inline_data: { mime_type: p.mime, data: (await readFile(p.file)).toString("base64") } });
      }
      const r = await fetch(`${API}/models/${MODELS.director}:generateContent`, {
        method: "POST", headers: { "x-goog-api-key": key, "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: body }], generationConfig: { responseMimeType: "application/json", temperature: 0 } }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(`${MODELS.director} answered ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
      return parseJson(j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "");
    },
  };
}

// ── The sound kit: hits, riser and the series sting, laid to the frame ──────
/** A free, always-available kit drawn with ffmpeg (used in fake runs and when no kit was made). */
async function builtInKit(dir) {
  const make = async (name, expr, d, extra = "") => {
    const f = path.join(dir, `kit-${name}.wav`);
    await ff(["-f", "lavfi", "-i", `aevalsrc=exprs='${expr}':s=48000:d=${d}`, "-af", `${extra}aformat=channel_layouts=stereo`, f]);
    return f;
  };
  return {
    source: "built-in",
    boom: await make("boom", "0.9*sin(2*PI*(52*t-7*t*t))*exp(-t*1.2)+0.45*(random(0)*2-1)*exp(-t*16)", 3.5, "lowpass=f=2200,"),
    hit: await make("hit", "0.8*sin(2*PI*(95*t-25*t*t))*exp(-t*5)+0.6*(random(0)*2-1)*exp(-t*28)", 1.2, "lowpass=f=4000,"),
    riser: await make("riser", "(0.35*(random(0)*2-1)+0.3*sin(2*PI*(180*t+170*t*t)))*pow(t/2.6,2.2)", 2.6, "highpass=f=300,"),
    logo: null,
  };
}
/** The kit made once by kit.mjs (Lyria + chosen by ear), else the built-in one. */
async function loadKit(dir, fake) {
  // A free test can still use the real kit (it costs nothing to download): SOUND_KIT_IN_FAKE=1.
  if (fake && process.env.SOUND_KIT_IN_FAKE !== "1") return builtInKit(dir);
  try {
    const client = s3();
    const get = async (k) => Buffer.from(await (await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: k }))).Body.transformToByteArray());
    const index = JSON.parse((await get(`${KIT_BASE}/kit.json`)).toString("utf8"));
    const fallback = await builtInKit(dir);
    const kit = { source: `kit ${index.made ?? ""}`.trim() };
    for (const name of ["boom", "hit", "riser", "logo"]) {
      const k = index.use?.[name];
      if (!k) { kit[name] = fallback[name]; continue; }
      const f = path.join(dir, `kit-${name}${path.extname(k)}`);
      await writeFile(f, await get(k));
      kit[name] = f;
    }
    return kit;
  } catch {
    return builtInKit(dir);
  }
}

// ── Voices: blocks, takes and the director ───────────────────────────────────
/** Groups the beats (numbered from 1) into blocks read as one take each. */
export function blocksOf(S) {
  const B = S.beats, T = S.twist, C = S.cliff, A = B.length;
  const blocks = [];
  let cur = null;
  B.forEach((b, i) => {
    const n = i + 1;
    const breakHere = !cur || b.who !== "narrator" || cur.who !== "narrator" || n === T || n === C || n === C + 1 || n === A || cur.beats.length >= 5;
    if (breakHere) { cur = { who: b.who, beats: [] }; blocks.push(cur); }
    cur.beats.push(n);
  });
  return blocks.map((bl, i) => ({ ...bl, i: i + 1, items: bl.beats.map((n) => ({ text: B[n - 1].text, style: B[n - 1].style || (bl.who === "narrator" ? NARRATOR_DEFAULT : "") })),
    twist: bl.beats[0] === T, cliff: bl.beats[0] === C, ask: bl.beats.includes(A) }));
}
const SERIOUS = /glitch|artifact|artefact|robot|garble|cut off|cut-off|clipped off|noise|distort|wrong word|missing word|skipped|mispronoun/i;
function takePasses(t) {
  return t.match >= 0.88 && Number(t.life) >= 7 && Number(t.clarity) >= 8 && Number(t.direction) >= 6
    && !(t.problems ?? []).some((p) => SERIOUS.test(String(p)));
}

/** Record `n` takes of a block, let the director judge them, return the takes with verdicts. */
async function takesFor(api, dir, bl, voice, n, note, log) {
  const files = [];
  for (let k = 1; k <= n; k++) {
    const items = note ? bl.items.map((it) => ({ ...it, style: [it.style, note].filter(Boolean).join(", ").slice(0, 80) })) : bl.items;
    const bytes = await api.tts(items, voice);
    const raw = path.join(dir, `b${bl.i}-${note ? "r" : "t"}${k}.${ext(bytes)}`);
    await writeFile(raw, bytes);
    // The model's own silence at both ends goes, so a block's start is its first sound.
    const trimmed = raw.replace(/\.\w+$/, "-trim.wav");
    await ff(["-i", raw, "-af", "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.04,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.12,areverse", "-ar", "48000", "-ac", "1", trimmed]);
    files.push({ file: trimmed, seconds: await seconds(trimmed), note: note ?? null });
  }
  const script = bl.items.map((it, j) => `${j + 1}. "${spoken(it.text)}"${it.style ? ` — delivery: ${it.style}` : ""}${/<[^>]+>/.test(it.text) ? ` — mark: ${it.text.match(/<[^>]+>/)[0]}` : ""}`).join("\n");
  const who = bl.who === "narrator" ? "the narrator of a gripping drama recap (fast, urgent storytelling, every sentence lands)" : `a character's single line cutting into the trailer`;
  const parts = [];
  files.forEach((f, k) => { parts.push(`TAKE ${k + 1}:`); parts.push({ file: f.file, mime: "audio/wav" }); });
  parts.push(
    `You are the voice director on a premium streaming drama trailer, in a recording session. Above are ${files.length} takes of ${who}. The script and the intended delivery:\n${script}\n` +
    "For EACH take: write down exactly the words you hear, then judge it the way a demanding director would. " +
    "life = does it sound like a live, emotionally engaged performer (10) or someone reading a list (1)? direction = does the delivery match the notes? clarity = is every word clear on a phone speaker? " +
    "problems = only what a listener would notice (robotic tone, glitch, garbled or missing word, wrong stress, flat line, mispronounced name, odd pause). " +
    'Answer as JSON: {"takes":[{"take":1,"heard":"...","life":0,"direction":0,"clarity":0,"pace":"too slow|right|too fast","problems":[]}],"best":1,"note":"one short note for the performer if no take is good enough"}');
  const fake = () => ({ takes: files.map((_, k) => ({ take: k + 1, heard: bl.items.map((it) => spoken(it.text)).join(" "), life: 8, direction: 8, clarity: 9, pace: "right", problems: [] })), best: 1, note: "" });
  const v = await api.director(parts, fake);
  const out = files.map((f, k) => {
    const t = (v.takes ?? []).find((x) => Number(x.take) === k + 1) ?? {};
    const want = bl.items.map((it) => it.text).join(" ");
    return { ...f, take: k + 1, heard: t.heard ?? null, match: r2(overlap(want, t.heard ?? "")), life: Number(t.life ?? 0), direction: Number(t.direction ?? 0),
      clarity: Number(t.clarity ?? 0), pace: t.pace ?? null, problems: Array.isArray(t.problems) ? t.problems : [] };
  });
  for (const t of out) log(`    take ${t.take}${t.note ? " (retake)" : ""}: ${t.seconds.toFixed(2)} s, words ${Math.round(t.match * 100)}%, life ${t.life}, direction ${t.direction}, clarity ${t.clarity}, ${t.pace ?? "?"}${t.problems.length ? ` — ${t.problems.join("; ")}` : ""}`);
  return { takes: out, best: Number(v.best), note: typeof v.note === "string" ? v.note.slice(0, 60) : "" };
}
const pick = (takes, best) => {
  const ok = takes.filter(takePasses);
  if (!ok.length) return null;
  return ok.find((t) => t.take === best) ?? ok.sort((a, b) => (b.life + b.direction) - (a.life + a.direction))[0];
};

// ── The mix's gain curves ─────────────────────────────────────────────────────
/** A piecewise-linear gain over time as an ffmpeg expression: points [[t, g], ...]. */
function curve(points) {
  const P = points.filter((p, i) => i === 0 || p[0] > points[i - 1][0]).map(([t, g]) => [r2(t), r2(g)]);
  let e = String(P[P.length - 1][1]);
  for (let i = P.length - 2; i >= 0; i--) {
    const [t0, g0] = P[i], [t1, g1] = P[i + 1];
    e = `if(lt(t,${t1}),${g0}+(${r2(g1 - g0)})*(t-${t0})/${r2(t1 - t0) || 0.01},${e})`;
  }
  return `if(lt(t,${P[0][0]}),${P[0][1]},${e})`;
}

/**
 * Make, check and mix one episode's soundtrack and its cover video.
 * @param S    sound script (writer.mjs): { story, episode, title, length, mood, voices: {who: {voice}},
 *             beats: [{who, text, style}], twist, cliff (beat numbers from 1), score_style, scene_sound, moments }
 * @param opts { coverKey: R2 key of slide 1, outBase: R2 folder for the results, fake?: boolean, log?: fn,
 *             reuse?: { blockHash: R2 key } — takes the director passed in an earlier run (takes.json) }
 */
export async function makeSound(S, opts) {
  const log = opts.log ?? ((m) => console.log(m));
  const L = S.length ?? 30;
  const used = { tts: 0, music: 0, director: 0 };
  const report = { story: S.story, episode: S.episode, models: MODELS, fake: !!opts.fake, blocks: [], checks: [], started: new Date().toISOString() };
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
  const kept = {}; // block hash → R2 key of the take the director passed
  try {
    const kit = await loadKit(dir, !!opts.fake);
    const logoLen = kit.logo ? await seconds(kit.logo) : 0;
    report.kit = kit.source;

    // 1. Voices: every block four takes, the director keeps the best (one more round on a note).
    // A take the director already passed (same voice, words and delivery) is reused, never paid twice.
    log("1. Voices");
    const blocks = blocksOf(S);
    const chosen = [];
    const client0 = s3();
    for (const bl of blocks) {
      const voice = S.voices[bl.who]?.voice;
      if (!voice) { ok(`block ${bl.i}: a voice for "${bl.who}"`, false); continue; }
      const hash = createHash("sha1").update(`${MODELS.tts}|${voice}|${JSON.stringify(bl.items)}`).digest("hex").slice(0, 16);
      log(`  block ${bl.i} (${bl.who}${bl.twist ? ", twist" : ""}${bl.cliff ? ", cliff" : ""}${bl.ask ? ", vote" : ""}): ${bl.items.map((it) => spoken(it.text)).join(" ")}`);
      const again = opts.reuse?.[hash];
      if (again) {
        try {
          const f = path.join(dir, `b${bl.i}-reused.wav`);
          await writeFile(f, Buffer.from(await (await client0.send(new GetObjectCommand({ Bucket: BUCKET, Key: again }))).Body.transformToByteArray()));
          const sec = await seconds(f);
          log(`    reused the take the director passed before (${sec.toFixed(2)} s)`);
          report.blocks.push({ block: bl.i, who: bl.who, voice, beats: bl.beats, hash, reused: again });
          kept[hash] = again;
          chosen.push({ ...bl, file: f, seconds: sec });
          ok(`block ${bl.i} (${bl.who}) performed, said right and alive`, true, "reused");
          continue;
        } catch (e) { log(`    could not reuse ${again}: ${e.message} — recording it again`); }
      }
      let round = await takesFor(api, dir, bl, voice, TAKES, null, log);
      let best = pick(round.takes, round.best);
      const tried = [...round.takes];
      if (!best) {
        log(`    no take good enough — one more round${round.note ? ` with the note "${round.note}"` : ""}`);
        round = await takesFor(api, dir, bl, voice, RETAKES, round.note || "more alive, every word clear", log);
        tried.push(...round.takes);
        best = pick(round.takes, round.best);
      }
      report.blocks.push({ block: bl.i, who: bl.who, voice, beats: bl.beats, hash, takes: tried.map(({ file: _f, ...t }) => t), kept: best ? { take: best.take, retake: !!best.note } : null });
      if (!ok(`block ${bl.i} (${bl.who}) performed, said right and alive`, !!best, best ? `take ${best.take}${best.note ? " of the retake" : ""}, life ${best.life}` : "no take passed the director")) continue;
      // Kept at once, so a later run can reuse it even if this one stops.
      const k = `${opts.outBase}/voices/block${bl.i}-${bl.who}-${hash}.wav`;
      await client0.send(new PutObjectCommand({ Bucket: BUCKET, Key: k, Body: await readFile(best.file), ContentType: "audio/wav" }));
      kept[hash] = k;
      chosen.push({ ...bl, file: best.file, seconds: best.seconds });
    }
    if (chosen.length !== blocks.length) throw new Error("a voice block could not be made: stopping before the paid music");

    // 2. Timeline: hook at once, a drop before the twist, the cliff, the vote, then the sting.
    log("2. Timeline");
    // The sting plays whole before the end, so the speech must finish before it.
    const endSpeech = L - (logoLen ? Math.min(logoLen, 3.8) + 0.25 : 1.2);
    const gapWant = (bl, prev) => bl.twist ? [0.75, 0.45] : bl.cliff ? [0.5, 0.3] : bl.ask ? [0.6, 0.35] : (bl.who !== prev.who ? [0.2, 0.12] : [0.25, 0.15]);
    const START = 0.3;
    const gaps = chosen.map((bl, i) => (i === 0 ? [START, START] : gapWant(bl, chosen[i - 1])));
    let speech = chosen.reduce((n, b) => n + b.seconds, 0);
    let tempo = 1;
    const fits = (g) => START + speech / tempo + g.slice(1).reduce((n, x) => n + x, 0) <= endSpeech;
    let use = gaps.map((g) => g[0]);
    if (!fits(use)) use = gaps.map((g) => g[1]);
    if (!fits(use)) {
      tempo = (speech) / (endSpeech - START - use.slice(1).reduce((n, x) => n + x, 0));
      if (tempo > 1.12) throw new Error(`the performance runs ${speech.toFixed(1)} s — too long for ${L} s even at 1.12x`);
      tempo = r2(tempo + 0.005);
    }
    let t = 0;
    const timeline = chosen.map((bl, i) => {
      t += use[i];
      const at = r2(t), dur = r2(bl.seconds / tempo);
      t += dur;
      return { ...bl, at, end: r2(at + dur) };
    });
    const tw = timeline.find((b) => b.twist) ?? timeline[Math.floor(timeline.length / 2)];
    const cl = timeline.find((b) => b.cliff) ?? timeline[timeline.length - 2];
    const ask = timeline[timeline.length - 1];
    const twGap = use[timeline.indexOf(tw)];
    const logoAt = r2(ask.end + 0.2);
    // Where each beat falls (by its share of the block's words), for the sound effects.
    const beatAt = {};
    for (const b of timeline) {
      const counts = b.items.map((it) => Math.max(1, words(it.text).length)), all = counts.reduce((n, x) => n + x, 0);
      let acc = 0;
      b.beats.forEach((n, j) => { beatAt[n] = r2(b.at + (b.end - b.at) * acc / all); acc += counts[j]; });
    }
    report.timeline = timeline.map((b) => ({ block: b.i, who: b.who, at: b.at, end: b.end })).concat([{ logo: logoLen ? logoAt : null }]);
    report.tempo = tempo;
    log(`  ${timeline.map((b) => `${b.who}@${b.at}`).join("  ")}  | twist ${tw.at}, cliff ${cl.at}–${cl.end}, vote ends ${ask.end}${logoLen ? `, sting ${logoAt}` : ""}${tempo > 1 ? `, tempo ${tempo}x` : ""}`);
    ok("the performance fits the episode", ask.end <= endSpeech + 0.05, `speech ends ${ask.end} s of ${L}`);

    // 3. Music and the scene, composed to this exact timeline.
    log("3. Score and scene");
    const dropAt = r2(tw.at - twGap);
    const scorePrompt = [
      `Instrumental only, no vocals. A premium cinematic movie-trailer underscore for ${S.mood ?? "a drama series"}: ${S.score_style ?? ""} Polished, modern, Hollywood trailer production. Total length exactly ${L} seconds.`,
      `[0:00 - 0:01] One deep, heavy opening impact; the pulse starts at once.`,
      `[0:01 - ${ts(dropAt)}] A tight, driving trailer pulse that builds steadily — low string ostinato, deep synth pulse, ticking percussion — kept low in the middle so a voice sits on top.`,
      `[${ts(dropAt)} - ${ts(tw.at)}] A sudden stop: silence.`,
      `[${ts(tw.at)} - ${ts(Math.max(tw.at + 1, cl.at - 2.5))}] The pulse returns harder and higher, tension rising.`,
      `[${ts(cl.at - 2.5)} - ${ts(cl.at)}] A rising riser into a sudden cut.`,
      `[${ts(cl.at)} - ${ts(cl.end)}] Near silence: one low held note.`,
      `[${ts(cl.end)} - ${ts(logoAt)}] A massive low trailer impact, then a dark sustained tail.`,
      `[${ts(logoAt)} - ${ts(L)}] Fade to silence.`,
    ].join("\n");
    const moments = (S.moments ?? []).filter((m) => beatAt[m.beat] != null).map((m) => `[${ts(beatAt[m.beat])}] ${m.sound}.`);
    const scenePrompt = [
      `Sound design only. No music, no melody, no instruments, no vocals. ${S.scene_sound ?? "A quiet room"} — realistic, subtle and cinematic, for the whole ${L} seconds.`,
      ...moments,
      `[${ts(L - 2)} - ${ts(L)}] The ambience fades out.`,
    ].join("\n");
    report.prompts = { score: scorePrompt, scene: scenePrompt };
    // Lyria sometimes refuses a prompt "for an unspecified policy reason": one retry with a plain one.
    const plain = {
      score: `Instrumental only, no vocals. A restrained cinematic trailer underscore for ${S.mood ?? "a drama series"}: low strings, deep pulse, soft percussion. Total length exactly ${L} seconds.\n[0:00 - ${ts(dropAt)}] A steady pulse, building.\n[${ts(dropAt)} - ${ts(tw.at)}] Silence.\n[${ts(tw.at)} - ${ts(cl.end)}] Rising tension.\n[${ts(cl.end)} - ${ts(L)}] One deep impact, then fading to silence.`,
      scene: `Sound design only. No music, no melody, no instruments, no vocals. A calm, realistic room ambience, ${L} seconds.\n[0:00 - ${ts(L)}] Soft room tone and gentle background air.`,
    };
    report.refused = [];
    const lyria = async (prompt, name) => {
      try {
        return await api.music(prompt, name);
      } catch (e) {
        if (!/content_blocked|policy/i.test(String(e.message))) throw e;
        report.refused.push({ kind: name, prompt });
        log(`  ${name}: Lyria refused the written prompt; trying a plain one`);
        return api.music(plain[name], name);
      }
    };
    const beds = {};
    for (const [name, prompt] of [["score", scorePrompt], ["scene", scenePrompt]]) {
      try {
        const bytes = await lyria(prompt, name);
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
    if (!beds.score || !beds.scene) throw new Error("the score or the scene sound could not be made");

    // 4. Mix.
    log("4. Mix");
    const ir = path.join(dir, "room.wav");
    await ff(["-f", "lavfi", "-i", "aevalsrc=exprs='(random(0)*2-1)*exp(-t*9)':s=48000:d=0.7", "-af", "highpass=f=250,lowpass=f=6500", "-ac", "1", ir]);
    const kitParts = [
      { name: "boom", file: kit.boom, at: 0, gain: 0.85 },
      { name: "hit", file: kit.hit, at: Math.max(0, tw.at - 0.03), gain: 0.7 },
      { name: "riser", file: kit.riser, at: null, gain: 0.55 },
      { name: "boom", file: kit.boom, at: r2(cl.end + 0.05), gain: 0.95 },
      { name: "logo", file: kit.logo, at: logoAt, gain: 1.0 },
    ].filter((k) => k.file);
    for (const k of kitParts) if (k.name === "riser") k.at = Math.max(0, r2(cl.at - 0.1 - (await seconds(k.file))));
    const inputs = [beds.score, beds.scene, ir, ...timeline.map((b) => b.file), ...kitParts.map((k) => k.file)];
    const V0 = 3, K0 = 3 + timeline.length;
    const g = [];
    // Score: the trailer drop before the twist, near silence under the cliff, out before the sting.
    const scoreGain = curve([[0, 1], [dropAt, 1], [dropAt + 0.12, 0], [tw.at - 0.02, 0], [tw.at + 0.3, 1], [cl.at - 0.15, 1], [cl.at + 0.05, 0.22], [cl.end, 0.22], [cl.end + 0.25, 0.8], [logoAt - 0.1, 0.8], [logoAt + 0.6, logoLen ? 0 : 0.5], [L, 0]]);
    const sceneGain = curve([[0, 1], [dropAt, 1], [dropAt + 0.1, 0.35], [tw.at + 0.3, 1], [logoAt, 1], [L, 0.2]]);
    g.push(`[0:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${L},asetpts=PTS-STARTPTS,loudnorm=I=-24:TP=-4,aresample=48000,volume='${scoreGain}':eval=frame,afade=t=out:st=${L - 1.2}:d=1.2[score]`);
    g.push(`[1:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${L},asetpts=PTS-STARTPTS,loudnorm=I=-30:TP=-6,aresample=48000,volume='${sceneGain}':eval=frame,afade=t=out:st=${L - 1.5}:d=1.5[scene]`);
    g.push(`[2:a]asplit=${timeline.length}${timeline.map((_, i) => `[ir${i}]`).join("")}`);
    timeline.forEach((b, i) => {
      const ms = Math.round(b.at * 1000);
      const tempoF = tempo > 1 ? `atempo=${tempo},` : "";
      // The studio voice: low cut, a little less mud, presence and air, de-essed, compressed.
      const chain = b.who === "narrator"
        ? "highpass=f=70,equalizer=f=250:t=q:w=1:g=-2,equalizer=f=3800:t=q:w=1.2:g=2.5,highshelf=f=10000:g=2,deesser=i=0.35,acompressor=threshold=-21dB:ratio=3:attack=4:release=120:makeup=2"
        : "highpass=f=90,equalizer=f=300:t=q:w=1:g=-1.5,equalizer=f=3200:t=q:w=1.2:g=1.5,deesser=i=0.3,acompressor=threshold=-20dB:ratio=2.5:attack=6:release=150:makeup=2";
      const wet = b.who === "narrator" ? 0.06 : 0.16; // a close booth for the narrator, the scene's room for characters
      g.push(`[${V0 + i}:a]aresample=48000,aformat=channel_layouts=mono,${tempoF}${chain},loudnorm=I=${b.who === "narrator" ? -16 : -17}:TP=-2,aresample=48000,asplit=2[vd${i}][vw${i}]`);
      g.push(`[vw${i}][ir${i}]afir[vr${i}]`);
      g.push(`[vd${i}][vr${i}]amix=inputs=2:weights='1 ${wet}':normalize=0,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[v${i}]`);
    });
    g.push(`anullsrc=r=48000:cl=stereo,atrim=0:${L}[base]`);
    g.push(`[base]${timeline.map((_, i) => `[v${i}]`).join("")}amix=inputs=${timeline.length + 1}:normalize=0:duration=first[dlg]`);
    kitParts.forEach((k, j) => {
      const ms = Math.round(k.at * 1000);
      g.push(`[${K0 + j}:a]aresample=48000,aformat=channel_layouts=stereo,loudnorm=I=-18:TP=-3,aresample=48000,volume=${k.gain},adelay=${ms}|${ms}[k${j}]`);
    });
    g.push(`anullsrc=r=48000:cl=stereo,atrim=0:${L}[kbase]`);
    g.push(`[kbase]${kitParts.map((_, j) => `[k${j}]`).join("")}amix=inputs=${kitParts.length + 1}:normalize=0:duration=first[kit]`);
    g.push(`[dlg]asplit=3[d][s1][s2]`);
    g.push(`[score][s1]sidechaincompress=threshold=0.012:ratio=6:attack=15:release=400[sd]`);
    g.push(`[scene][s2]sidechaincompress=threshold=0.02:ratio=3:attack=20:release=350[fd]`);
    g.push(`[d][sd][fd][kit]amix=inputs=4:normalize=0:duration=first,acompressor=threshold=-16dB:ratio=2:attack=25:release=250:makeup=1,atrim=0:${L}[mix]`);
    const pre = path.join(dir, "premix.wav");
    await ff([...inputs.flatMap((f) => ["-i", f]), "-filter_complex", g.join(";"), "-map", "[mix]", "-ar", "48000", "-c:a", "pcm_s24le", pre]);
    const { stderr } = await run("ffmpeg", ["-hide_banner", "-i", pre, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"]);
    const m = JSON.parse(stderr.slice(stderr.lastIndexOf("{"), stderr.lastIndexOf("}") + 1));
    const wav = path.join(dir, "mix.wav"), m4a = path.join(dir, "mix.m4a");
    await ff(["-i", pre, "-af", `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,aresample=48000,apad=whole_dur=${L},atrim=0:${L},afade=t=out:st=${L - 0.3}:d=0.3`, "-c:a", "pcm_s24le", wav]);
    await ff(["-i", wav, "-c:a", "aac", "-b:a", "256k", m4a]);
    const lv = await loudness(wav), mixLen = await seconds(wav);
    ok("mix is exactly the episode length", Math.abs(mixLen - L) < 0.06, `${mixLen.toFixed(2)} s`);
    ok("mix loudness is Instagram's -14 LUFS", Math.abs(lv.lufs + 14) <= 1, `${lv.lufs} LUFS`);
    ok("mix never clips", lv.peak <= -0.9, `peak ${lv.peak} dBFS`);

    // 5. The release check: scored like a streaming release.
    log("5. Release check");
    const cue = timeline.map((b) => `${b.at.toFixed(1)}s ${b.who}: "${b.items.map((it) => spoken(it.text)).join(" ")}"`).join("\n");
    const notes = await api.director([{ file: m4a, mime: "audio/mp4" },
      `You are the supervising sound editor of a premium streaming drama. This is the finished ${L}-second soundtrack that plays over an episode's cover on Instagram: a fast recap narrator, character lines, a trailer score and the scene's sound. The script, with start times:\n${cue}\n` +
      "Judge it as you would for release on a top streaming service — honestly, not kindly. Answer as JSON: {\"every_line_clear\": true/false, \"lines_cut_or_garbled\": [..], \"music_drowns_voices\": true/false, \"glitches_or_artifacts\": [..], " +
      "\"voice_performance\": 1-10, \"pace_and_energy\": 1-10, \"music_and_sound_design\": 1-10, \"mix\": 1-10, \"overall\": 1-10, \"notes\": \"...\"}"],
      { every_line_clear: true, lines_cut_or_garbled: [], music_drowns_voices: false, glitches_or_artifacts: [], voice_performance: 8, pace_and_energy: 8, music_and_sound_design: 8, mix: 8, overall: 8, notes: "fake run" });
    report.supervisor = notes;
    log(`  ${JSON.stringify(notes)}`);
    ok("the release check passes", supervisorPasses(notes), notes?.notes ? String(notes.notes).slice(0, 240) : "");

    // 6. The cover video: slide 1 for the whole length, with the soundtrack.
    log("6. Cover video");
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

    // 7. Keep everything (every block's chosen take too, so a re-mix never needs a paid call).
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
    keys.scene = await put(`scene.${path.extname(beds.scene).slice(1)}`, beds.scene, "audio/mpeg");
    keys.preview = await getSignedUrl(client, new GetObjectCommand({ Bucket: BUCKET, Key: keys.video }), { expiresIn: 7 * 24 * 3600 });
  } catch (e) {
    problems.push(String(e.message).slice(0, 400));
    log(`  STOPPED  ${e.message}`);
  } finally {
    // The script and the passed takes are kept even when the run stops, so
    // `try.mjs --again <outBase>` re-records only what failed.
    await s3().send(new PutObjectCommand({ Bucket: BUCKET, Key: `${opts.outBase}/script.json`, Body: JSON.stringify(S, null, 2), ContentType: "application/json" })).catch(() => {});
    await s3().send(new PutObjectCommand({ Bucket: BUCKET, Key: `${opts.outBase}/takes.json`, Body: JSON.stringify({ ...(opts.reuse ?? {}), ...kept }, null, 2), ContentType: "application/json" })).catch(() => {});
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  report.calls = { ...used };
  report.usd = opts.fake ? 0 : +(used.tts * PRICE.tts + used.music * PRICE.music + used.director * PRICE.director).toFixed(3);
  report.finished = new Date().toISOString();
  return { ok: problems.length === 0 && !!keys.video, problems, report, keys };
}

/** The release check passes only on a clean verdict at release standard. */
export function supervisorPasses(n) {
  const s = (k) => Number(n?.[k]);
  return !!n && n.every_line_clear === true && n.music_drowns_voices === false
    && Array.isArray(n.glitches_or_artifacts) && n.glitches_or_artifacts.length === 0
    && Array.isArray(n.lines_cut_or_garbled) && n.lines_cut_or_garbled.length === 0
    && ["voice_performance", "pace_and_energy", "music_and_sound_design", "mix"].every((k) => s(k) >= 7)
    && s("overall") >= 8;
}
