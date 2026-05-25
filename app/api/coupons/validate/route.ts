import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { code?: string; templateId?: string };
  if (typeof body.code !== "string" || !body.code.trim()) {
    return NextResponse.json({ error: "Coupon code is required" }, { status: 400 });
  }
  if (!body.templateId) {
    return NextResponse.json({ error: "Template ID is required" }, { status: 400 });
  }

  const [template] = await sql`
    SELECT price_ngn, package_size FROM templates
    WHERE id = ${body.templateId} AND status = 'published'
  `;
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const [feeRow] = await sql`SELECT ngn FROM pricing_configs ORDER BY updated_at DESC LIMIT 1`;
  const platformFeeNgn: number = (feeRow?.ngn as number | null) ?? 15000;

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
