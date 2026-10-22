/**
 * Writes an episode's sound script from the episode itself (owner, 2026-10-22:
 * automatic, "no room for errors") and checks it against hard rules before a
 * single sound is made. The script is a 30-second trailer that plays over the
 * cover: 3–6 short lines, about 30 words, a hook in the first second, the vote
 * question at the end, and Lyria prompts for the score and the effects timed to
 * the same clock.
 *
 *   writeScript({ story, episode, voices, fake }) → { script, problems, attempts }
 *
 * Gemini drafts it; checkScript() is the referee. A draft that breaks a rule is
 * sent back with the list of what it broke, at most three times; after that the
 * episode posts silent.
 */
import { words } from "./engine.mjs";

const API = "https://generativelanguage.googleapis.com/v1beta";
const WRITER_MODEL = process.env.SOUND_WRITER_MODEL || "gemini-3.1-pro-preview";
// Pace from the first real test: dramatic delivery ran 1.3–2.5 words a second
// (the narrator slowest). The referee allows 1.45; the writer is asked for 1.3,
// so drafts land with room to spare, and the engine re-makes or gently speeds a
// line that still runs long.
export const RULES = { length: 30, minLines: 3, maxLines: 6, maxWords: 32, wordsPerSecond: 1.45, slack: 0.35, firstBy: 1.5, endBy: 29.6, gap: 0.25 };
const SMALL = new Set("a an the and or but of to in on at is are was were be it its his her their them they he she you your i me my we our this that these those for with from by as not no so do does did has have had will can just now then there here what who".split(" "));

// Quote marks off a spoken line (the voice does not read them).
const unquote = (s) => String(s ?? "").replace(/[“”"]/g, "").trim();
// A slide's "Name: “words”" → the words. Only a plain one- or two-word name before
// the colon counts, so "Marina. 9:52 p.m." keeps its time (a wider pattern cut it
// to "52 p.m." in the first job test).
const strip = (s) => unquote(String(s ?? "").replace(/^\s*[A-Z][a-z]+(?: [A-Z][a-z]+)?:\s+/, ""));
const lineWords = (s) => words(s).length;

/** Everything the episode says, as words — what a line may draw on. */
function episodeWords(episode) {
  const all = new Set();
  for (const sl of episode.slides ?? []) for (const w of words(sl.say ?? "")) all.add(w);
  for (const w of words(episode.title ?? "")) all.add(w);
  return all;
}

/** The referee. Returns every rule the script breaks (empty = good). */
export function checkScript(S, { episode, cast }) {
  const p = [];
  const L = S.length ?? RULES.length;
  const lines = Array.isArray(S.lines) ? S.lines : [];
  const known = new Set(["narrator", ...cast.map((c) => c.key)]);
  const vote = (episode.choice?.options ?? []).map((o) => String(o.word).toLowerCase());
  const said = episodeWords(episode);
  if (lines.length < RULES.minLines || lines.length > RULES.maxLines) p.push(`there must be ${RULES.minLines} to ${RULES.maxLines} lines, not ${lines.length}`);
  let total = 0;
  lines.forEach((l, i) => {
    const n = `line ${i + 1}`;
    if (!known.has(l.who)) p.push(`${n}: "${l.who}" is not narrator or a cast key (${[...known].join(", ")})`);
    if (typeof l.text !== "string" || !l.text.trim() || l.text.length > 110) p.push(`${n}: text must be 1–110 characters`);
    if (typeof l.style !== "string" || !l.style.trim() || l.style.length > 260) p.push(`${n}: style must be one short sentence`);
    if (/accent/i.test(l.style ?? "")) p.push(`${n}: style must not ask for an accent`);
    // Whispers were half-understood in both real tests (56–78%): secrets are "hushed but clear".
    if (/whisper/i.test(l.style ?? "")) p.push(`${n}: no whispering — use "hushed but clear" so every word is heard`);
    if (!Number.isFinite(l.at) || !Number.isFinite(l.by) || l.by <= l.at) { p.push(`${n}: at/by must be numbers with by after at`); return; }
    const w = lineWords(l.text);
    total += w;
    const need = w / RULES.wordsPerSecond + RULES.slack;
    if (l.by - l.at < need) p.push(`${n}: ${w} words need at least ${need.toFixed(1)} s, it has ${(l.by - l.at).toFixed(1)} s`);
    if (l.by - l.at > 9) p.push(`${n}: a window longer than 9 s`);
    if (i === 0 && (l.at < 0.3 || l.at > RULES.firstBy)) p.push(`line 1 must start between 0.3 and ${RULES.firstBy} s (the hook)`);
    if (i > 0 && l.at < lines[i - 1].by + RULES.gap) p.push(`${n}: starts before line ${i} has finished (leave ${RULES.gap} s)`);
    if (l.by > Math.min(RULES.endBy, L - 0.4)) p.push(`${n}: must end by ${RULES.endBy} s`);
    // Faithful to the episode: characters say their own words; narration retells.
    const ws = words(l.text).filter((x) => !SMALL.has(x));
    const isLast = i === lines.length - 1;
    if (ws.length && !isLast) {
      const hit = ws.filter((x) => said.has(x)).length / ws.length;
      const need2 = l.who === "narrator" ? 0.5 : 0.75;
      if (hit < need2) p.push(`${n}: ${Math.round(hit * 100)}% of its words come from the episode (needs ${Math.round(need2 * 100)}%) — no new plot`);
    }
  });
  if (total > RULES.maxWords) p.push(`${total} words in all (at most ${RULES.maxWords})`);
  const last = lines[lines.length - 1];
  if (last) {
    if (last.who !== "narrator") p.push("the last line must be the narrator");
    const lw = words(last.text);
    for (const v of vote) if (!lw.includes(v)) p.push(`the last line must say the vote word "${v.toUpperCase()}"`);
  }
  for (const [k, need] of [["score", "instrumental only"], ["effects", "sound design only"]]) {
    const t = String(S[k] ?? "");
    if (!t.includes("[0:00")) p.push(`${k}: must be timed from [0:00`);
    if (!t.toLowerCase().includes(need)) p.push(`${k}: must begin "${need}"`);
    if (t.length > 1800) p.push(`${k}: too long`);
  }
  if (typeof S.mood !== "string" || !S.mood.trim()) p.push("mood: one short phrase is needed");
  return p;
}

function prompt(story, episode, problems) {
  const cast = (story.cast ?? []).map((c) => `  ${c.key} = ${c.name}, ${c.age}, ${c.role}`).join("\n");
  const slides = (episode.slides ?? []).map((s, i) => `  slide ${i + 1} [${s.kind}${s.who ? `, ${s.who}` : ""}]: ${s.say || "(no words)"} — picture: ${String(s.see ?? "").slice(0, 160)}`).join("\n");
  const vote = (episode.choice?.options ?? []).map((o) => o.word).join(" / ");
  return [
    `You are the sound designer and dialogue editor of "${story.title}", a ${story.genre} picture drama set in ${story.city}, Nigeria, posted on Instagram. Write the 30-second film soundtrack that plays over the cover of Episode ${episode.n}, "${episode.title}". It works like a film trailer: a hook in the first second, the episode's key moments, and the vote question at the end. Most people swipe on within seconds, so the opening must grab.`,
    `THE STORY — ${story.logline}`,
    `THE CAST (use these keys in "who"):\n  narrator = the series narrator\n${cast}`,
    `THE EPISODE'S SLIDES:\n${slides}`,
    `THE VOTE — "${episode.choice?.question ?? ""}" Viewers comment ${vote}.`,
    "RULES — follow every one:\n" +
    "- 3 to 5 spoken lines, at most 28 words in all. Short, strong lines.\n" +
    "- Characters say their own words from the slides (quote or shorten them). The narrator retells the slides' facts in fewer words. Never add new plot, names or facts.\n" +
    "- Line 1 starts between 0.4 and 1.2 seconds.\n" +
    `- The last line is the narrator asking the vote question with both vote words, e.g. "${(episode.choice?.options ?? []).map((o) => o.word[0] + o.word.slice(1).toLowerCase()).join("... or ")}?"\n` +
    "- Timing: each line's window (by minus at) is at least (its words ÷ 1.3) + 0.6 seconds, at most 9; lines never overlap and leave at least 0.3 s between them; everything ends by 29.6.\n" +
    "- style: one sentence directing the performance (emotion, pace, volume, closeness). Never mention an accent. Never whisper: for a secret, ask for \"hushed but clear\" — every word must be heard.\n" +
    "- score: a prompt for Google Lyria. Begin exactly \"Instrumental only, no vocals.\" Describe a cinematic underscore fitting the genre and the city, with one subtle Nigerian instrument used sparingly, \"Total length exactly 30 seconds.\", then timestamped sections from [0:00 - ...] to [... - 0:30]: quiet under every spoken line, one impact at the cliffhanger moment, ending in near silence.\n" +
    "- effects: a prompt for Google Lyria. Begin exactly \"Sound design only. No music, no melody, no instruments, no vocals.\" The scene's ambience for the whole 30 seconds plus 3–6 timestamped sound effects at the story's moments.\n" +
    "- mood: a short phrase for the mood (e.g. \"a dark boardroom thriller at night\").",
    problems?.length ? `YOUR LAST DRAFT BROKE THESE RULES — fix every one:\n- ${problems.join("\n- ")}` : "",
    'Answer with JSON only: {"lines":[{"who":"...","at":0.0,"by":0.0,"text":"...","style":"..."}],"score":"...","effects":"...","mood":"..."}',
  ].filter(Boolean).join("\n\n");
}

/** A deterministic stand-in for tests (no paid call): built from the episode's own words. */
function fakeScript(story, episode) {
  const s = episode.slides ?? [];
  const cut = (t, n) => strip(t).split(/\s+/).slice(0, n).join(" ").replace(/[,;:]$/, "");
  const time = s.find((x) => x.kind === "time" && x.say) ?? s.find((x) => x.say);
  const speaker = s.find((x) => x.who && /“/.test(x.say ?? ""));
  const cliff = s.find((x) => x.kind === "cliff" && x.say);
  const lines = [];
  // One after another: a time like "3:52" is four spoken words, longer than it looks.
  const add = (who, text, planned) => {
    const w = lineWords(text);
    const at = +Math.max(planned, (lines.at(-1)?.by ?? 0) + 0.4).toFixed(1);
    lines.push({ who, at, by: +(at + w / RULES.wordsPerSecond + RULES.slack + 0.2).toFixed(1), text, style: "Low and steady." });
  };
  if (time) add("narrator", cut(time.say, 6), 0.6);
  if (speaker && speaker !== cliff) add(speaker.who, cut(speaker.say, 8), 7);
  if (cliff) add(cliff.who ?? "narrator", cut(cliff.say, 9), 15);
  const [a, b] = (episode.choice?.options ?? []).map((o) => o.word[0] + o.word.slice(1).toLowerCase());
  add("narrator", `${a}... or ${b}?`, 25.5);
  return {
    lines, mood: `a ${story.genre} drama`,
    score: "Instrumental only, no vocals. A test underscore. Total length exactly 30 seconds.\n[0:00 - 0:30] A low drone.",
    effects: "Sound design only. No music, no melody, no instruments, no vocals.\n[0:00 - 0:30] Room tone.",
  };
}

async function draft(story, episode, problems) {
  const r = await fetch(`${API}/models/${WRITER_MODEL}:generateContent`, {
    method: "POST", headers: { "x-goog-api-key": process.env.GEMINI_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt(story, episode, problems) }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.6 } }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${WRITER_MODEL} answered ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  const t = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const v = JSON.parse(t);
  return Array.isArray(v) ? v[0] : v;
}

/**
 * The sound script for one episode, checked. `voices` maps role key → voice id
 * (tools/drama/sound/voices.mjs). Returns the script only when it passes every rule.
 */
export async function writeScript({ story, episode, voices, fake = false, log = console.log }) {
  const cast = story.cast ?? [];
  const missing = ["narrator", ...cast.map((c) => c.key)].filter((k) => !voices?.[k]);
  if (missing.length) return { script: null, problems: [`no voice for: ${missing.join(", ")}`], attempts: 0 };
  let problems = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    let body;
    try {
      body = fake ? fakeScript(story, episode) : await draft(story, episode, problems);
    } catch (e) {
      problems = [`the writer failed: ${String(e.message).slice(0, 200)}`];
      log(`  draft ${attempt}: ${problems[0]}`);
      continue;
    }
    const lines = (body.lines ?? []).map((l) => ({ ...l, text: unquote(l.text), at: Number(l.at), by: Number(l.by) }));
    const script = {
      story: story.slug, episode: episode.n, title: episode.title, length: RULES.length, mood: body.mood,
      voices: Object.fromEntries(Object.entries(voices).map(([k, v]) => [k, { voice: v }])),
      lines, score: body.score, effects: body.effects,
    };
    problems = checkScript(script, { episode, cast });
    log(`  draft ${attempt}: ${problems.length ? `${problems.length} problem(s) — ${problems.join(" | ")}` : "passes every rule"}`);
    if (!problems.length) return { script, problems: [], attempts: attempt };
  }
  return { script: null, problems, attempts: 3 };
}
