import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { packagePrice, normalizePackageSize } from "@/lib/types";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { code?: string; templateId?: string; packageSize?: unknown };
  if (typeof body.code !== "string" || !body.code.trim()) {
    return NextResponse.json({ error: "Coupon code is required" }, { status: 400 });
  }
  if (!body.templateId) {
    return NextResponse.json({ error: "Template ID is required" }, { status: 400 });
  }

  const pkgSize = normalizePackageSize(body.packageSize ?? 10);

  const [template] = await sql`
    SELECT price_ngn FROM templates
    WHERE id = ${body.templateId} AND status = 'published'
  `;
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  // Read fee from same source as /api/marketplace/[id]/book
  const [feeRow] = await sql`SELECT value FROM app_config WHERE key = 'platform_fee_ngn'`;
  const baseFeeNgn = parseInt(feeRow?.value ?? "15000", 10);
  const platformFeeNgn = packagePrice(baseFeeNgn, pkgSize);

  const [coupon] = await sql`
    SELECT id, discount_type, discount_value, max_uses, use_count, expires_at, is_active
    FROM coupons WHERE code = ${body.code.trim().toUpperCase()}
  `;

  if (!coupon || !coupon.is_active) {
    return NextResponse.json({ valid: false, message: "Invalid coupon code" });
  }
  if (coupon.expires_at && new Date(coupon.expires_at as string) < new Date()) {
    return NextResponse.json({ valid: false, message: "This coupon has expired" });
  }
  if (coupon.max_uses !== null && (coupon.use_count as number) >= (coupon.max_uses as number)) {
    return NextResponse.json({ valid: false, message: "This coupon has reached its usage limit" });
  }

  let discountNgn = 0;
  if (coupon.discount_type === "percent") {
    discountNgn = Math.floor(platformFeeNgn * (coupon.discount_value as number) / 100);
  } else {
    discountNgn = Math.min(coupon.discount_value as number, platformFeeNgn);
  }

  return NextResponse.json({
    valid: true,
    couponId: coupon.id,
    discountNgn,
    discountDescription: coupon.discount_type === "percent"
      ? `${coupon.discount_value}% off platform fee`
      : `₦${(coupon.discount_value as number).toLocaleString()} off platform fee`,
  });
}
