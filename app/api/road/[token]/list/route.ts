import { NextRequest, NextResponse } from "next/server";
import { resolveArCampaign } from "@/lib/ar/campaign";
import { listRoads, pendingRoads } from "@/lib/road/tracks";

/** The roads ready to race on this bounty (newest first) and how many are still being prepared. */
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = await resolveArCampaign(token);
  if (!c) return NextResponse.json({ error: "This bounty does not exist." }, { status: 404 });
  const [roads, pending] = await Promise.all([listRoads(c.id, token), pendingRoads(c.id)]);
  return NextResponse.json({ roads, pending }, { headers: { "Cache-Control": "no-store" } });
}
