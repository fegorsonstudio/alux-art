import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { resolveArCampaign, derivedStatus } from "@/lib/ar/campaign";
import { startRace } from "@/lib/race/bounty";
import { allow } from "@/lib/ar/rate-limit";

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
  const body = await request.json().catch(() => ({})) as { player?: unknown };
  const player = String(body.player ?? "").replace(/[^\p{L}\p{N} _.'-]/gu, "").trim().slice(0, 24);
  const ipHash = crypto.createHash("sha256").update(ip + (process.env.INTERNAL_API_SECRET ?? "")).digest("hex").slice(0, 16);
  try {
    const a = await startRace(c, player, ipHash);
    if (a.status === "pending") return NextResponse.json({ pending: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
    if (a.status === "full") return NextResponse.json({ error: "This bounty has had all the hunts it allows." }, { status: 409 });
    if (a.status === "noroads") return NextResponse.json({ error: "There are no mapped roads around this bounty." }, { status: 409 });
    return NextResponse.json(a, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[race] start failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The streets are not available right now. Try again in a minute." }, { status: 503 });
  }
}
