import { NextRequest, NextResponse } from "next/server";
import { castIdForReference, sponsorshipIdForReference, verifyDramaPayment } from "@/lib/drama/payments";

/** GET ?reference= → { state, castId? }: the return page's check after Paystack sends the buyer back. */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const reference = req.nextUrl.searchParams.get("reference") ?? "";
  const state = await verifyDramaPayment(reference).catch(() => "nothing" as const);
  // The character page itself checks that the visitor is the member, so the id alone opens nothing.
  const castId = await castIdForReference(reference).catch(() => null);
  const sponsorshipId = await sponsorshipIdForReference(reference).catch(() => null);
  return NextResponse.json({ state, castId, sponsorshipId });
}
