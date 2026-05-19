import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({})) as { couponCode?: string };
  const service = createServiceClient();

  // 1. Fetch template (published only)
  const { data: template } = await service
    .from("templates")
    .select("*, creators(id, display_name, paystack_subaccount_code)")
    .eq("id", id)
    .eq("status", "published")
    .single();

  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const creator = template.creators as { id: string; display_name: string; paystack_subaccount_code?: string } | null;
  if (!creator?.paystack_subaccount_code) {
    return NextResponse.json({ error: "Creator has not set up payouts yet" }, { status: 422 });
  }

  // 2. Fetch platform fee from pricing_configs
  const { data: feeConfig } = await service
    .from("pricing_configs")
    .select("price_ngn")
    .eq("package_size", template.package_size)
    .single();
  const platformFeeNgn: number = (feeConfig as { price_ngn: number } | null)?.price_ngn ?? 15000;

  if (template.price_ngn <= platformFeeNgn) {
    return NextResponse.json({ error: "Template price must exceed the platform fee" }, { status: 422 });
  }

  // 3. Validate coupon
  let couponId: string | null = null;
  let couponDiscountNgn = 0;

  if (body.couponCode && typeof body.couponCode === "string") {
    const { data: c } = await service
      .from("coupons")
      .select("id, discount_type, discount_value, max_uses, use_count, expires_at, is_active")
      .eq("code", body.couponCode.trim().toUpperCase())
      .single();

    if (!c || !c.is_active) {
      return NextResponse.json({ error: "Invalid or inactive coupon code" }, { status: 422 });
    }
    if (c.expires_at && new Date(c.expires_at) < new Date()) {
      return NextResponse.json({ error: "This coupon code has expired" }, { status: 422 });
    }
    if (c.max_uses !== null && c.use_count >= c.max_uses) {
      return NextResponse.json({ error: "This coupon has reached its usage limit" }, { status: 422 });
    }

    if (c.discount_type === "percent") {
      couponDiscountNgn = Math.floor(platformFeeNgn * c.discount_value / 100);
    } else {
      couponDiscountNgn = Math.min(c.discount_value, platformFeeNgn);
    }
    couponId = c.id;
  }

  // 4. Amounts — coupon only reduces platform portion; creator always gets full markup
  const creatorPayoutNgn = template.price_ngn - platformFeeNgn;
  const amountNgn = template.price_ngn - couponDiscountNgn;

  // 5. Insert pending purchase record
  const purchaseId = crypto.randomUUID();
  const now = new Date().toISOString();
  await service.from("template_purchases").insert({
    id: purchaseId,
    template_id: id,
    user_id: user.id,
    amount_ngn: amountNgn,
    platform_fee_ngn: platformFeeNgn,
    creator_payout_ngn: creatorPayoutNgn,
    coupon_id: couponId,
    coupon_discount_ngn: couponDiscountNgn,
    status: "pending",
    created_at: now,
  });

  // 6. Init Paystack split transaction
  const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: user.email,
      amount: amountNgn * 100,
      metadata: {
        type: "template_purchase",
        template_id: id,
        purchase_id: purchaseId,
        user_id: user.id,
        coupon_id: couponId,
      },
      split: creatorPayoutNgn > 0 ? {
        type: "flat",
        bearer_type: "account",
        subaccounts: [{ subaccount: creator.paystack_subaccount_code, share: creatorPayoutNgn * 100 }],
      } : undefined,
    }),
  });

  const paystackData = await paystackRes.json();
  if (!paystackData.status) {
    await service.from("template_purchases").delete().eq("id", purchaseId);
    return NextResponse.json({ error: "Payment initialization failed" }, { status: 502 });
  }

  await service.from("template_purchases")
    .update({ paystack_reference: paystackData.data.reference })
    .eq("id", purchaseId);

  return NextResponse.json({
    authorizationUrl: paystackData.data.authorization_url,
    reference: paystackData.data.reference,
  });
}
