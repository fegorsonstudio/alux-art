import { NextRequest, NextResponse } from "next/server";
import { claimNext, workerAuthorized } from "@/lib/retouch-worker";

/** The studio computer asks for the next Glow Retouch photo (lib/retouch-worker.ts). */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!workerAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const job = await claimNext();
  return NextResponse.json({ job });
}
