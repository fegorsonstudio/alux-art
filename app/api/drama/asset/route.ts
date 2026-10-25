import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { r2Upload } from "@/lib/r2";

/**
 * A sponsor's asset for an episode (owner, 2026-10-25): a photo of their place, a music
 * track, a flyer. POST multipart { file, kind } → { bucket, path, type, name }. Signed-in
 * only. Kept in lasting storage from the start (the placement row points at it once paid;
 * an abandoned checkout leaves a small orphan, swept by hand).
 */
export const maxDuration = 120;
const fail = (status: number, error: string) => NextResponse.json({ error }, { status });
const LIMITS: Record<string, { types: RegExp; max: number }> = {
  image: { types: /^image\/(jpeg|png|webp)$/, max: 30 * 1024 * 1024 },
  audio: { types: /^(audio\/(mpeg|mp3|mp4|x-m4a|aac|wav|x-wav|ogg|opus|flac)|video\/mp4)$/, max: 25 * 1024 * 1024 },
  document: { types: /^(application\/pdf|image\/(jpeg|png|webp))$/, max: 20 * 1024 * 1024 },
};

export async function POST(req: NextRequest) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return fail(401, "Sign in first.");
  const form = await req.formData().catch(() => null);
  if (!form) return fail(400, "Send the file as a form.");
  const file = form.get("file");
  const kind = String(form.get("kind") ?? "image");
  const lim = LIMITS[kind] ?? LIMITS.image;
  if (!(file instanceof File)) return fail(400, "Choose a file.");
  if (!lim.types.test(file.type)) return fail(400, kind === "audio" ? "Use an MP3, M4A, WAV or OGG file." : kind === "document" ? "Use a PDF, JPEG, PNG or WebP." : "Use a JPEG, PNG or WebP picture.");
  if (file.size > lim.max) return fail(400, `That file is over ${Math.round(lim.max / 1024 / 1024)} MB.`);
  const ext = (file.name.match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? (kind === "audio" ? "mp3" : kind === "document" ? "pdf" : "jpg")).toLowerCase();
  const safe = file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || kind;
  const path = `drama/brands/uploads/${user.id}/${Date.now().toString(36)}-${safe}.${ext}`;
  await r2Upload("generated-4k", path, Buffer.from(await file.arrayBuffer()), file.type);
  return NextResponse.json({ bucket: "generated-4k", path, type: file.type, name: file.name.slice(0, 120) });
}
