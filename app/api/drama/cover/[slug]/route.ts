import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { renderCover } from "@/lib/drama/cover";
import { badgeFor, storyBySlug } from "@/lib/drama/data";
import sql from "@/lib/db";
import { r2Download } from "@/lib/r2";

/**
 * GET /api/drama/cover/<slug>?w=400  → the story's poster (WebP).
 * Drawn on first request and kept in memory until the story changes, so the
 * shelf costs one drawing per cover, not one per visitor.
 */
export const dynamic = "force-dynamic";

const WIDTHS = [300, 480, 720, 1000];
const cache = new Map<string, Buffer>();

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const story = await storyBySlug(slug);
  if (!story) return new NextResponse("Not found", { status: 404 });
  const asked = parseInt(req.nextUrl.searchParams.get("w") ?? "480", 10);
  const w = WIDTHS.find((x) => x >= asked) ?? 1000;

  const [art] = await sql<{ cover_bucket: string | null; cover_path: string | null }[]>`
    SELECT cover_bucket, cover_path FROM drama_stories WHERE id = ${story.id}`;
  const badge = badgeFor(story);
  const key = `${slug}|${new Date(story.updated_at).getTime()}|${badge}|${art?.cover_path ?? ""}|${w}`;
  let out = cache.get(key);
  if (!out) {
    let artBuf: Buffer | null = null;
    if (art?.cover_bucket && art.cover_path) {
      try { artBuf = (await r2Download(art.cover_bucket, art.cover_path)).buffer; } catch { artBuf = null; }
    }
    const full = await renderCover({ title: story.title, tagline: story.tagline, genre: story.genre, city: story.city, badge, art: artBuf });
    out = await sharp(full).resize(w).webp({ quality: 82 }).toBuffer();
    if (cache.size > 200) cache.clear();
    cache.set(key, out);
  }
  return new NextResponse(new Uint8Array(out), {
    headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=600, stale-while-revalidate=86400" },
  });
}
