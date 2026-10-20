import { NextRequest, NextResponse } from "next/server";
import { verifyDramaPayment } from "@/lib/drama/payments";

/** GET ?reference= → { state }: the return page's check after Paystack sends the buyer back. */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const reference = req.nextUrl.searchParams.get("reference") ?? "";
  const state = await verifyDramaPayment(reference).catch(() => "nothing" as const);
  return NextResponse.json({ state });
}
