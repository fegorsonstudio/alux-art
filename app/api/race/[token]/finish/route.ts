import { NextRequest, NextResponse } from "next/server";
import { resolveArCampaign } from "@/lib/ar/campaign";
import { finishRace } from "@/lib/race/bounty";
import { allow } from "@/lib/ar/rate-limit";

/**
 * The finish line. The server decides: the hunt must be running, the time
 * must be possible on these roads, and the next unclaimed prize goes to the
 * first claim that gets the row lock.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = await resolveArCampaign(token);
  if (!c) return NextResponse.json({ error: "This bounty does not exist." }, { status: 404 });
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!allow(`race-finish:${ip}`, 30, 10 * 60_000)) return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  const body = await request.json().catch(() => ({})) as { raceId?: unknown; elapsedMs?: unknown; path?: unknown };
  const raceId = String(body.raceId ?? "");
  if (!/^[0-9a-f-]{36}$/.test(raceId)) return NextResponse.json({ error: "Which hunt?" }, { status: 400 });
  const path = Array.isArray(body.path) ? (body.path as unknown[]).filter((s) => Array.isArray(s) && s.length === 3 && s.every((v) => Number.isFinite(v))) as [number, number, number][] : null;
  const a = await finishRace(c.id, raceId, Number(body.elapsedMs), path);
  if (a.status === "notfound") return NextResponse.json({ error: "This hunt does not exist." }, { status: 404 });
  if (a.status === "refused") return NextResponse.json({ error: a.reason }, { status: 409 });
  return NextResponse.json(a, { headers: { "Cache-Control": "no-store" } });
}
