import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { packagePrice } from "@/lib/types";
import { SITE_URL } from "@/lib/site-url";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to gift a session" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as {
    templateId?: string;
    senderName?: string;
    customMessage?: string;
    packageSize?: number;
    currency?: string;
  };

  const templateId = typeof body.templateId === "string" ? body.templateId : null;
  const senderName = typeof body.senderName === "string" ? body.senderName.trim().slice(0, 80) : "";
  const customMessage = typeof body.customMessage === "string" ? body.customMessage.trim().slice(0, 300) : null;
  const giftPackageSize: 1 | 5 | 10 = [1, 5, 10].includes(body.packageSize as number) ? (body.packageSize as 1 | 5 | 10) : 10;
  const currency = body.currency === "USD" ? "USD" : "NGN";

  if (!templateId) return NextResponse.json({ error: "Template is required" }, { status: 400 });
  if (!senderName) return NextResponse.json({ error: "Your name is required" }, { status: 400 });

  const [template] = await sql`
    SELECT t.id, t.title, t.price_ngn, t.price_5_ngn, t.price_1_ngn,
           t.shoot_mode, t.aspect_ratio, t.package_size,
           c.paystack_subaccount_code AS cr_subaccount
    FROM templates t
    LEFT JOIN creators c ON c.id = t.creator_id
    WHERE t.id = ${templateId} AND t.status = 'published'
  `;

  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  if (!template.cr_subaccount) {
    return NextResponse.json({ error: "Creator has not set up payouts yet" }, { status: 422 });
  }

  const configRows = await sql`SELECT key, value FROM app_config WHERE key IN ('platform_fee_ngn', 'test_price_per_image_ngn')`;
  const configMap = new Map(configRows.map(r => [r.key as string, r.value as string]));
  let basePlatformFeeNgn = parseInt(configMap.get("platform_fee_ngn") ?? "15000", 10);

  const testPriceRaw = configMap.get("test_price_per_image_ngn");
  if (testPriceRaw) {
    const tp = parseInt(testPriceRaw, 10);
    if (tp > 0) {
      template.price_1_ngn = tp;
      template.price_5_ngn = tp * 5;
      template.price_ngn = tp * 10;
      basePlatformFeeNgn = Math.max(10, Math.floor(tp * 0.1));
    }
  }

  const price10 = Number(template.price_ngn) || 0;
  const priceMap: Record<1 | 5 | 10, number | null> = {
    1: template.price_1_ngn != null ? Number(template.price_1_ngn) : (price10 ? Math.round(price10 * 0.12) : null),
    5: template.price_5_ngn != null ? Number(template.price_5_ngn) : (price10 ? Math.round(price10 * 0.60) : null),
    10: price10 || null,
  };
  const amountNgn: number | null = priceMap[giftPackageSize];
  if (!amountNgn) {
    return NextResponse.json({ error: "This package is not available for this template" }, { status: 422 });
  }

  const platformFeeNgn = packagePrice(basePlatformFeeNgn, giftPackageSize);
  if (amountNgn <= platformFeeNgn) {
    return NextResponse.json({ error: "Template price must exceed the platform fee" }, { status: 422 });
  }

  const creatorPayoutNgn = amountNgn - platformFeeNgn;
  const estimatedPaystackFeeNgn = Math.min(Math.ceil(amountNgn * 0.015), 2000);
  const minPlatformNgn = estimatedPaystackFeeNgn + 50;
  const safeCreatorPayout = Math.max(0, Math.min(creatorPayoutNgn, amountNgn - minPlatformNgn));

  let payAmountNgn = amountNgn;
  let usdToNgn = 1;

  if (currency === "USD") {
    try {
      const fxRes = await fetch(`${SITE_URL}/api/fx-rate`, { cache: "no-store" });
      const fxData = await fxRes.json();
      if (fxData.rate && fxData.rate > 0) usdToNgn = fxData.rate;
    } catch { /* fall back to NGN */ }
  }

  const now = new Date();
  const giftId = crypto.randomUUID();

  await sql`
    INSERT INTO gift_links
      (id, template_id, sender_user_id, sender_name, custom_message,
       package_size, currency, payment_status, created_at, expires_at)
    VALUES (
      ${giftId}, ${templateId}, ${user.id}, ${senderName}, ${customMessage ?? null},
      ${giftPackageSize}, ${currency}, 'pending', ${now},
      ${new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)}
    )
  `;

  const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: user.email,
      amount: currency === "USD"
        ? Math.ceil((payAmountNgn / usdToNgn) * 100)
        : payAmountNgn * 100,
      currency,
      callback_url: `${SITE_URL}/gift/success?gift_id=${giftId}`,
      metadata: {
        type: "gift_purchase",
        gift_id: giftId,
        template_id: templateId,
        user_id: user.id,
        sender_name: senderName,
        imageCount: giftPackageSize,
        custom_fields: [
          { display_name: "Package Size", variable_name: "package_size", value: String(giftPackageSize) },
          { display_name: "Image Count", variable_name: "image_count", value: String(giftPackageSize) },
        ],
      },
      split: safeCreatorPayout > 0 ? {
        type: "flat",
        bearer_type: "account",
        subaccounts: [{ subaccount: template.cr_subaccount, share: safeCreatorPayout * 100 }],
      } : undefined,
    }),
  });

  const paystackData = await paystackRes.json();
  if (!paystackData.status) {
    await sql`DELETE FROM gift_links WHERE id = ${giftId}`;
    return NextResponse.json({ error: "Payment initialization failed" }, { status: 502 });
  }

  await sql`
    UPDATE gift_links SET paystack_reference = ${paystackData.data.reference}
    WHERE id = ${giftId}
  `;

  return NextResponse.json({ authorizationUrl: paystackData.data.authorization_url, giftId });
}
