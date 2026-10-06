import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, cleanId, loadPost, slidesFor, previewOf, MAX_SLIDES } from "@/lib/carousel/posts";

/**
 * Every slide of the saved post, drawn exactly as it would be posted, shrunk
 * for the page. The version comes back with it: Approve accepts only the
 * version the owner has just looked at.
 */

export const maxDuration = 120;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = cleanId((await params).id);
  const row = await loadPost(id);
  if (!row) return NextResponse.json({ error: "No such post." }, { status: 404 });

  let slides: Buffer[];
  try {
    slides = await slidesFor(row);
  } catch (e) {
    return NextResponse.json({ error: `Could not draw the slides: ${(e as Error).message}`.slice(0, 200) }, { status: 500 });
  }
  if (!slides.length) return NextResponse.json({ error: "Nothing to show yet — add the photos or a card." }, { status: 400 });

  return NextResponse.json({
    slides: await Promise.all(slides.map(previewOf)),
    count: slides.length,
    tooMany: slides.length > MAX_SLIDES,
    version: row.updated_at,
  });
}
