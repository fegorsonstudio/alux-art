import { NextRequest, NextResponse } from "next/server";
import { resolveArCampaign } from "@/lib/ar/campaign";
import { bountyCounts, leaderboard } from "@/lib/race/bounty";
import { roadIdOk } from "@/lib/road/tracks";

/** The ten fastest hunts on a bounty, and how many prizes are left. */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = await resolveArCampaign(token);
  if (!c) return NextResponse.json({ error: "This bounty does not exist." }, { status: 404 });
  const road = request.nextUrl.searchParams.get("road");
  const [rows, counts] = await Promise.all([leaderboard(c.id, roadIdOk(road) ? road : null), bountyCounts(c.id)]);
  return NextResponse.json({
    counts,
    top: rows.map((r, i) => ({ place: i + 1, player: r.player || "A hunter", elapsedMs: r.elapsed_ms, won: r.won })),
  }, { headers: { "Cache-Control": "no-store" } });
}
