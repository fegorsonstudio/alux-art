import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/carousel/posts";
import { storyBySlug } from "@/lib/drama/data";
import { makeEpisodePictures, pictureRuns } from "@/lib/drama/pictures";

/**
 * AI pictures for an episode's slides (/admin/drama → Pictures → "Make with AI").
 * POST { slug, n, slides?, force? } runs the picture engine now (paid: about
 * $0.13 a picture incl. the check; the house sheets and the location once per
 * story) and answers with what was made. GET ?slug=&n= lists the tries so far.
 */
export const maxDuration = 300;
const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return fail(403, "Forbidden");
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const story = await storyBySlug(String(b.slug ?? ""));
  const n = Number(b.n);
  if (!story || !Number.isInteger(n) || n < 1) return fail(400, "No such episode.");
  const slides = Array.isArray(b.slides) ? b.slides.map(Number).filter((x) => Number.isInteger(x)) : undefined;
  try {
    const out = await makeEpisodePictures(story.id, n, { slides, force: b.force === true });
    return NextResponse.json(out);
  } catch (e) {
    return fail(400, (e as Error).message.slice(0, 300));
  }
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return fail(403, "Forbidden");
  const story = await storyBySlug(req.nextUrl.searchParams.get("slug") ?? "");
  const n = Number(req.nextUrl.searchParams.get("n"));
  if (!story || !Number.isInteger(n)) return fail(400, "No such episode.");
  return NextResponse.json({ runs: await pictureRuns(story.id, n) });
}
