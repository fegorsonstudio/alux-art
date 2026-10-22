#!/usr/bin/env node
/**
 * Makes a story's designed (Nigerian) voices with Gemini 3.8 voice design, once.
 *
 *   node --env-file=.env.local tools/drama/sound/design-voices.mjs <story slug>
 *
 * For each role in voices.mjs written as { nigerian: "…", gender } that has no
 * voice yet (or whose description changed): POST /v1beta/voices (type "prompted",
 * language en-NG), keep the sample in R2 (admin/sound-tests/voice-designs/<slug>/),
 * ask gemini-3.1-pro-preview what accent it hears (advice only — the owner's ear
 * decides), and record the id in designed-voices.json. Voices last a year from
 * last use; 200 per project. Standard-voice roles are left alone.
 */
import { readFile, writeFile } from "node:fs/promises";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import VOICES from "./voices.mjs";
import { REGISTRY, registry } from "./cast.mjs";

const KEY = process.env.GEMINI_API_KEY;
const API = "https://generativelanguage.googleapis.com/v1beta";
const slug = process.argv[2];
if (!slug || !VOICES[slug]) { console.error(`usage: design-voices.mjs <slug> (one of ${Object.keys(VOICES).join(", ")})`); process.exit(1); }
const s3 = new S3Client({ region: "auto", endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } });

async function judge(b64) {
  const c = await fetch(`${API}/models/gemini-3.1-pro-preview:generateContent`, { method: "POST",
    headers: { "x-goog-api-key": KEY, "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: "audio/wav", data: b64 } }, { text:
      "You are a dialect coach who knows West African English well. Listen to the speaker only (not the words). Where is this accent from? " +
      "Consider Nigerian English (Yoruba-, Igbo- or Hausa-influenced), Ghanaian, South African, British, American and others. " +
      'Answer as JSON {"accent":"...","is_nigerian_english":"yes|partly|no"}.' }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0 } }) }).then((x) => x.json()).catch(() => ({}));
  try { const v = JSON.parse(c.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? ""); return Array.isArray(v) ? v[0] : v; } catch { return null; }
}

const reg = registry();
let made = 0;
for (const [role, v] of Object.entries(VOICES[slug])) {
  if (typeof v === "string") continue;
  const k = `${slug}/${role}`;
  if (reg[k]?.id && reg[k].description === v.nigerian) { console.log(`${role}: already designed (${reg[k].id})`); continue; }
  const r = await fetch(`${API}/voices`, { method: "POST", headers: { "x-goog-api-key": KEY, "content-type": "application/json" },
    body: JSON.stringify({ store: true, voice: { model: "gemini-3.8-flash-tts", type: "prompted", display_name: `alux-${slug}-${role}`.slice(0, 60),
      gender: v.gender, language_code: "en-NG", prompted: { input: v.nigerian } } }) });
  const t = await r.text();
  if (!r.ok) { console.log(`${role}: REFUSED ${r.status} ${t.slice(0, 200)}`); continue; }
  const j = JSON.parse(t);
  const sample = j.sample_audio?.data;
  let link = null, heard = null;
  if (sample) {
    const key = `admin/sound-tests/voice-designs/${slug}/${role}.wav`;
    await s3.send(new PutObjectCommand({ Bucket: "generated-4k", Key: key, Body: Buffer.from(sample, "base64"), ContentType: "audio/wav" }));
    link = await getSignedUrl(s3, new GetObjectCommand({ Bucket: "generated-4k", Key: key }), { expiresIn: 7 * 24 * 3600 });
    heard = await judge(sample);
  }
  reg[k] = { id: j.id, description: v.nigerian, gender: v.gender, created: new Date().toISOString(), expires: j.expire_time ?? null, accent_check: heard };
  await writeFile(REGISTRY, JSON.stringify(reg, null, 2) + "\n");
  made++;
  console.log(`${role}: ${j.id} — heard ${heard?.accent ?? "?"} (${heard?.is_nigerian_english ?? "?"})`);
  if (link) console.log(`  SAMPLE ${role} ${link}`);
}
console.log(`${made} voice(s) designed for ${slug}`);
