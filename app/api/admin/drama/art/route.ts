import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { requireAdmin } from "@/lib/carousel/posts";
import { r2Upload } from "@/lib/r2";
import { storyBySlug } from "@/lib/drama/data";

/**
 * A picture for one slide of an episode (/admin/drama): an Unreal render or
 * any other image. POST multipart { slug, n, slide, captionAt, file } adds or
 * replaces it; PATCH { slug, n, slide, captionAt } moves the caption; DELETE
 * { slug, n, slide } takes it off. Pictures change nothing already approved —
 * approving again freezes the new set.
 *
 * Files are never deleted here: an approved or posted episode may still point
 * at an earlier one.
 */
export const maxDuration = 120;
const fail = (status: number, error: string) => NextResponse.json({ error }, { status });
const MAX = 30 * 1024 * 1024;

async function target(slug: unknown, n: unknown, slide: unknown) {
  const story = await storyBySlug(String(slug ?? ""));
  const ep = Number(n), sl = Number(slide);
  if (!story) return null;
  if (!(story.content.episodes ?? []).some((e) => e.n === ep)) return null;
  if (!Number.isInteger(sl) || sl < 1 || sl > 8) return null;
  return { story, ep, sl };
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return fail(403, "Forbidden");
  const form = await req.formData().catch(() => null);
  if (!form) return fail(400, "Send the picture as a form.");
  const t = await target(form.get("slug"), form.get("n"), form.get("slide"));
  if (!t) return fail(400, "No such slide.");
  const file = form.get("file");
  if (!(file instanceof File)) return fail(400, "Choose a picture.");
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return fail(400, "Use a JPEG, PNG or WebP picture.");
  if (file.size > MAX) return fail(400, "That picture is over 30 MB.");
  const captionAt = form.get("captionAt") === "top" ? "top" : "bottom";
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `drama/art/${t.story.slug}/ep${t.ep}/${String(t.sl).padStart(2, "0")}-${Date.now()}.${ext}`;
  await r2Upload("generated-4k", path, Buffer.from(await file.arrayBuffer()), file.type);
  await sql`
    INSERT INTO drama_art (story_id, episode_n, slide, bucket, path, source, caption_at)
    VALUES (${t.story.id}, ${t.ep}, ${t.sl}, 'generated-4k', ${path}, ${form.get("source") === "unreal" ? "unreal" : "upload"}, ${captionAt})
    ON CONFLICT (story_id, episode_n, slide) DO UPDATE SET bucket = EXCLUDED.bucket, path = EXCLUDED.path,
      source = EXCLUDED.source, caption_at = EXCLUDED.caption_at, updated_at = now()`;
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin())) return fail(403, "Forbidden");
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const t = await target(b.slug, b.n, b.slide);
  if (!t) return fail(400, "No such slide.");
  const rows = await sql`UPDATE drama_art SET caption_at = ${b.captionAt === "top" ? "top" : "bottom"}, updated_at = now()
                         WHERE story_id = ${t.story.id} AND episode_n = ${t.ep} AND slide = ${t.sl} RETURNING id`;
  return rows.length ? NextResponse.json({ ok: true }) : fail(404, "That slide has no picture.");
}

export async function DELETE(req: NextRequest) {
  if (!(await requireAdmin())) return fail(403, "Forbidden");
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const t = await target(b.slug, b.n, b.slide);
  if (!t) return fail(400, "No such slide.");
  await sql`DELETE FROM drama_art WHERE story_id = ${t.story.id} AND episode_n = ${t.ep} AND slide = ${t.sl}`;
  return NextResponse.json({ ok: true });
}
