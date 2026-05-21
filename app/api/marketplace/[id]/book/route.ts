import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import { packagePrice } from "@/lib/types";

interface RefInput {
  name?: string;
  type?: string;
  size?: number;
  storageBucket: string;
  storagePath: string;
}

interface TaggedRefInput extends RefInput {
  tag: string;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: templateId } = await params;
  const body = await request.json().catch(() => ({})) as {
    identityRefs?: RefInput[];
    taggedRefs?: TaggedRefInput[];
    couponCode?: string;
    packageSize?: number;
    currency?: string;
  };

  const identityRefs: RefInput[] = body.identityRefs ?? [];
  const taggedRefs: TaggedRefInput[] = body.taggedRefs ?? [];

  if (!Array.isArray(identityRefs) || identityRefs.length === 0) {
    return NextResponse.json({ error: "At least 1 identity photo is required" }, { status: 400 });
  }

  // Validate all identity refs belong to this user
  for (const ref of identityRefs) {
    if (typeof ref.storagePath !== "string" || !ref.storagePath.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: "Invalid identity image reference" }, { status: 400 });
    }
  }

  const service = createServiceClient();

  const buyerPackageSize: 1 | 5 | 10 = ([1, 5, 10] as const).includes(body.packageSize as 1 | 5 | 10)
    ? (body.packageSize as 1 | 5 | 10)
    : 10;

  const payCurrency: "NGN" | "USD" = body.currency === "USD" ? "USD" : "NGN";

  // Fetch live FX rate if paying in USD
  let usdToNgn = 1600;
  if (payCurrency === "USD") {
    try {
      const fxRes = await fetch("https://open.er-api.com/v6/latest/USD");
      if (fxRes.ok) {
        const fxData = await fxRes.json();
        if (fxData?.rates?.NGN > 100) usdToNgn = fxData.rates.NGN;
      }
    } catch { /* use fallback */ }
  }

  // 1. Fetch published template + creator
  const { data: template } = await service
    .from("templates")
    .select("*, creators(id, display_name, paystack_subaccount_code), template_images(storage_path, storage_bucket)")
    .eq("id", templateId)
    .eq("status", "published")
    .single();

  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const creator = template.creators as { id: string; display_name: string; paystack_subaccount_code?: string } | null;
  if (!creator?.paystack_subaccount_code) {
    return NextResponse.json({ error: "Creator has not set up payouts yet" }, { status: 422 });
  }

  // C4: validate tagged refs against template image paths and allowed tags
  const VALID_TAGS = new Set(["OUTFIT", "HAIRSTYLE", "MAKEUP", "NAIL_DESIGN", "ACCESSORY", "BACKGROUND", "LIGHTING", "COLOR_GRADE"]);
  const templateImagePaths = new Set(
    ((template.template_images ?? []) as Array<{ storage_path: string }>).map(img => img.storage_path)
  );
  for (const ref of taggedRefs) {
    if (!VALID_TAGS.has(ref.tag)) {
      return NextResponse.json({ error: `Invalid reference tag: ${ref.tag}` }, { status: 400 });
    }
    if (!templateImagePaths.has(ref.storagePath) && !ref.storagePath.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: "Invalid reference image path" }, { status: 400 });
    }
  }

  // 2. Fetch platform fee from app_config
  const { data: feeRow } = await service.from("app_config").select("value").eq("key", "platform_fee_ngn").single();
  const basePlatformFeeNgn = parseInt(feeRow?.value ?? "15000", 10);
  const platformFeeNgn = packagePrice(basePlatformFeeNgn, buyerPackageSize);

  // Resolve buyer's price for chosen package
  const priceMap: Record<1 | 5 | 10, number | null> = {
    1: (template as Record<string, unknown>).price_1_ngn as number | null ?? null,
    5: (template as Record<string, unknown>).price_5_ngn as number | null ?? null,
    10: template.price_ngn,
  };
  const buyerAmountNgn: number | null = priceMap[buyerPackageSize];
  if (!buyerAmountNgn) {
    return NextResponse.json({ error: "This package is not available for this template" }, { status: 422 });
  }

  if (buyerAmountNgn <= platformFeeNgn) {
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

  // 4. Amounts
  const creatorPayoutNgn = buyerAmountNgn - platformFeeNgn;
  const amountNgn = buyerAmountNgn - couponDiscountNgn;

  const now = new Date().toISOString();
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("host") ?? "";
  const shootId = crypto.randomUUID();

  // 5. Create shoot in PENDING_PAYMENT
  const { error: shootErr } = await service.from("shoots").insert({
    id: shootId,
    user_id: user.id,
    owner_email: user.email,
    mode: template.shoot_mode ?? "advanced",
    aspect_ratio: template.aspect_ratio ?? "4:5",
    currency: payCurrency,
    package_size: buyerPackageSize,
    status: "PENDING_PAYMENT",
    progress: 0,
    quote: { text: "", attribution: "" },
    identity_profile: "",
    created_at: now,
    updated_at: now,
  });

  if (shootErr) return NextResponse.json({ error: shootErr.message }, { status: 500 });

  // Create image slots
  const slots = Array.from({ length: buyerPackageSize }, (_, i) => ({
    id: crypto.randomUUID(),
    shoot_id: shootId,
    user_id: user.id,
    slot: i + 1,
    kind: i < 8 ? "portrait" : i === 8 ? "mood" : "quote",
    status: "PENDING",
    created_at: now,
    updated_at: now,
  }));
  await service.from("shoot_images").insert(slots);

  // 6. Insert shoot_references: identity + surviving tagged refs
  const identityRows = identityRefs.map((ref, i) => ({
    id: crypto.randomUUID(),
    shoot_id: shootId,
    user_id: user.id,
    purpose: "identity",
    tag: null,
    custom_name: null,
    note: null,
    name: ref.name ?? `identity-${i + 1}`,
    type: ref.type ?? "image/jpeg",
    size: ref.size ?? 1,
    storage_bucket: ref.storageBucket,
    storage_path: ref.storagePath,
    created_at: now,
  }));

  const taggedRows = taggedRefs.map((ref, i) => ({
    id: crypto.randomUUID(),
    shoot_id: shootId,
    user_id: user.id,
    purpose: "tagged",
    tag: ref.tag,
    custom_name: null,
    note: null,
    name: ref.name ?? `ref-${i + 1}`,
    type: ref.type ?? "image/jpeg",
    size: ref.size ?? 1,
    storage_bucket: ref.storageBucket,
    storage_path: ref.storagePath,
    created_at: now,
  }));

  if (identityRows.length + taggedRows.length > 0) {
    const { error: refErr } = await service.from("shoot_references").insert([...identityRows, ...taggedRows]);
    if (refErr) {
      await service.from("shoot_images").delete().eq("shoot_id", shootId);
      await service.from("shoots").delete().eq("id", shootId);
      return NextResponse.json({ error: refErr.message }, { status: 500 });
    }
  }

  // 7. Insert pending purchase record
  const purchaseId = crypto.randomUUID();
  await service.from("template_purchases").insert({
    id: purchaseId,
    template_id: templateId,
    shoot_id: shootId,
    user_id: user.id,
    amount_ngn: amountNgn,
    platform_fee_ngn: platformFeeNgn,
    creator_payout_ngn: creatorPayoutNgn,
    coupon_id: couponId,
    coupon_discount_ngn: couponDiscountNgn,
    currency: payCurrency,
    amount_usd: payCurrency === "USD" ? parseFloat((amountNgn / usdToNgn).toFixed(2)) : null,
    status: "pending",
    created_at: now,
  });

  // 8. Init Paystack split transaction
  const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: user.email,
      amount: payCurrency === "USD"
        ? Math.ceil((amountNgn / usdToNgn) * 100)   // USD cents
        : amountNgn * 100,                            // NGN kobo
      currency: payCurrency,
      callback_url: `${proto}://${host}/marketplace/${templateId}/book/success?shoot_id=${shootId}`,
      metadata: {
        type: "template_purchase",
        template_id: templateId,
        purchase_id: purchaseId,
        shoot_id: shootId,
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
    await service.from("shoot_references").delete().eq("shoot_id", shootId);
    await service.from("shoot_images").delete().eq("shoot_id", shootId);
    await service.from("shoots").delete().eq("id", shootId);
    return NextResponse.json({ error: "Payment initialization failed" }, { status: 502 });
  }

  await service.from("template_purchases")
    .update({ paystack_reference: paystackData.data.reference })
    .eq("id", purchaseId);

  return NextResponse.json({
    authorizationUrl: paystackData.data.authorization_url,
    shootId,
  });
}
