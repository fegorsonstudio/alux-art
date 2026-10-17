import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { resolveArCampaign, derivedStatus } from "@/lib/ar/campaign";
import { allow } from "@/lib/ar/rate-limit";
import { createRoad, mimeOk, MAX_BYTES, PART_BYTES } from "@/lib/road/tracks";

/** Starts a road upload: a row to attach the parts to. Login-free (the race pages are), rate limited. */
export const dynamic = "force-dynamic";

const ipOf = (r: NextRequest) => r.headers.get("cf-connecting-ip") ?? r.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = await resolveArCampaign(token);
  if (!c) return NextResponse.json({ error: "This bounty does not exist." }, { status: 404 });
  if (derivedStatus(c) !== "live") return NextResponse.json({ error: "This bounty is not live." }, { status: 409 });
  const ip = ipOf(request);
  if (!allow(`road-create:${ip}`, 6, 10 * 60_000)) return NextResponse.json({ error: "Too many roads from here. Try again later." }, { status: 429 });
  const body = await request.json().catch(() => ({})) as { name?: unknown; recorder?: unknown; mime?: unknown; bytes?: unknown };
  const name = String(body.name ?? "").replace(/[^\p{L}\p{N} _.,'()&-]/gu, "").trim().slice(0, 60);
  const recorder = String(body.recorder ?? "").replace(/[^\p{L}\p{N} _.'-]/gu, "").trim().slice(0, 24);
  const mime = String(body.mime ?? "");
  const bytes = Number(body.bytes);
  if (!mimeOk(mime)) return NextResponse.json({ error: "That video format is not supported." }, { status: 400 });
  if (!Number.isFinite(bytes) || bytes <= 0 || bytes > MAX_BYTES) return NextResponse.json({ error: "The video must be under 200 MB." }, { status: 400 });
  const ipHash = crypto.createHash("sha256").update(ip + (process.env.INTERNAL_API_SECRET ?? "")).digest("hex").slice(0, 16);
  try {
    const id = await createRoad(c.id, name, recorder, mime, Math.round(bytes), ipHash);
    return NextResponse.json({ id, partBytes: PART_BYTES }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[road] create failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The upload could not start. Try again in a minute." }, { status: 503 });
  }
}
