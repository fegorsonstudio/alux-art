import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { r2ProxyUrl } from "@/lib/r2";
import sql from "@/lib/db";
import { isAdminEmail } from "@/lib/auth";
import { retouchPriceNgn } from "@/lib/retouch-pricing";

/**
 * The retouched gallery for one shoot.
 *
 * Returns the tiles and whether they are unlocked. Previews are always visible —
 * the buyer has to see the work to want to pay for it — and the download route
 * is what actually enforces the gate.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [shoot] = await sql`SELECT user_id FROM shoots WHERE id = ${id}`;
  const isAdmin = isAdminEmail(user.email);
  if (!shoot || (!isAdmin && shoot.user_id !== user.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [order] = await sql<{
    status: string; price_ngn: number; image_count: number;
    paid: boolean; free: boolean; delivered_at: Date | null;
  }[]>`SELECT status, price_ngn, image_count, paid, free, delivered_at
       FROM shoot_retouch WHERE shoot_id = ${id}`;

  // No order at all is the normal case for the vast majority of shoots. Say so
  // plainly rather than 404-ing, and hand back what the offer would cost — the
  // client must never multiply the price out itself, or what a buyer is quoted
  // and what they are charged can drift apart.
  if (!order) {
    const [{ n }] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM shoot_images
      WHERE shoot_id = ${id} AND status = 'COMPLETE'`;
    return NextResponse.json({
      retouch: null,
      images: [],
      offer: n > 0 ? { imageCount: n, priceNgn: retouchPriceNgn(n) } : null,
    });
  }

  const rows = await sql<{
    id: string; slot: number | null; storage_bucket: string; storage_path: string;
    width: number | null; height: number | null; file_size: string | null;
  }[]>`SELECT id, slot, storage_bucket, storage_path, width, height, file_size
       FROM shoot_retouched_images WHERE shoot_id = ${id} ORDER BY slot NULLS LAST, created_at`;

  const unlocked = order.paid || order.free;

  return NextResponse.json({
    retouch: {
      status: order.status,
      priceNgn: order.price_ngn,
      imageCount: order.image_count,
      unlocked,
      free: order.free,
      deliveredAt: order.delivered_at,
    },
    images: rows.map(r => ({
      id: r.id,
      slot: r.slot,
      width: r.width,
      height: r.height,
      fileSize: r.file_size ? Number(r.file_size) : null,
      // Display only. The bytes behind this are the same file, but the download
      // route is the one that checks payment.
      previewUrl: r2ProxyUrl(r.storage_bucket, r.storage_path),
    })),
  });
}
