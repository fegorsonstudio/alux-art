import { NextRequest, NextResponse } from "next/server";
import { resolveArCampaign, derivedStatus } from "@/lib/ar/campaign";
import { createGroup } from "@/lib/race/bounty";
import { allow } from "@/lib/ar/rate-limit";
import { roadIdOk } from "@/lib/road/tracks";

/**
 * A shared start for a lobby: one drop point and a start time twelve seconds
 * ahead, made by the server so nobody can pick the shortest street for
 * themselves. The caller tells the lobby, everyone then starts with the group.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = await resolveArCampaign(token);
  if (!c) return NextResponse.json({ error: "This bounty does not exist." }, { status: 404 });
  if (derivedStatus(c) !== "live") return NextResponse.json({ error: "This bounty is not live." }, { status: 409 });
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!allow(`race-group:${ip}`, 10, 10 * 60_000)) return NextResponse.json({ error: "Too many races started from here." }, { status: 429 });
  try {
    const body = await request.json().catch(() => ({})) as { roadId?: unknown };
    const a = await createGroup(c, roadIdOk(body.roadId) ? body.roadId : undefined);
    if (a.status === "noroad") return NextResponse.json({ error: "That road is not available. Pick another road." }, { status: 409 });
    if (a.status === "pending") return NextResponse.json({ pending: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
    if (a.status === "noroads") return NextResponse.json({ error: "There are no mapped roads around this bounty." }, { status: 409 });
    return NextResponse.json(a.group, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[race] group failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The streets are not available right now. Try again in a minute." }, { status: 503 });
  }
}
