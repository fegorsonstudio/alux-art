import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createClient } from "@/lib/supabase-server";
import { isAdminEmail } from "@/lib/auth";
import { keepVoiceClip, replicateVoiceSoon, MAX_AUDIO, VOICE_KINDS, type VoiceKind } from "@/lib/drama/voice";

/**
 * A cast member's voice clips: POST multipart { castId, kind: sample|consent, file }.
 * Only the member (or an admin) can send them. Once both clips are there, the
 * voice is copied in the background (lib/drama/voice.ts).
 */
export const maxDuration = 60;
const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return fail(401, "Sign in first.");
  const form = await req.formData().catch(() => null);
  if (!form) return fail(400, "Send the clip as a form.");
  const castId = String(form.get("castId") ?? "");
  const kind = String(form.get("kind") ?? "") as VoiceKind;
  if (!/^[0-9a-f-]{36}$/i.test(castId) || !VOICE_KINDS.includes(kind)) return fail(400, "No such clip.");
  const [c] = await sql<{ user_id: string | null; status: string }[]>`SELECT user_id, status FROM drama_cast WHERE id = ${castId}`;
  if (!c || (!isAdminEmail(user.email) && c.user_id !== user.id)) return fail(403, "Not yours.");
  if (c.status === "pending_payment" || c.status === "rejected" || c.status === "withdrawn") return fail(400, "This role is not active.");
  const file = form.get("file");
  if (!(file instanceof File)) return fail(400, "Record the clip first.");
  if (!/^audio\/|^video\/(webm|mp4)/.test(file.type)) return fail(400, "That is not an audio recording.");
  if (file.size < 2000) return fail(400, "The recording is empty. Try again.");
  if (file.size > MAX_AUDIO) return fail(400, "The recording is too large. Keep it under a minute.");
  await keepVoiceClip(castId, kind, Buffer.from(await file.arrayBuffer()), file.type);
  const [after] = await sql<{ voice_sample_path: string | null; voice_consent_path: string | null }[]>`SELECT voice_sample_path, voice_consent_path FROM drama_cast WHERE id = ${castId}`;
  const both = !!(after?.voice_sample_path && after?.voice_consent_path);
  if (both) replicateVoiceSoon(castId);
  return NextResponse.json({ ok: true, both });
}
