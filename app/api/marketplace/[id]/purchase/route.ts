import { NextResponse } from "next/server";

// Legacy marketplace purchase endpoint — superseded by POST /api/marketplace/[id]/book,
// which the checkout UI uses exclusively. Disabled to remove an unused money-path
// attack surface (it carried an older, non-atomic coupon check).
export async function POST() {
  return NextResponse.json(
    { error: "This endpoint has moved. Booking is handled by /api/marketplace/[id]/book.", code: "endpoint_moved" },
    { status: 410 }
  );
}
