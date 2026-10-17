import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { resolveArCampaign, derivedStatus } from "@/lib/ar/campaign";
import { startRace } from "@/lib/race/bounty";
import { allow } from "@/lib/ar/rate-limit";
import { roadIdOk } from "@/lib/road/tracks";

/** A new hunt on a bounty: where you are dropped, where the prize is, how far by road. */
export const dynamic = "force-dynamic";

const ipOf = (r: NextRequest) => r.headers.get("cf-connecting-ip") ?? r.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = await resolveArCampaign(token);
  if (!c) return NextResponse.json({ error: "This bounty does not exist." }, { status: 404 });
  const status = derivedStatus(c);
  if (status !== "live") return NextResponse.json({ error: status === "scheduled" ? "This bounty has not started yet." : "This bounty is over." }, { status: 409 });
  const ip = ipOf(request);
  if (!allow(`race-start:${ip}`, 20, 10 * 60_000)) return NextResponse.json({ error: "Too many hunts from here. Try again later." }, { status: 429 });
  const body = await request.json().catch(() => ({})) as { player?: unknown; groupId?: unknown; from?: { lat?: unknown; lng?: unknown }; roadId?: unknown };
  const roadId = roadIdOk(body.roadId) ? body.roadId : undefined;
  const fLat = Number(body.from?.lat), fLng = Number(body.from?.lng);
  const from = Number.isFinite(fLat) && Number.isFinite(fLng) && fLat >= -90 && fLat <= 90 && fLng >= -180 && fLng <= 180 ? { lat: fLat, lng: fLng } : undefined;
  const groupId = /^[0-9a-f-]{36}$/.test(String(body.groupId ?? "")) ? String(body.groupId) : undefined;
  const player = String(body.player ?? "").replace(/[^\p{L}\p{N} _.'-]/gu, "").trim().slice(0, 24);
  const ipHash = crypto.createHash("sha256").update(ip + (process.env.INTERNAL_API_SECRET ?? "")).digest("hex").slice(0, 16);
  try {
    const a = await startRace(c, player, ipHash, groupId, groupId ? undefined : from, groupId ? undefined : roadId);
    if (a.status === "noroad") return NextResponse.json({ error: "That road is not available. Pick another road." }, { status: 409 });
    if (a.status === "pending") return NextResponse.json({ pending: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
    if (a.status === "full") return NextResponse.json({ error: "This bounty has had all the hunts it allows." }, { status: 409 });
    if (a.status === "noroads") return NextResponse.json({ error: "There are no mapped roads around this bounty." }, { status: 409 });
    if (a.status === "nostart") return NextResponse.json({ error: "No mapped road within 250 m of that start, or no road from there to the prize. Pick a spot on a street within 2.5 km of the prize." }, { status: 409 });
    if (a.status === "tooclose") return NextResponse.json({ error: "Start at least 500 m from the prize by road. Pick a spot further away." }, { status: 409 });
    return NextResponse.json(a, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[race] start failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The streets are not available right now. Try again in a minute." }, { status: 503 });
  }
}
