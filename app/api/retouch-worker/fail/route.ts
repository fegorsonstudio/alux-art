import { NextRequest, NextResponse } from "next/server";
import { failJob, workerAuthorized } from "@/lib/retouch-worker";

/** The studio computer could not retouch a photo: it goes to a person, never half-done to the customer. */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!workerAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const imageId = req.nextUrl.searchParams.get("imageId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(imageId)) return NextResponse.json({ error: "imageId missing" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const reason = typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim() : "the studio computer could not retouch it";
  const ok = await failJob(imageId, reason.slice(0, 300));
  return NextResponse.json({ ok }, { status: ok ? 200 : 409 });
}
