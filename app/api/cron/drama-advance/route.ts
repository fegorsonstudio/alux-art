import { NextRequest, NextResponse } from "next/server";
import { isInternalSecret } from "@/lib/internal-auth";
import { advanceStories } from "@/lib/drama/advance";

/**
 * Alux Micro Drama: queue the next episode of every story whose vote has
 * closed (lib/drama/advance.ts). The vote that decides an episode already does
 * this the moment it lands; this sweep, every ten minutes from
 * /home/aluxart/drama-advance.sh, picks up a vote that closed before its next
 * episode was written, and any run that failed half way.
 */

export const maxDuration = 120;

export async function GET(request: NextRequest) {
  if (!isInternalSecret(request.headers.get("x-internal-secret"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const results = await advanceStories();
  return NextResponse.json({ ok: true, results });
}
