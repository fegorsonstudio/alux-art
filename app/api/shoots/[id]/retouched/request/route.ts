import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { isAdminEmail } from "@/lib/auth";
import { retouchPriceNgn } from "@/lib/retouch-pricing";

/**
 * "Yes, retouch these" — the buyer asking for the work.
 *
 * Takes no money. Retouching is done by hand afterwards and the buyer pays to
 * unlock the finished files, so charging here would bill for work that does not
 * exist yet. This only records the order and fixes its price.
 *
 * The price is stamped onto the row now so a later change to
 * RETOUCH_PRICE_PER_IMAGE_NGN can never alter a total the buyer already saw.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [shoot] = await sql<{ user_id: string; status: string }[]>`
    SELECT user_id, status FROM shoots WHERE id = ${id}`;
  const isAdmin = isAdminEmail(user.email);
  if (!shoot || (!isAdmin && shoot.user_id !== user.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Retouching acts on finished images. Offering it earlier would promise work
  // on files that may still fail.
  if (shoot.status !== "COMPLETE") {
    return NextResponse.json({ error: "Shoot is not complete" }, { status: 400 });
  }

  const [existing] = await sql<{ status: string }[]>`
    SELECT status FROM shoot_retouch WHERE shoot_id = ${id}`;
  if (existing) {
    // Asking twice is a double-tap, not an error worth showing anyone.
    return NextResponse.json({ ok: true, alreadyRequested: true, status: existing.status });
  }

  // Only finished images can be retouched, so they decide the bill.
  const [{ n: imageCount }] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM shoot_images
    WHERE shoot_id = ${id} AND status = 'COMPLETE'`;
  if (!imageCount) {
    return NextResponse.json({ error: "No finished images to retouch" }, { status: 400 });
  }

  const price = retouchPriceNgn(imageCount);
  await sql`
    INSERT INTO shoot_retouch (shoot_id, status, price_ngn, image_count, created_at, updated_at)
    VALUES (${id}, 'REQUESTED', ${price}, ${imageCount}, NOW(), NOW())
    ON CONFLICT (shoot_id) DO NOTHING`;

  console.log(`[retouch] requested for shoot ${id}: ${imageCount} images, ₦${price}`);
  return NextResponse.json({ ok: true, status: "REQUESTED", imageCount, priceNgn: price });
}
