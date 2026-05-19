import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { code?: string; templateId?: string };
  if (typeof body.code !== "string" || !body.code.trim()) {
    return NextResponse.json({ error: "Coupon code is required" }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: template } = await service
    .from("templates")
    .select("price_ngn, package_size")
    .eq("id", body.templateId)
    .eq("status", "published")
    .single();
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const { data: feeConfig } = await service
    .from("pricing_configs")
    .select("price_ngn")
    .eq("package_size", template.package_size)
    .single();
  const platformFeeNgn: number = (feeConfig as { price_ngn: number } | null)?.price_ngn ?? 15000;

  const { data: coupon } = await service
    .from("coupons")
    .select("id, discount_type, discount_value, max_uses, use_count, expires_at, is_active")
    .eq("code", body.code.trim().toUpperCase())
    .single();

  if (!coupon || !coupon.is_active) {
    return NextResponse.json({ valid: false, message: "Invalid coupon code" });
  }
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return NextResponse.json({ valid: false, message: "This coupon has expired" });
  }
  if (coupon.max_uses !== null && coupon.use_count >= coupon.max_uses) {
    return NextResponse.json({ valid: false, message: "This coupon has reached its usage limit" });
  }

  let discountNgn = 0;
  if (coupon.discount_type === "percent") {
    discountNgn = Math.floor(platformFeeNgn * coupon.discount_value / 100);
  } else {
    discountNgn = Math.min(coupon.discount_value, platformFeeNgn);
  }

  return NextResponse.json({
    valid: true,
    couponId: coupon.id,
    discountNgn,
    discountDescription: coupon.discount_type === "percent"
      ? `${coupon.discount_value}% off platform fee`
      : `₦${coupon.discount_value.toLocaleString()} off platform fee`,
  });
}
