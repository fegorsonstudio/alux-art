import { NextRequest, NextResponse } from "next/server";
import { resolveArCampaign } from "@/lib/ar/campaign";
import { allow } from "@/lib/ar/rate-limit";
import { savePart, roadIdOk } from "@/lib/road/tracks";

/** One part of a road video (≤ 8 MB, raw body): PUT /api/road/<token>/part?id=<road>&n=<index>. */
export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = await resolveArCampaign(token);
  if (!c) return NextResponse.json({ error: "This bounty does not exist." }, { status: 404 });
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!allow(`road-part:${ip}`, 300, 10 * 60_000)) return NextResponse.json({ error: "Too many uploads from here." }, { status: 429 });
  const id = request.nextUrl.searchParams.get("id");
  const n = Number(request.nextUrl.searchParams.get("n"));
  if (!roadIdOk(id)) return NextResponse.json({ error: "Unknown upload." }, { status: 400 });
  try {
    const data = new Uint8Array(await request.arrayBuffer());
    const a = await savePart(c.id, id, n, data);
    if (!a.ok) return NextResponse.json({ error: a.error }, { status: 400 });
    return NextResponse.json({ ok: true, n }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[road] part failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "That part did not save. Try again." }, { status: 503 });
  }
}
