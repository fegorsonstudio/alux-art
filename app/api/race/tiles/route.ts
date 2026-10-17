import { NextRequest, NextResponse } from "next/server";
import { getTile } from "@/lib/race/osm";
import { allow } from "@/lib/ar/rate-limit";

/**
 * The streets around a point for the race. Login-free (the race pages are),
 * rate limited per address. Answers at once: the tile, or 202 "pending" while
 * OpenStreetMap is being asked in the background (the page polls), or 503
 * when that failed.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lng = Number(request.nextUrl.searchParams.get("lng"));
  const radius = Number(request.nextUrl.searchParams.get("r") || 2500);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: "Where?" }, { status: 400 });
  }
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!allow(`tiles:${ip}`, 120, 10 * 60_000)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  try {
    const a = await getTile(lat, lng, radius);
    if (a.status === "ready") return NextResponse.json(a.tile, { headers: { "Cache-Control": "public, max-age=3600" } });
    if (a.status === "pending") return NextResponse.json({ pending: true, since: a.startedAt }, { status: 202, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ error: `The streets could not be fetched (${a.error}). Try again in a minute.` }, { status: 503, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[race] tile route failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The streets are not available right now. Try again in a minute." }, { status: 503 });
  }
}
