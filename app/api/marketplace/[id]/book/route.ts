import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { packagePrice } from "@/lib/types";
import { SITE_URL } from "@/lib/site-url";

interface RefInput {
  name?: string;
  type?: string;
  size?: number;
  storageBucket: string;
  storagePath: string;
}

interface TaggedRefInput extends RefInput {
  tag: string;
  note?: string;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: templateId } = await params;
  const body = await request.json().catch(() => ({})) as {
    identityRefs?: RefInput[];
    taggedRefs?: TaggedRefInput[];
    poseRefs?: RefInput[];
    shotType?: string;
    couponCode?: string;
    packageSize?: number;
    currency?: string;
  };

  const identityRefs: RefInput[] = body.identityRefs ?? [];
  const taggedRefs: TaggedRefInput[] = body.taggedRefs ?? [];

  if (!Array.isArray(identityRefs) || identityRefs.length === 0) {
    return NextResponse.json({ error: "At least 1 identity photo is required" }, { status: 400 });
  }

  for (const ref of identityRefs) {
    if (typeof ref.storagePath !== "string" || !ref.storagePath.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: "Invalid identity image reference" }, { status: 400 });
    }
  }

  const buyerPackageSize: 1 | 5 | 10 = ([1, 5, 10] as const).includes(body.packageSize as 1 | 5 | 10)
    ? (body.packageSize as 1 | 5 | 10)
    : 10;

  const poseRefs: RefInput[] = Array.isArray(body.poseRefs) ? body.poseRefs.slice(0, 10) : [];
  for (const ref of poseRefs) {
    if (typeof ref.storagePath !== "string" || !ref.storagePath.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: "Invalid pose image reference" }, { status: 400 });
    }
  }

  const VALID_SHOT_TYPES = new Set(["headshot", "close_up", "medium", "full_body"]);
  const shotType: string | null =
    buyerPackageSize === 1 && typeof body.shotType === "string" && VALID_SHOT_TYPES.has(body.shotType)
      ? body.shotType
      : null;

  const payCurrency: "NGN" | "USD" = body.currency === "USD" ? "USD" : "NGN";

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

  const [template] = await sql`
    SELECT t.*, c.id AS cr_id, c.display_name AS cr_display_name,
           c.paystack_subaccount_code AS cr_subaccount
    FROM templates t
    LEFT JOIN creators c ON c.id = t.creator_id
    WHERE t.id = ${templateId} AND t.status = 'published'
  `;

  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  if (!template.cr_subaccount) {
    return NextResponse.json({ error: "Creator has not set up payouts yet" }, { status: 422 });
  }

  const VALID_TAGS = new Set(["OUTFIT", "HAIRSTYLE", "MAKEUP", "NAIL_DESIGN", "ACCESSORY", "BACKGROUND", "LIGHTING", "COLOR_GRADE"]);
  type TemplateImgMeta = { storage_path: string; storage_bucket?: string | null; tag?: string | null; purpose?: string; note?: string | null; custom_name?: string | null };

  const templateImgList = await sql`
    SELECT storage_path, storage_bucket, tag, purpose, note, custom_name
    FROM template_images WHERE template_id = ${templateId}
  ` as TemplateImgMeta[];

  const templateImagePaths = new Set(templateImgList.map((img) => img.storage_path));
  const creatorNoteMap = new Map<string, string | null>(
    templateImgList.map((img) => [img.storage_path, img.note ?? null])
  );

  for (const ref of taggedRefs) {
    if (!VALID_TAGS.has(ref.tag)) {
      return NextResponse.json({ error: `Invalid reference tag: ${ref.tag}` }, { status: 400 });
    }
    if (!templateImagePaths.has(ref.storagePath) && !ref.storagePath.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: "Invalid reference image path" }, { status: 400 });
    }
  }

  const seenTaggedPaths = new Set<string>();
  const deduplicatedTaggedRefs = taggedRefs.filter((ref) => {
    if (seenTaggedPaths.has(ref.storagePath)) return false;
    seenTaggedPaths.add(ref.storagePath);
    return true;
  });

  const [feeRow] = await sql`SELECT value FROM app_config WHERE key = 'platform_fee_ngn'`;
  const basePlatformFeeNgn = parseInt(feeRow?.value ?? "15000", 10);
  const platformFeeNgn = packagePrice(basePlatformFeeNgn, buyerPackageSize);

  const priceMap: Record<1 | 5 | 10, number | null> = {
    1: (template.price_1_ngn as number | null) ?? null,
    5: (template.price_5_ngn as number | null) ?? null,
    10: template.price_ngn as number,
  };
  const buyerAmountNgn: number | null = priceMap[buyerPackageSize];
  if (!buyerAmountNgn) {
    return NextResponse.json({ error: "This package is not available for this template" }, { status: 422 });
  }

  if (buyerAmountNgn <= platformFeeNgn) {
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

  const creatorPayoutNgn = buyerAmountNgn - platformFeeNgn;
  const amountNgn = buyerAmountNgn - couponDiscountNgn;
  // Paystack rejects split_share >= total_amount — cap creator payout to leave at least ₦1
  const safeCreatorPayout = Math.max(0, Math.min(creatorPayoutNgn, amountNgn - 1));
  const now = new Date();
  const shootId = crypto.randomUUID();

  const [shootRow] = await sql`
    INSERT INTO shoots
      (id, user_id, owner_email, mode, aspect_ratio, currency, package_size, status,
       progress, quote, identity_profile, shot_type, created_at, updated_at)
    VALUES (
      ${shootId}, ${user.id}, ${user.email ?? ''}, ${template.shoot_mode ?? "advanced"},
      ${template.aspect_ratio ?? "4:5"}, ${payCurrency}, ${buyerPackageSize},
      'PENDING_PAYMENT', 0, ${JSON.stringify({ text: "", attribution: "" })}::jsonb,
      '', ${shotType}, ${now}, ${now}
    )
    RETURNING id
  `.catch((err) => { console.error("[book] shoot insert failed:", err); return [null]; });

  if (!shootRow) return NextResponse.json({ error: "Failed to create shoot" }, { status: 500 });

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
  await sql`INSERT INTO shoot_images ${sql(slots)}`;

  const allRefs = [
    ...identityRefs.map((ref, i) => ({
      id: crypto.randomUUID(), shoot_id: shootId, user_id: user.id,
      purpose: "identity", tag: null, custom_name: null, note: null,
      name: ref.name ?? `identity-${i + 1}`, type: ref.type ?? "image/jpeg",
      size: ref.size ?? 1, storage_bucket: ref.storageBucket, storage_path: ref.storagePath,
      created_at: now,
    })),
    ...deduplicatedTaggedRefs.map((ref, i) => {
      const creatorNote = creatorNoteMap.get(ref.storagePath) ?? null;
      const buyerNote = ref.note?.trim() || null;
      const combinedNote = [creatorNote, buyerNote].filter(Boolean).join(". ") || null;
      return {
        id: crypto.randomUUID(), shoot_id: shootId, user_id: user.id,
        purpose: "tagged", tag: ref.tag, custom_name: null, note: combinedNote,
        name: ref.name ?? `ref-${i + 1}`, type: ref.type ?? "image/jpeg",
        size: ref.size ?? 1, storage_bucket: ref.storageBucket, storage_path: ref.storagePath,
        created_at: now,
      };
    }),
    ...templateImgList
      .filter((img) => img.purpose === "inspiration" && img.storage_path)
      .map((img, i) => ({
        id: crypto.randomUUID(), shoot_id: shootId, user_id: user.id,
        purpose: "inspiration", tag: null, custom_name: null, note: null,
        name: `inspiration-${i + 1}`, type: "image/jpeg", size: 1,
        storage_bucket: img.storage_bucket ?? "template-images", storage_path: img.storage_path,
        created_at: now,
      })),
    ...poseRefs.map((ref, i) => ({
      id: crypto.randomUUID(), shoot_id: shootId, user_id: user.id,
      purpose: "pose", tag: null, custom_name: null, note: null,
      name: ref.name ?? `pose-${i + 1}`, type: ref.type ?? "image/jpeg",
      size: ref.size ?? 1, storage_bucket: ref.storageBucket, storage_path: ref.storagePath,
      created_at: now,
    })),
  ];

  if (allRefs.length > 0) {
    const refInsertOk = await sql`INSERT INTO shoot_references ${sql(allRefs)}`.then(() => true).catch(() => false);
    if (!refInsertOk) {
      await sql`DELETE FROM shoot_images WHERE shoot_id = ${shootId}`;
      await sql`DELETE FROM shoots WHERE id = ${shootId}`;
      return NextResponse.json({ error: "Failed to save references" }, { status: 500 });
    }
  }

  const purchaseId = crypto.randomUUID();
  await sql`
    INSERT INTO template_purchases
      (id, template_id, shoot_id, user_id, amount_ngn, platform_fee_ngn, creator_payout_ngn,
       coupon_id, coupon_discount_ngn, currency, amount_usd, status, created_at)
    VALUES (
      ${purchaseId}, ${templateId}, ${shootId}, ${user.id}, ${amountNgn}, ${platformFeeNgn},
      ${creatorPayoutNgn}, ${couponId}, ${couponDiscountNgn}, ${payCurrency},
      ${payCurrency === "USD" ? parseFloat((amountNgn / usdToNgn).toFixed(2)) : null},
      'pending', ${now}
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
      amount: payCurrency === "USD"
        ? Math.ceil((amountNgn / usdToNgn) * 100)
        : amountNgn * 100,
      currency: payCurrency,
      callback_url: `${SITE_URL}/marketplace/${templateId}/book/success?shoot_id=${shootId}`,
      metadata: {
        type: "template_purchase",
        template_id: templateId,
        purchase_id: purchaseId,
        shoot_id: shootId,
        user_id: user.id,
        coupon_id: couponId,
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
    return NextResponse.json({ error: "Payment initialization failed" }, { status: 502 });
  }

  await sql`
    UPDATE template_purchases SET paystack_reference = ${paystackData.data.reference}
    WHERE id = ${purchaseId}
  `;

  return NextResponse.json({ authorizationUrl: paystackData.data.authorization_url, shootId });
}
