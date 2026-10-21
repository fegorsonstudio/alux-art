import { NextRequest, NextResponse } from "next/server";
import { isInternalSecret } from "@/lib/internal-auth";
import { advanceStories } from "@/lib/drama/advance";
import { processCast } from "@/lib/drama/character";

/**
 * Alux Micro Drama, every ten minutes from /home/aluxart/drama-advance.sh:
 *   1. queue the next episode of every story whose vote has closed
 *      (lib/drama/advance.ts) — the vote that decides already does this; the
 *      sweep picks up a vote that closed before its next episode was written,
 *      and any run that failed half way;
 *   2. move every paid cast member along (lib/drama/character.ts) — payment
 *      already starts it; the sweep catches a restart in the middle.
 */

export const maxDuration = 280;

export async function GET(request: NextRequest) {
  if (!isInternalSecret(request.headers.get("x-internal-secret"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const results = await advanceStories();
  const cast = await processCast().catch((e) => [{ id: "-", result: `error: ${(e as Error).message.slice(0, 120)}` }]);
  return NextResponse.json({ ok: true, results, cast });
}
