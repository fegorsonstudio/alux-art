import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { requireAdmin, cleanId, loadPost, readiness, isLive, MAX_SLIDES } from "@/lib/carousel/posts";

/**
 * The owner's word that this post is right, slide by slide.
 *
 * Only the version the owner just previewed can be approved — if anything on
 * a slide changed since, the preview they read is out of date and this says
 * so. Any later change to the words or pictures puts the post back to draft
 * (see the post and upload routes), and only an approved post can be
 * scheduled.
 */

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return fail(403, "Forbidden");
  const id = cleanId((await params).id);
  const { version } = ((await request.json().catch(() => ({}))) ?? {}) as { version?: string };

  const row = await loadPost(id);
  if (!row) return fail(404, "No such post.");
  if (row.status === "scheduled") return NextResponse.json({ ok: true, status: "scheduled" });
  if (await isLive(id)) return fail(409, "This post is already on Instagram.");

  const ready = readiness(row);
  if (ready === "needs_photos") return fail(400, "Add the before and after photos first.");
  if (ready === "needs_pictures") return fail(400, "Add both story pictures first.");

  if (!version || new Date(version).getTime() !== new Date(row.updated_at).getTime()) {
    return fail(409, "The post has changed since that preview. Press Preview again, read every slide, then approve.");
  }

  // The same count the renderer produces: the two photographs, every card
  // with a headline, and each story picture.
  const cards = (row.cards ?? []).filter((c) => (c.headline ?? "").trim()).length;
  const pictures = (row.storyboard?.scenes ?? []).filter((_s, i) => row.scene_paths?.[i]).length;
  const slides = 2 + cards + pictures;
  if (slides > MAX_SLIDES) return fail(400, `That is ${slides} slides; Instagram stops at ${MAX_SLIDES}. Remove a card.`);

  const [saved] = await sql`
    UPDATE carousel_posts SET status = 'approved', approved_at = NOW(), slide_count = ${slides}
    WHERE local_id = ${id}
      -- To the millisecond: the database keeps microseconds, a JavaScript
      -- date only milliseconds, so an exact match would never succeed.
      AND date_trunc('milliseconds', updated_at) = ${row.updated_at}
    RETURNING local_id`;
  if (!saved) return fail(409, "The post changed while you were approving it. Preview it again.");
  return NextResponse.json({ ok: true, status: "approved", slides });
}
