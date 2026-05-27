import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { packagePrice } from "@/lib/types";
import { SITE_URL } from "@/lib/site-url";

// POST — internal only. Called by the WhatsApp bot to create a shoot + Paystack payment URL.
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-internal-secret");
  if (!secret || secret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const {
    templateId,
    creatorId,
    customerPhone,
    mode = "fast",
    packageSize = 5,
    identityStoragePaths,
    inspirationStoragePath,
  } = body as {
    templateId: string;
    creatorId: string;
    customerPhone: string;
    mode?: string;
    packageSize?: number;
    identityStoragePaths: string[];
    inspirationStoragePath?: string | null;
  };

  if (!templateId || !creatorId || !customerPhone) {
    return NextResponse.json({ error: "templateId, creatorId, and customerPhone are required" }, { status: 400 });
  }
  if (!Array.isArray(identityStoragePaths) || identityStoragePaths.length < 3) {
    return NextResponse.json({ error: "At least 3 identity photos required" }, { status: 400 });
  }

  const buyerPackageSize: 5 | 10 = packageSize === 10 ? 10 : 5;

  // Load template + creator with payout subaccount
  const [template] = await sql`
    SELECT t.id, t.title, t.shoot_mode, t.aspect_ratio,
           t.price_ngn, t.price_5_ngn, t.price_1_ngn,
           c.id AS creator_id, c.user_id AS creator_user_id,
           c.paystack_subaccount_code AS cr_subaccount
    FROM templates t
    JOIN creators c ON c.id = t.creator_id
    WHERE t.id = ${templateId} AND t.status = 'published' AND c.id = ${creatorId}
  `;

  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  if (!template.cr_subaccount) {
    return NextResponse.json({ error: "Creator has not set up payouts" }, { status: 422 });
  }

  // Load template inspiration images (used as shoot references)
  const templateImgs = await sql`
    SELECT storage_path, storage_bucket, tag, purpose
    FROM template_images WHERE template_id = ${templateId}
  `;

  // Pricing
  const configRows = await sql`
    SELECT key, value FROM app_config WHERE key IN ('platform_fee_ngn', 'test_price_per_image_ngn')
  `;
  const configMap = new Map(configRows.map(r => [r.key as string, r.value as string]));
  let basePlatformFeeNgn = parseInt(configMap.get("platform_fee_ngn") ?? "15000", 10);

  const testPriceRaw = configMap.get("test_price_per_image_ngn");
  let priceNgn5 = template.price_5_ngn as number | null;
  let priceNgn10 = template.price_ngn as number;
  if (testPriceRaw) {
    const testPrice = parseInt(testPriceRaw, 10);
    if (testPrice > 0) {
      priceNgn5 = testPrice * 5;
      priceNgn10 = testPrice * 10;
      basePlatformFeeNgn = Math.max(10, Math.floor(testPrice * 0.1));
    }
  }

  const priceMap: Record<5 | 10, number | null> = { 5: priceNgn5, 10: priceNgn10 };
  const buyerAmountNgn = priceMap[buyerPackageSize];
  if (!buyerAmountNgn) {
    return NextResponse.json({ error: "5-image package not available for this template" }, { status: 422 });
  }

  const platformFeeNgn = packagePrice(basePlatformFeeNgn, buyerPackageSize);
  const creatorPayoutNgn = buyerAmountNgn - platformFeeNgn;
  const amountNgn = buyerAmountNgn;
  const estimatedPaystackFeeNgn = Math.min(Math.ceil(amountNgn * 0.015), 2000);
  const minPlatformNgn = estimatedPaystackFeeNgn + 50;
  const safeCreatorPayout = Math.max(0, Math.min(creatorPayoutNgn, amountNgn - minPlatformNgn));

  const now = new Date();
  const shootId = crypto.randomUUID();
  const creatorUserId = template.creator_user_id as string;

  const [shootRow] = await sql`
    INSERT INTO shoots (
      id, user_id, owner_email, mode, aspect_ratio, currency, package_size,
      status, progress, quote, identity_profile, source, customer_phone,
      created_at, updated_at
    ) VALUES (
      ${shootId}, ${creatorUserId},
      ${"wa_" + customerPhone.replace(/\D/g, "") + "@aluxartandframes.shop"},
      ${(template.shoot_mode as string) ?? "fast"},
      ${(template.aspect_ratio as string) ?? "4:5"},
      'NGN', ${buyerPackageSize},
      'PENDING_PAYMENT', 0, ${JSON.stringify({ text: "", attribution: "" })}::jsonb,
      '', 'whatsapp', ${customerPhone},
      ${now}, ${now}
    )
    RETURNING id
  `.catch((err) => { console.error("[whatsapp-shoot] shoot insert failed:", err); return [null]; });

  if (!shootRow) return NextResponse.json({ error: "Failed to create shoot" }, { status: 500 });

  // Create image slots
  const slots = Array.from({ length: buyerPackageSize }, (_, i) => ({
    id: crypto.randomUUID(),
    shoot_id: shootId,
    user_id: creatorUserId,
    slot: i + 1,
    kind: "portrait",
    status: "PENDING",
    created_at: now,
    updated_at: now,
  }));
  await sql`INSERT INTO shoot_images ${sql(slots)}`;

  // Save references
  const refs = [
    ...identityStoragePaths.map((path, i) => ({
      id: crypto.randomUUID(), shoot_id: shootId, user_id: creatorUserId,
      purpose: "identity", tag: null, custom_name: null, note: null,
      name: `selfie-${i + 1}`, type: "image/jpeg", size: 1,
      storage_bucket: "template-images", storage_path: path,
      created_at: now,
    })),
    ...(inspirationStoragePath ? [{
      id: crypto.randomUUID(), shoot_id: shootId, user_id: creatorUserId,
      purpose: "inspiration", tag: null, custom_name: null, note: null,
      name: "inspiration", type: "image/jpeg", size: 1,
      storage_bucket: "template-images", storage_path: inspirationStoragePath,
      created_at: now,
    }] : []),
    ...templateImgs
      .filter((img) => img.purpose === "inspiration" && img.storage_path)
      .map((img, i) => ({
        id: crypto.randomUUID(), shoot_id: shootId, user_id: creatorUserId,
        purpose: "inspiration", tag: null, custom_name: null, note: null,
        name: `template-${i + 1}`, type: "image/jpeg", size: 1,
        storage_bucket: (img.storage_bucket as string) ?? "template-images",
        storage_path: img.storage_path as string,
        created_at: now,
      })),
  ];

  if (refs.length > 0) {
    const ok = await sql`INSERT INTO shoot_references ${sql(refs)}`.then(() => true).catch(() => false);
    if (!ok) {
      await sql`DELETE FROM shoot_images WHERE shoot_id = ${shootId}`;
      await sql`DELETE FROM shoots WHERE id = ${shootId}`;
      return NextResponse.json({ error: "Failed to save references" }, { status: 500 });
    }
  }

  // Create purchase record
  const purchaseId = crypto.randomUUID();
  await sql`
    INSERT INTO template_purchases
      (id, template_id, shoot_id, user_id, amount_ngn, platform_fee_ngn, creator_payout_ngn,
       coupon_id, coupon_discount_ngn, currency, status, created_at)
    VALUES (
      ${purchaseId}, ${templateId}, ${shootId}, ${creatorUserId},
      ${amountNgn}, ${platformFeeNgn}, ${creatorPayoutNgn},
      NULL, 0, 'NGN', 'pending', ${now}
    )
  `;

  // Initialize Paystack transaction
  const customerEmail = "wa_" + customerPhone.replace(/\D/g, "") + "@aluxartandframes.shop";
  const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: customerEmail,
      amount: amountNgn * 100,
      currency: "NGN",
      callback_url: `${SITE_URL}/marketplace/${templateId}/book/success?shoot_id=${shootId}`,
      metadata: {
        type: "template_purchase",
        template_id: templateId,
        purchase_id: purchaseId,
        shoot_id: shootId,
        user_id: creatorUserId,
        coupon_id: null,
        source: "whatsapp",
        customer_phone: customerPhone,
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
    await sql`DELETE FROM template_purchases WHERE id = ${purchaseId}`;
    await sql`DELETE FROM shoot_references WHERE shoot_id = ${shootId}`;
    await sql`DELETE FROM shoot_images WHERE shoot_id = ${shootId}`;
    await sql`DELETE FROM shoots WHERE id = ${shootId}`;
    console.error("[whatsapp-shoot] Paystack init failed:", paystackData);
    return NextResponse.json({ error: "Payment initialization failed" }, { status: 502 });
  }

  await sql`
    UPDATE template_purchases SET paystack_reference = ${paystackData.data.reference}
    WHERE id = ${purchaseId}
  `;

  return NextResponse.json({
    shoot: { id: shootId },
    paymentUrl: paystackData.data.authorization_url,
  });
}
