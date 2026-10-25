import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sql from "@/lib/db";
import { r2Download, r2Upload } from "@/lib/r2";
import { tellAdmin } from "@/lib/telegram";

/**
 * A cast member's own voice (owner, 2026-10-25: "a way to keep their voices
 * consistent — upload their own voice if they wish; if not, voice design").
 *
 * The member records two clips on their page: the CONSENT line (their name,
 * permission to copy their voice for this story) and a SAMPLE (20–30 s of
 * reading). Both are kept with their character. Then Gemini's voice
 * replication (POST /v1beta/voices, type "replicated", source_audio +
 * consent_audio) makes a stored voice — a `voice_…` id that lasts a year from
 * its last use — and the sound job (scripts/drama-sound.mjs) uses that id for
 * their role instead of the story's designed voice.
 *
 * Audio arrives as whatever the phone recorded (webm/opus, mp4/aac, wav); it is
 * transcoded to 24 kHz mono WAV with ffmpeg before it is sent.
 */

export const VOICE_KINDS = ["sample", "consent"] as const;
export type VoiceKind = (typeof VOICE_KINDS)[number];
export const KEEP_BUCKET = "generated-4k";
export const MAX_AUDIO = 15 * 1024 * 1024;
const API = "https://generativelanguage.googleapis.com/v1beta";
const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] as string);

/** What the member reads: the consent line, and a sample long enough to copy a voice from. */
export function voiceLines(displayName: string, storyTitle: string, roleName: string) {
  return {
    consent: `My name is ${displayName}. I give Alux Art permission to copy my voice and use it for my character, ${roleName}, in the story ${storyTitle}.`,
    sample: [
      `I play ${roleName} in ${storyTitle}. This is how I sound when I speak normally, at my own pace.`,
      "Lagos at seven in the evening: the traffic on Third Mainland Bridge, the light going orange over the lagoon, and everyone pretending they are not in a hurry.",
      "If you ask me a question, I will answer it. If you ask me twice, I will answer it slowly. Ask a third time and we will both know you were not listening.",
      "Read this the way you would say it to a friend across a table — not too loud, not too fast, and let the sentences breathe.",
    ].join(" "),
  };
}

const ext = (type: string) => /webm/.test(type) ? "webm" : /mp4|m4a|aac/.test(type) ? "m4a" : /ogg|opus/.test(type) ? "ogg" : /wav/.test(type) ? "wav" : /mpeg|mp3/.test(type) ? "mp3" : "bin";

/** Keep an uploaded clip with the character. */
export async function keepVoiceClip(castId: string, kind: VoiceKind, bytes: Buffer, contentType: string): Promise<string> {
  const p = `drama/cast/${castId}/voice-${kind}-${Date.now().toString(36)}.${ext(contentType)}`;
  await r2Upload(KEEP_BUCKET, p, bytes, contentType || "application/octet-stream");
  if (kind === "sample") {
    await sql`UPDATE drama_cast SET voice_sample_bucket = ${KEEP_BUCKET}, voice_sample_path = ${p}, voice_id = NULL, voice_meta = NULL, updated_at = now() WHERE id = ${castId}`;
  } else {
    await sql`UPDATE drama_cast SET voice_consent_bucket = ${KEEP_BUCKET}, voice_consent_path = ${p}, voice_id = NULL, voice_meta = NULL, updated_at = now() WHERE id = ${castId}`;
  }
  return p;
}

async function toWav(input: Buffer, name: string, dir: string): Promise<Buffer> {
  const src = path.join(dir, name), out = path.join(dir, `${name}.wav`);
  await writeFile(src, input);
  await new Promise<void>((resolve, reject) => {
    execFile("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", src, "-ac", "1", "-ar", "24000", "-t", "60", out], { timeout: 60_000 }, (err, _o, stderr) => {
      if (err) reject(new Error(`ffmpeg: ${String(stderr || err.message).slice(0, 200)}`)); else resolve();
    });
  });
  return readFile(out);
}

/** Seconds of audio in a WAV made by toWav (24 kHz, mono, 16-bit). */
const wavSeconds = (wav: Buffer) => Math.max(0, wav.length - 44) / (24000 * 2);

/**
 * Make (or remake) the member's replicated voice from their two clips. Returns
 * the voice id, or the reason it could not be made. Never throws past the DB.
 */
export async function replicateVoice(castId: string): Promise<{ ok: true; voiceId: string } | { ok: false; why: string }> {
  const [c] = await sql<{
    id: string; display_name: string; role_key: string; story_id: string;
    voice_sample_bucket: string | null; voice_sample_path: string | null; voice_consent_bucket: string | null; voice_consent_path: string | null;
    voice_id: string | null; title: string; slug: string; content: { cast: { key: string; name: string }[] };
  }[]>`
    SELECT c.id, c.display_name, c.role_key, c.story_id, c.voice_sample_bucket, c.voice_sample_path, c.voice_consent_bucket, c.voice_consent_path, c.voice_id,
           s.title, s.slug, s.content
    FROM drama_cast c JOIN drama_stories s ON s.id = c.story_id WHERE c.id = ${castId}`;
  if (!c) return { ok: false, why: "no such cast member" };
  if (!c.voice_sample_path || !c.voice_consent_path) return { ok: false, why: "both clips are needed first" };
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, why: "GEMINI_API_KEY is not set" };
  const roleName = c.content.cast.find((r) => r.key === c.role_key)?.name ?? c.role_key;
  const dir = await mkdtemp(path.join(tmpdir(), "drama-voice-"));
  try {
    const [sample, consent] = await Promise.all([
      r2Download(c.voice_sample_bucket as string, c.voice_sample_path).then((x) => x.buffer),
      r2Download(c.voice_consent_bucket as string, c.voice_consent_path).then((x) => x.buffer),
    ]);
    const [sampleWav, consentWav] = await Promise.all([toWav(sample, "sample", dir), toWav(consent, "consent", dir)]);
    const secs = wavSeconds(sampleWav);
    if (secs < 8) return fail(c.id, `the sample is too short (${secs.toFixed(0)} s) — read for at least 20 seconds`);
    if (wavSeconds(consentWav) < 2) return fail(c.id, "the consent clip is too short — read the whole sentence");
    const body = {
      store: true,
      voice: {
        model: "gemini-3.8-flash-tts", type: "replicated", display_name: `alux-${c.slug}-${c.role_key}-${c.id.slice(0, 8)}`.slice(0, 60),
        replicated: {
          source_audio: { mime_type: "audio/wav", data: sampleWav.toString("base64") },
          consent_audio: { mime_type: "audio/wav", data: consentWav.toString("base64") },
        },
      },
    };
    const r = await fetch(`${API}/voices`, { method: "POST", headers: { "x-goog-api-key": key, "content-type": "application/json" }, body: JSON.stringify(body) });
    const text = await r.text();
    if (!r.ok) return fail(c.id, `voice replication refused (${r.status}): ${text.replace(/\s+/g, " ").slice(0, 200)}`);
    const j = JSON.parse(text) as { id?: string; expire_time?: string };
    if (!j.id) return fail(c.id, "voice replication returned no id");
    await sql`UPDATE drama_cast SET voice_id = ${j.id}, voice_meta = ${sql.json({ at: new Date().toISOString(), expires: j.expire_time ?? null, sampleSeconds: +secs.toFixed(1) })}, updated_at = now() WHERE id = ${c.id}`;
    await tellAdmin(`🎙 <b>Voice copied</b> — ${esc(c.display_name)} (${esc(roleName)} in ${esc(c.title)}) recorded their voice; their episodes will use it.`).catch(() => false);
    return { ok: true, voiceId: j.id };
  } catch (e) {
    return fail(c.id, (e as Error).message.slice(0, 200));
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function fail(castId: string, why: string): Promise<{ ok: false; why: string }> {
  await sql`UPDATE drama_cast SET voice_meta = ${sql.json({ error: why, at: new Date().toISOString() })}, updated_at = now() WHERE id = ${castId}`.catch(() => {});
  return { ok: false, why };
}

export function replicateVoiceSoon(castId: string): void {
  void replicateVoice(castId).then((r) => console.log(`[drama voice] ${castId}: ${r.ok ? r.voiceId : r.why}`)).catch((e) => console.error(`[drama voice] ${castId} failed:`, (e as Error).message));
}

/** The sweep: members with both clips and no voice yet (and no fresh failure). */
export async function processVoices(): Promise<{ id: string; result: string }[]> {
  const due = await sql<{ id: string }[]>`
    SELECT id FROM drama_cast
    WHERE voice_sample_path IS NOT NULL AND voice_consent_path IS NOT NULL AND voice_id IS NULL
      AND (voice_meta IS NULL OR (voice_meta->>'at')::timestamptz < now() - interval '1 day')
    ORDER BY updated_at LIMIT 3`;
  const out = [];
  for (const d of due) { const r = await replicateVoice(d.id); out.push({ id: d.id, result: r.ok ? "voice" : r.why }); }
  return out;
}
