import { NextRequest, NextResponse } from "next/server";
import { saveResult, workerAuthorized } from "@/lib/retouch-worker";

/**
 * The studio computer posts a finished photo: the body is the JPEG itself,
 * ?imageId= says which photo, x-engine names what made it (kept with the photo).
 */
export const dynamic = "force-dynamic";

const MAX_BYTES = 30 * 1024 * 1024;

export async function POST(req: NextRequest) {
  if (!workerAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const imageId = req.nextUrl.searchParams.get("imageId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(imageId)) return NextResponse.json({ error: "imageId missing" }, { status: 400 });
  const file = Buffer.from(await req.arrayBuffer());
  if (file.byteLength === 0 || file.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: `File must be 1 byte to ${MAX_BYTES / 1024 / 1024} MB.` }, { status: 413 });
  }
  const r = await saveResult(imageId, file, (req.headers.get("x-engine") ?? "").replace(/[^\w .\-/]/g, ""));
  return NextResponse.json(r, { status: r.ok ? 200 : 409 });
}
