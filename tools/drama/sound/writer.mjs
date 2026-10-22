/**
 * Writes an episode's sound script in the owner's house style and checks it
 * against hard rules before a single sound is made.
 *
 * The style (owner, 2026-10-22, from their own micro-drama prompts): a RECAP
 * NARRATOR carries the story — extremely fast, short declarative sentences, one
 * fact each, tell don't show, dramatic labels instead of names ("the quiet finance
 * director", "the smiling CEO"), no dialogue in the narration, a twist, the
 * cliffhanger, then the vote. One or two characters cut in with their sharpest
 * line, like a trailer's dialogue stab. "Quickly understand, digest, enjoy, get
 * addicted." The sound must be cinematic: every beat carries its own delivery.
 *
 *   writeScript({ story, episode, voices, fake }) → { script, problems, attempts }
 *
 * Gemini drafts it; checkScript() is the referee. A draft that breaks a rule is
 * sent back with the list of what it broke, at most three times; after that the
 * episode posts silent. Timing is NOT written here: the engine measures the real
 * performances and builds the 30-second timeline from them.
 */
import { words, spoken, TAGS } from "./engine.mjs";

const API = "https://generativelanguage.googleapis.com/v1beta";
const WRITER_MODEL = process.env.SOUND_WRITER_MODEL || "gemini-3.1-pro-preview";
export const RULES = {
  length: 30,
  minWords: 40, maxWords: 60,          // all spoken words; a recap narrator runs ~2.3 words a second, and the sting needs the last 3 s
  minNarration: 6, maxNarration: 12,   // narrator beats
  maxSentenceWords: 12,
  hookWords: 10,
  minPunches: 1, maxPunches: 2, punchWords: 10,
  askWords: 14,
  maxNamesInNarration: 2,              // labels, not names
  narrationFromEpisode: 0.5,           // share of the narration's content words that come from the episode
  sentenceFromEpisode: 0.25,
  punchFromEpisode: 0.75,
};
// Capitals that are names of things, not stress marks.
const ACRONYMS = new Set(["CEO", "CFO", "COO", "MD", "CCTV", "DNA", "ATM", "GSM", "SMS", "ID", "OK", "TV", "VIP", "BRT", "POS", "NEPA", "EFCC", "UK", "USA"]);
const SMALL = new Set("a an the and or but of to in on at is are was were be it its his her their them they he she you your i me my we our this that these those for with from by as not no so do does did has have had will can just now then there here what who".split(" "));

// Quote marks off a spoken line (the voice does not read them).
const unquote = (s) => String(s ?? "").replace(/[“”"]/g, "").trim();
// A slide's "Name: “words”" → the words. Only a plain one- or two-word name before
// the colon counts, so "Marina. 9:52 p.m." keeps its time.
const strip = (s) => unquote(String(s ?? "").replace(/^\s*[A-Z][a-z]+(?: [A-Z][a-z]+)?(?:, to [A-Z][a-z]+)?:\s+/, ""));
const count = (s) => words(spoken(s)).length;

// Titles and role words in a name are not the name ("Madam Lolo", "Obinna the barman").
const TITLES = new Set(["chief", "mrs", "mr", "miss", "madam", "inspector", "director", "hajiya", "alhaji", "dr", "oga", "mama", "papa", "aunty", "uncle", "sir"]);
/** The words of a cast member's name that would identify them if the narrator said them. */
function nameWords(c) {
  const role = new Set(words(c.role ?? ""));
  return words(c.name ?? "").filter((w) => w.length > 2 && !SMALL.has(w) && !TITLES.has(w) && !role.has(w));
}

/** Everything the episode and its cast give the writer to draw on, as words. */
function allowedWords(story, episode) {
  const all = new Set();
  const add = (t) => { for (const w of words(t ?? "")) all.add(w); };
  for (const sl of episode.slides ?? []) { add(sl.say); add(sl.scene); }
  add(episode.title);
  add(episode.choice?.question);
  for (const o of episode.choice?.options ?? []) { add(o.word); add(o.label); }
  for (const c of story.cast ?? []) { add(c.name); add(c.role); }
  add(story.city);
  return all;
}

/** The referee. Returns every rule the script breaks (empty = good). */
export function checkScript(S, { episode, cast, story = {} }) {
  const p = [];
  const beats = Array.isArray(S.beats) ? S.beats : [];
  const known = new Set(["narrator", ...cast.map((c) => c.key)]);
  const vote = (episode.choice?.options ?? []).map((o) => String(o.word).toLowerCase());
  const allowed = allowedWords({ ...story, cast }, episode);
  const names = new Set(cast.flatMap(nameWords));
  const narr = beats.filter((b) => b.who === "narrator");
  const punches = beats.filter((b) => b.who !== "narrator");
  let total = 0, nameHits = 0, fromEp = 0, contentAll = 0;

  if (narr.length < RULES.minNarration || narr.length > RULES.maxNarration) p.push(`the narrator needs ${RULES.minNarration}–${RULES.maxNarration} sentences, not ${narr.length}`);
  if (punches.length < RULES.minPunches || punches.length > RULES.maxPunches) p.push(`${RULES.minPunches}–${RULES.maxPunches} character lines are needed, not ${punches.length}`);
  beats.forEach((b, i) => {
    const n = `beat ${i + 1}`;
    if (!known.has(b.who)) p.push(`${n}: "${b.who}" is not narrator or a cast key (${[...known].join(", ")})`);
    if (typeof b.text !== "string" || !spoken(b.text).trim() || b.text.length > 140) { p.push(`${n}: text must be 1–140 characters`); return; }
    const w = count(b.text);
    total += w;
    const style = String(b.style ?? "");
    if (style.length > 60) p.push(`${n}: style must be a few words (at most 60 characters)`);
    if (/accent/i.test(style)) p.push(`${n}: style must not ask for an accent`);
    // Whispers were half-understood in both real tests: secrets are "hushed but clear".
    if (/whisper/i.test(style)) p.push(`${n}: no whispering — use "hushed but clear" so every word is heard`);
    const tags = b.text.match(/<[^>]+>/g) ?? [];
    for (const t of tags) if (!TAGS.includes(t)) p.push(`${n}: ${t} is not an allowed mark (${TAGS.join(" ")})`);
    if (tags.length > 1) p.push(`${n}: at most one mark like <gasp> per beat`);
    const caps = spoken(b.text).split(/\s+/).map((x) => x.replace(/[^A-Za-z]/g, ""))
      .filter((x) => /^[A-Z]{2,}$/.test(x) && !ACRONYMS.has(x) && !vote.includes(x.toLowerCase()));
    if (caps.length > 1) p.push(`${n}: at most one word in CAPITALS for stress`);
    const ws = words(spoken(b.text)).filter((x) => !SMALL.has(x));
    if (b.who === "narrator") {
      if (/[“”"]/.test(b.text)) p.push(`${n}: the narrator does not quote dialogue — retell it`);
      if (w > RULES.maxSentenceWords) p.push(`${n}: ${w} words — a narrator sentence has at most ${RULES.maxSentenceWords}`);
      nameHits += ws.filter((x) => names.has(x)).length;
      const isLast = i === beats.length - 1;
      if (!isLast && ws.length) {
        const hit = ws.filter((x) => allowed.has(x)).length;
        fromEp += hit; contentAll += ws.length;
        if (ws.length >= 3 && hit / ws.length < RULES.sentenceFromEpisode) p.push(`${n}: almost nothing in it comes from the episode — no new plot`);
      }
    } else {
      if (w > RULES.punchWords) p.push(`${n}: a character line has at most ${RULES.punchWords} words`);
      if (ws.length) {
        const hit = ws.filter((x) => allowed.has(x)).length / ws.length;
        if (hit < RULES.punchFromEpisode) p.push(`${n}: ${Math.round(hit * 100)}% of its words come from the slides (needs ${Math.round(RULES.punchFromEpisode * 100)}%) — characters say their own words`);
      }
    }
  });
  if (total < RULES.minWords || total > RULES.maxWords) p.push(`${total} spoken words in all (needs ${RULES.minWords}–${RULES.maxWords})`);
  if (contentAll && fromEp / contentAll < RULES.narrationFromEpisode) p.push(`only ${Math.round((fromEp / contentAll) * 100)}% of the narration comes from the episode (needs ${Math.round(RULES.narrationFromEpisode * 100)}%) — retell, do not invent`);
  if (nameHits > RULES.maxNamesInNarration) p.push(`the narrator says names ${nameHits} times — use labels ("the finance director"), at most ${RULES.maxNamesInNarration} names`);
  const first = beats[0], last = beats[beats.length - 1];
  if (first && (first.who !== "narrator" || count(first.text) > RULES.hookWords)) p.push(`beat 1 must be the narrator's hook, at most ${RULES.hookWords} words`);
  if (last) {
    if (last.who !== "narrator") p.push("the last beat must be the narrator asking the vote");
    const lw = words(spoken(last.text));
    for (const v of vote) if (!lw.includes(v)) p.push(`the last beat must say the vote word "${v.toUpperCase()}"`);
    if (count(last.text) > RULES.askWords) p.push(`the last beat has at most ${RULES.askWords} words`);
  }
  const tw = Number(S.twist), cl = Number(S.cliff);
  if (!Number.isInteger(tw) || !Number.isInteger(cl)) p.push("twist and cliff must be beat numbers");
  else {
    if (tw < 3 || tw >= beats.length) p.push("twist must point at a beat after the opening (beat 3 or later)");
    if (cl <= tw || cl >= beats.length) p.push("cliff must come after the twist and before the last beat");
  }
  if (typeof S.mood !== "string" || !S.mood.trim() || S.mood.length > 120) p.push("mood: one short phrase is needed");
  if (typeof S.score_style !== "string" || S.score_style.length < 20 || S.score_style.length > 320) p.push("score_style: one or two sentences (20–320 characters)");
  if (/\b(vocals?|sings?|singing|singer|choir|lyrics?|song)\b/i.test(String(S.score_style ?? "").replace(/no vocals/gi, ""))) p.push("score_style: instrumental only — no singing or choir");
  if (typeof S.scene_sound !== "string" || S.scene_sound.length < 10 || S.scene_sound.length > 220) p.push("scene_sound: one sentence of ambience (10–220 characters)");
  const moments = Array.isArray(S.moments) ? S.moments : [];
  if (moments.length < 2 || moments.length > 4) p.push("moments: 2 to 4 sound effects are needed");
  for (const m of moments) {
    if (!Number.isInteger(Number(m.beat)) || m.beat < 1 || m.beat > beats.length) p.push(`moments: beat ${m.beat} does not exist`);
    if (typeof m.sound !== "string" || !m.sound.trim() || m.sound.length > 90) p.push("moments: each sound is a short phrase");
    if (/\b(music|melody|vocals?|sings?|singing|song)\b/i.test(m.sound ?? "")) p.push("moments: sound effects only, no music");
  }
  return p;
}

function prompt(story, episode, problems) {
  const cast = (story.cast ?? []).map((c) => `  ${c.key} = ${c.name}, ${c.role}`).join("\n");
  const slides = (episode.slides ?? []).map((s, i) => `  slide ${i + 1} [${s.kind}${s.who ? `, ${s.who}` : ""}]: ${s.say || "(no words)"}${s.scene ? ` — scene: ${s.scene}` : ""}`).join("\n");
  const opts = episode.choice?.options ?? [];
  const vote = opts.map((o) => o.word).join(" / ");
  return [
    `You are the head writer and voice director of "${story.title}", a ${story.genre} picture drama set in ${story.city}, Nigeria, posted on Instagram. Write the 30-second soundtrack that plays over the cover of Episode ${episode.n}, "${episode.title}". Think of a premium film trailer told by a viral drama-recap narrator: people must understand it in one listen, feel it, and need to know what happens next. Most people swipe on within two seconds, so the first sentence must grab.`,
    `THE STORY — ${story.logline}`,
    `THE CAST (use these keys in "who"):\n  narrator = the series narrator\n${cast}`,
    `THE EPISODE'S SLIDES (everything you may say comes from here):\n${slides}`,
    `THE VOTE — "${episode.choice?.question ?? ""}" Viewers comment ${vote}.`,
    "THE HOUSE STYLE — the narrator carries the story:\n" +
    "- Extremely fast-paced: short, direct, declarative sentences. One fact per sentence. At most 12 words a sentence; most are 4–8.\n" +
    "- Expository: state every fact plainly. Tell, don't show. No flowery language, no metaphors.\n" +
    "- Third person. Dramatic LABELS instead of names: \"the quiet finance director\", \"the smiling CEO\", \"the frightened assistant\", \"the old chairman\". At most two names in the whole narration.\n" +
    "- No dialogue in the narration: the narrator never quotes anyone.\n" +
    "- Example of the voice: The CEO summoned all 600 girls. He intended to choose one to marry. The girls racked their brains to dress up. However, the CEO didn't look at their faces. He only kept shaking their hands…\n" +
    "- Only retell what the slides say happens. Never add plot, names, places or facts.",
    "THE SHAPE (6–12 narrator sentences, 1–2 character lines, 46–56 spoken words in all — count them):\n" +
    "- Beat 1 is the narrator's hook: the most shocking fact of the episode, stated flat, at most 9 words.\n" +
    "- 1 or 2 characters cut in with their own sharpest line from the slides (quote or shorten it, at most 10 words) — a dialogue stab, like a trailer.\n" +
    "- \"twist\": the number of the beat where the episode turns (beat 3 or later). The music drops out just before it.\n" +
    "- \"cliff\": the number of the beat that is the cliffhanger (after the twist). A riser leads into it and a hit lands after it.\n" +
    `- The last beat is the narrator: a short question, then the vote, e.g. "What does she do? Comment ${opts.map((o) => o.word).join("… or ")}." (at most 14 words).`,
    "THE PERFORMANCE (this is what makes it cinematic):\n" +
    "- \"style\" on a beat: 2–6 words of delivery, only where it should change — e.g. \"cold, clipped\", \"rising disbelief\", \"quiet menace\", \"urgent, faster\", \"stunned, slow\", \"hushed but clear\". Leave it \"\" when the narrator just drives on.\n" +
    `- You may put ONE of these marks in a beat where a breath or a beat of silence makes it land: ${TAGS.join(" ")}.\n` +
    "- You may put ONE word per beat in CAPITALS where the stress must fall (e.g. \"The safe is EMPTY.\").\n" +
    "- Use punctuation for rhythm: full stops for punches, an ellipsis (…) for suspense, a dash for a cut-off.\n" +
    "- Never whisper. Never ask for an accent.",
    "THE SOUND:\n" +
    "- \"score_style\": one or two sentences for the composer: the instruments and feel of a premium trailer underscore for this genre and city, with one subtle Nigerian instrument used sparingly. Instrumental only.\n" +
    "- \"scene_sound\": one sentence of the scene's ambience (the room, the weather, the city at that hour).\n" +
    "- \"moments\": 2–4 sound effects tied to beats, e.g. {\"beat\": 6, \"sound\": \"a phone buzzes once on a glass table\"}.\n" +
    "- \"mood\": a short phrase (e.g. \"a dark boardroom thriller at night\").",
    problems?.length ? `YOUR LAST DRAFT BROKE THESE RULES — fix every one:\n- ${problems.join("\n- ")}` : "",
    'Answer with JSON only: {"beats":[{"who":"narrator","text":"...","style":""}],"twist":0,"cliff":0,"mood":"...","score_style":"...","scene_sound":"...","moments":[{"beat":0,"sound":"..."}]}',
  ].filter(Boolean).join("\n\n");
}

/** A deterministic stand-in for tests (no paid call): built from the episode's own words. */
function fakeScript(story, episode) {
  const s = episode.slides ?? [];
  // Names become labels ("the finance director"), as the house style asks.
  const label = (t) => (story.cast ?? []).reduce((acc, c) => {
    const role = `the ${String(c.role ?? "stranger").toLowerCase().replace(/^the /, "")}`;
    return nameWords(c).reduce((x, n) => x.replace(new RegExp(`\\b${n}('s)?\\b`, "gi"), (_, poss) => `${role}${poss ?? ""}`), acc);
  }, t).replace(/^the /, "The ");
  const sentences = [];
  for (const sl of s) {
    if (!sl.say || sl.kind === "choice" || sl.kind === "cover") continue;
    for (const part of strip(sl.say).split(/(?<=[.!?])\s+/)) {
      const t = label(part.replace(/[“”"]/g, "")).split(/\s+/).slice(0, 7).join(" ").replace(/[,;:]$/, "");
      if (t && words(t).length >= 2) sentences.push(/[.!?]$/.test(t) ? t : `${t}.`);
    }
  }
  const [a, b] = (episode.choice?.options ?? []).map((o) => o.word);
  const ask = `What happens next? Comment ${a}… or ${b}.`;
  const speaker = s.find((x) => x.who && /“/.test(x.say ?? "")) ?? s.find((x) => x.who && x.say) ?? s.find((x) => x.say && x.kind !== "cover");
  const punchText = strip(speaker?.say ?? episode.title).replace(/[“”"]/g, "").split(/\s+/).slice(0, 7).join(" ");
  const punchWho = speaker?.who ?? story.cast?.[0]?.key ?? "narrator";
  const narr = sentences.slice(0, 9);
  while (narr.length < 6) narr.push(narr.length % 2 ? "The room goes quiet." : "Nobody moves.");
  // Inside the word limits: drop middle sentences while too long, add short ones while too short.
  const total = () => narr.reduce((n, t) => n + count(t), 0) + count(punchText) + count(ask);
  while (total() > RULES.maxWords - 2 && narr.length > 6) narr.splice(Math.floor(narr.length / 2), 1);
  while (total() > RULES.maxWords - 2) { const i = narr.reduce((m, t, j) => (count(t) > count(narr[m]) ? j : m), 1); narr[i] = narr[i].split(/\s+/).slice(0, 4).join(" ").replace(/[,;:.]?$/, "."); }
  while (total() < RULES.minWords + 2 && narr.length < 11) narr.splice(narr.length - 1, 0, narr.length % 2 ? "The room goes quiet." : "Nobody moves.");
  const beats = [
    { who: "narrator", text: narr[0], style: "" },
    { who: "narrator", text: narr[1], style: "" },
    { who: punchWho, text: punchText, style: "cold, clipped" },
    ...narr.slice(2).map((t) => ({ who: "narrator", text: t, style: "" })),
  ];
  beats.push({ who: "narrator", text: ask, style: "" });
  return {
    beats, twist: 4, cliff: beats.length - 2, mood: `a ${story.genre} drama`,
    score_style: "A low, tense trailer underscore with a soft pulse and one talking drum used sparingly.",
    scene_sound: "A quiet room at night, distant city traffic.",
    moments: [{ beat: 3, sound: "a door closes" }, { beat: beats.length - 1, sound: "a phone buzzes once" }],
  };
}

async function draft(story, episode, problems) {
  const r = await fetch(`${API}/models/${WRITER_MODEL}:generateContent`, {
    method: "POST", headers: { "x-goog-api-key": process.env.GEMINI_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt(story, episode, problems) }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.7 } }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${WRITER_MODEL} answered ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  const t = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const v = JSON.parse(t);
  return Array.isArray(v) ? v[0] : v;
}

/** Turns a draft (beats numbered from 1 by the writer) into the engine's script. */
export function toScript(body, { story, episode, voices }) {
  const beats = (body.beats ?? []).map((b) => ({ who: b.who, text: b.who === "narrator" ? String(b.text ?? "").trim() : unquote(b.text), style: String(b.style ?? "").trim() }));
  return {
    story: story.slug, episode: episode.n, title: episode.title, length: RULES.length, mood: body.mood,
    voices: Object.fromEntries(Object.entries(voices).map(([k, v]) => [k, { voice: v }])),
    beats, twist: Number(body.twist), cliff: Number(body.cliff),
    score_style: body.score_style, scene_sound: body.scene_sound,
    moments: (body.moments ?? []).map((m) => ({ beat: Number(m.beat), sound: String(m.sound ?? "") })),
  };
}

/**
 * The sound script for one episode, checked. `voices` maps role key → voice id
 * (tools/drama/sound/cast.mjs). Returns the script only when it passes every rule.
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
    const script = toScript(body, { story, episode, voices });
    problems = checkScript(script, { episode, cast, story });
    log(`  draft ${attempt}: ${problems.length ? `${problems.length} problem(s) — ${problems.join(" | ")}` : "passes every rule"}`);
    if (!problems.length) return { script, problems: [], attempts: attempt };
  }
  return { script: null, problems, attempts: 3 };
}
