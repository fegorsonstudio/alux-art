import { NextRequest, NextResponse } from "next/server";
import { loadTile } from "@/lib/race/osm";
import { allow } from "@/lib/ar/rate-limit";

/**
 * The streets around a point for the race. Login-free (the race pages are),
 * rate limited per address, cached in road_tiles after the first fetch.
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
  if (!allow(`tiles:${ip}`, 30, 10 * 60_000)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  try {
    const tile = await loadTile(lat, lng, radius);
    return NextResponse.json(tile, { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch (e) {
    console.error("[race] tile failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The streets are not available right now. Try again in a minute." }, { status: 503 });
  }
}
