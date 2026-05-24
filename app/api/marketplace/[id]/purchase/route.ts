import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({})) as { couponCode?: string };

  const [template] = await sql`
    SELECT t.*, c.id AS cr_id, c.paystack_subaccount_code AS cr_subaccount
    FROM templates t
    LEFT JOIN creators c ON c.id = t.creator_id
    WHERE t.id = ${id} AND t.status = 'published'
  `;

  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  if (!template.cr_subaccount) {
    return NextResponse.json({ error: "Creator has not set up payouts yet" }, { status: 422 });
  }

  const [feeRow] = await sql`SELECT ngn FROM pricing_configs ORDER BY updated_at DESC LIMIT 1`;
  const platformFeeNgn: number = (feeRow?.ngn as number | null) ?? 15000;

  if ((template.price_ngn as number) <= platformFeeNgn) {
    return NextResponse.json({ error: "Template price must exceed the platform fee" }, { status: 422 });
  }

  let couponId: string | null = null;
  let couponDiscountNgn = 0;

  if (body.couponCode && typeof body.couponCode === "string") {
    const [c] = await sql`
      SELECT id, discount_type, discount_value, max_uses, use_count, expires_at, is_active
      FROM coupons WHERE code = ${body.couponCode.trim().toUpperCase()}
    `;

    if (!c || !c.is_active) {
      return NextResponse.json({ error: "Invalid or inactive coupon code" }, { status: 422 });
    }
    if (c.expires_at && new Date(c.expires_at as string) < new Date()) {
      return NextResponse.json({ error: "This coupon code has expired" }, { status: 422 });
    }
    if (c.max_uses !== null && (c.use_count as number) >= (c.max_uses as number)) {
      return NextResponse.json({ error: "This coupon has reached its usage limit" }, { status: 422 });
    }

    if (c.discount_type === "percent") {
      couponDiscountNgn = Math.floor(platformFeeNgn * (c.discount_value as number) / 100);
    } else {
      couponDiscountNgn = Math.min(c.discount_value as number, platformFeeNgn);
    }
    couponId = c.id as string;
  }

  const creatorPayoutNgn = (template.price_ngn as number) - platformFeeNgn;
  const amountNgn = (template.price_ngn as number) - couponDiscountNgn;

  const purchaseId = crypto.randomUUID();
  await sql`
    INSERT INTO template_purchases
      (id, template_id, user_id, amount_ngn, platform_fee_ngn, creator_payout_ngn,
       coupon_id, coupon_discount_ngn, status, created_at)
    VALUES (${purchaseId}, ${id}, ${user.id}, ${amountNgn}, ${platformFeeNgn},
            ${creatorPayoutNgn}, ${couponId}, ${couponDiscountNgn}, 'pending', NOW())
  `;

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
        subaccounts: [{ subaccount: template.cr_subaccount, share: creatorPayoutNgn * 100 }],
      } : undefined,
    }),
  });

  const paystackData = await paystackRes.json();
  if (!paystackData.status) {
    await sql`DELETE FROM template_purchases WHERE id = ${purchaseId}`;
    return NextResponse.json({ error: "Payment initialization failed" }, { status: 502 });
  }

  await sql`
    UPDATE template_purchases SET paystack_reference = ${paystackData.data.reference}
    WHERE id = ${purchaseId}
  `;

  return NextResponse.json({
    authorizationUrl: paystackData.data.authorization_url,
    reference: paystackData.data.reference,
  });
}
