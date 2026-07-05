import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { packagePrice } from "@/lib/types";
import { SITE_URL } from "@/lib/site-url";
import { initializePayment } from "@/lib/payment-gateway";
import type { InitPaymentParams, InitPaymentResult } from "@/lib/payment-types";

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
           c.paystack_subaccount_code AS cr_subaccount_paystack,
           c.flutterwave_subaccount_id AS cr_subaccount_flw
    FROM templates t
    LEFT JOIN creators c ON c.id = t.creator_id
    WHERE t.id = ${templateId} AND t.status = 'published'
  `;

  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  if (!template.cr_subaccount_paystack && !template.cr_subaccount_flw) {
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
  const estimatedGatewayFeeNgn = Math.min(Math.ceil(amountNgn * 0.015), 2000);
  const minPlatformNgn = estimatedGatewayFeeNgn + 50;
  const safeCreatorPayoutNgn = Math.max(0, Math.min(creatorPayoutNgn, amountNgn - minPlatformNgn));

  // Safe fallback of 1600 — never 1, which would charge $15,000 instead of ~$10
  // if the exchange rate API is unreachable.
  let usdToNgn = 1600;
  if (currency === "USD") {
    try {
      const fxRes = await fetch(`${SITE_URL}/api/fx-rate`, { cache: "no-store" });
      const fxData = await fxRes.json();
      if (fxData.rate && fxData.rate > 100) usdToNgn = fxData.rate;
    } catch { /* keep safe fallback */ }
  }

  // Convert to gateway currency units — gateways receive the final currency value
  const amountForGateway = currency === "USD"
    ? parseFloat((amountNgn / usdToNgn).toFixed(2))
    : amountNgn;
  const creatorPayoutForGateway = safeCreatorPayoutNgn > 0
    ? (currency === "USD"
        ? parseFloat((safeCreatorPayoutNgn / usdToNgn).toFixed(2))
        : safeCreatorPayoutNgn)
    : 0;

  const now = new Date();
  const giftId = crypto.randomUUID();

  await sql`
    INSERT INTO gift_links
      (id, template_id, sender_user_id, sender_name, custom_message,
       package_size, currency, payment_status, payment_provider, created_at, expires_at)
    VALUES (
      ${giftId}, ${templateId}, ${user.id}, ${senderName}, ${customMessage ?? null},
      ${giftPackageSize}, ${currency}, 'pending', 'paystack', ${now},
      ${new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)}
    )
  `;

  const gatewayParams: InitPaymentParams = {
    email: user.email!,
    amountNgn: amountForGateway,
    currency: currency as "NGN" | "USD",
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
    callbackUrl: `${SITE_URL}/gift/success?gift_id=${giftId}`,
    creatorSubaccount:
      creatorPayoutForGateway > 0 && (template.cr_subaccount_paystack || template.cr_subaccount_flw)
        ? {
            paystackCode: template.cr_subaccount_paystack ?? undefined,
            flutterwaveId: template.cr_subaccount_flw ?? undefined,
            payoutNgn: creatorPayoutForGateway,
          }
        : undefined,
  };

  // ── Dual-gateway failover ─────────────────────────────────────────────────
  let paymentResult: InitPaymentResult | null = null;
  let paystackError: unknown = null;

  try {
    paymentResult = await initializePayment("paystack", gatewayParams);
  } catch (err) {
    paystackError = err;
    console.warn(`[gift] Paystack failed for gift ${giftId}:`, err instanceof Error ? err.message : String(err));

    try {
      paymentResult = await initializePayment("flutterwave", gatewayParams);
      await sql`UPDATE gift_links SET payment_provider = 'flutterwave' WHERE id = ${giftId}`;
    } catch (err2) {
      console.error(
        `[gift][both-gateways-failed] gift=${giftId} paystack=${paystackError instanceof Error ? paystackError.message : String(paystackError)} flutterwave=${err2 instanceof Error ? err2.message : String(err2)}`
      );
      await sql`DELETE FROM gift_links WHERE id = ${giftId}`;
      return NextResponse.json(
        { error: "Payment processing is temporarily unavailable. Please try again in a few minutes." },
        { status: 503 }
      );
    }
  }

  // Store the winning reference in both the legacy column and the new generic one
  await sql`
    UPDATE gift_links
    SET paystack_reference = ${paymentResult.reference},
        provider_reference  = ${paymentResult.reference}
    WHERE id = ${giftId}
  `;

  return NextResponse.json({ authorizationUrl: paymentResult.authorizationUrl, giftId });
}
