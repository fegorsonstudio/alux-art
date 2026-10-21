import { NextRequest, NextResponse } from "next/server";
import { isInternalSecret } from "@/lib/internal-auth";
import { storyBySlug } from "@/lib/drama/data";
import { makePoster } from "@/lib/drama/poster";

/**
 * POST ?slug=<story> → make (or remake) that story's movie poster now (lib/drama/poster.ts).
 * Internal secret only: a poster is a paid model call, so it is never public.
 * Posters for paid cast are made by themselves when a lead or main member says
 * "this is me"; this is for stories without paid cast, and for a remake.
 */
export const maxDuration = 240;

export async function POST(request: NextRequest) {
  if (!isInternalSecret(request.headers.get("x-internal-secret"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const story = await storyBySlug(request.nextUrl.searchParams.get("slug") ?? "");
  if (!story) return NextResponse.json({ error: "No such story." }, { status: 404 });
  try {
    return NextResponse.json(await makePoster(story.id));
  } catch (e) {
    return NextResponse.json({ ok: false, why: (e as Error).message.slice(0, 300) }, { status: 500 });
  }
}
