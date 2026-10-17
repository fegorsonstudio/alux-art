import { NextRequest, NextResponse } from "next/server";
import { resolveArCampaign } from "@/lib/ar/campaign";
import { finishUpload, roadIdOk } from "@/lib/road/tracks";

/** The last step of a road upload: how many parts there are and the GPS track. The transcoder takes it from here. */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = await resolveArCampaign(token);
  if (!c) return NextResponse.json({ error: "This bounty does not exist." }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { id?: unknown; parts?: unknown; track?: unknown };
  if (!roadIdOk(body.id)) return NextResponse.json({ error: "Unknown upload." }, { status: 400 });
  try {
    const a = await finishUpload(c.id, body.id, Number(body.parts), body.track);
    if (!a.ok) return NextResponse.json({ error: a.error }, { status: 400 });
    return NextResponse.json({ ok: true, id: body.id }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[road] done failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The upload could not be closed. Try again." }, { status: 503 });
  }
}
