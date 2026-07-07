import { NextResponse } from "next/server";

// Refunds have been replaced by a one-time complimentary regeneration for shoots
// that don't fully generate. This endpoint is intentionally disabled — the studio
// UI now calls POST /api/shoots/[id]/regenerate instead. Kept as a safe stub so any
// old client or bookmarked call fails clearly rather than hitting the previous
// (provider-incomplete, non-atomic) refund logic.
export async function POST() {
  return NextResponse.json(
    {
      error:
        'Refunds are no longer issued. Failed shoots qualify for a free regeneration instead — ' +
        'open the shoot in your studio and use "Regenerate for free". If that is not available, ' +
        "contact support with your shoot ID.",
      code: "refunds_replaced_by_regeneration",
    },
    { status: 410 }
  );
}
