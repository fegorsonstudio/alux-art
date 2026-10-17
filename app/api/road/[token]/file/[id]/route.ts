import { NextRequest, NextResponse } from "next/server";
import { resolveArCampaign } from "@/lib/ar/campaign";
import { getRoad, roadIdOk, roadVideoUrl } from "@/lib/road/tracks";

/**
 * The road video: a redirect to a one-hour link on R2, where range requests
 * work so the player can seek. (Proxying video through the app would break
 * seeking and tie up the server.)
 */
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const c = await resolveArCampaign(token);
  if (!c || !roadIdOk(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const r = await getRoad(c.id, id);
  const url = r ? await roadVideoUrl(r) : null;
  if (!url) return NextResponse.json({ error: "This road is not ready." }, { status: 404 });
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, max-age=600" } });
}
