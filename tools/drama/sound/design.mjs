// Voice design for a story's roles, shared by the command line
// (design-voices.mjs) and the sound job (scripts/drama-sound.mjs), which
// designs any missing voice by itself (owner, 2026-10-25: "if not, we'll just
// do voice design for them").
//
//   designMissing(slug, { log }) → [{ role, id, heard }]
//
// A role written in voices.mjs as { nigerian } or { designed } with no voice in
// designed-voices.json (or a changed description) gets POST /v1beta/voices
// (type "prompted"); the sample goes to R2 and an accent check is noted. The
// registry file is written next to this one.
import { writeFile } from "node:fs/promises";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import VOICES from "./voices.mjs";
import { REGISTRY, registry } from "./cast.mjs";

const API = "https://generativelanguage.googleapis.com/v1beta";

async function judge(b64, key) {
  const c = await fetch(`${API}/models/gemini-3.1-pro-preview:generateContent`, { method: "POST",
    headers: { "x-goog-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: "audio/wav", data: b64 } }, { text:
      "You are a dialect coach who knows West African English well. Listen to the speaker only (not the words). Where is this accent from? " +
      "Consider Nigerian English (Yoruba-, Igbo- or Hausa-influenced), Ghanaian, South African, British, American and others. " +
      'Answer as JSON {"accent":"...","is_nigerian_english":"yes|partly|no"}.' }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0 } }) }).then((x) => x.json()).catch(() => ({}));
  try { const v = JSON.parse(c.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? ""); return Array.isArray(v) ? v[0] : v; } catch { return null; }
}

export function missingVoices(slug, spec = VOICES[slug]) {
  if (!spec) return [];
  const reg = registry();
  return Object.entries(spec).filter(([role, v]) => typeof v !== "string" && !(reg[`${slug}/${role}`]?.id && reg[`${slug}/${role}`].description === (v.nigerian ?? v.designed))).map(([role]) => role);
}

export async function designMissing(slug, { log = () => {}, only, spec = VOICES[slug] } = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  if (!spec) throw new Error(`no voices for the story "${slug}"`);
  const s3 = new S3Client({ region: "auto", endpoint: process.env.R2_ENDPOINT,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } });
  const reg = registry();
  const made = [];
  for (const role of missingVoices(slug, spec)) {
    if (only && !only.includes(role)) continue;
    const v = spec[role];
    const description = v.nigerian ?? v.designed;
    const r = await fetch(`${API}/voices`, { method: "POST", headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({ store: true, voice: { model: "gemini-3.8-flash-tts", type: "prompted", display_name: `alux-${slug}-${role}`.slice(0, 60),
        gender: v.gender, language_code: v.nigerian ? "en-NG" : (v.language ?? "en-US"), prompted: { input: description } } }) });
    const t = await r.text();
    if (!r.ok) { log(`${role}: voice design refused ${r.status} ${t.slice(0, 160)}`); continue; }
    const j = JSON.parse(t);
    let heard = null;
    const sample = j.sample_audio?.data;
    if (sample) {
      await s3.send(new PutObjectCommand({ Bucket: "generated-4k", Key: `admin/sound-tests/voice-designs/${slug}/${role}.wav`, Body: Buffer.from(sample, "base64"), ContentType: "audio/wav" })).catch(() => {});
      heard = await judge(sample, key);
    }
    reg[`${slug}/${role}`] = { id: j.id, description, gender: v.gender, created: new Date().toISOString(), expires: j.expire_time ?? null, accent_check: heard };
    await writeFile(REGISTRY, JSON.stringify(reg, null, 2) + "\n");
    made.push({ role, id: j.id, heard });
    log(`${role}: designed ${j.id} — heard ${heard?.accent ?? "?"}`);
  }
  return made;
}
