import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { packagePrice } from "@/lib/types";
import { SITE_URL } from "@/lib/site-url";
import { isAdminEmail } from "@/lib/auth";
import { initializePayment } from "@/lib/payment-gateway";
import type { InitPaymentParams, InitPaymentResult } from "@/lib/payment-types";
import { resolveBackgroundPlan, type BackgroundOption } from "@/lib/background-plan";
import { resolveChoiceSelections, type ChoiceGroup } from "@/lib/choice-groups";

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
    rolePrompt?: string;
    backgroundAllocations?: Array<{ optionId: string; count: number }>;
    choiceSelections?: Array<{ groupId: string; optionId: string }>;
    storyAssets?: {
      costarRefs?: Array<{ storagePath: string; storageBucket: string; name?: string }>;
      groupPhotoRef?: { storagePath: string; storageBucket: string; name?: string };
      brandRefs?: Array<{ storagePath: string; storageBucket: string; placement?: string; name?: string }>;
    };
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

  const rawRolePrompt = typeof body.rolePrompt === "string" ? body.rolePrompt.trim().slice(0, 100) : null;
  const rolePrompt = rawRolePrompt || null;

  const storyAssets = body.storyAssets ?? null;
  const VALID_BRAND_PLACEMENTS = new Set(["everywhere", "background", "subtle"]);
  if (storyAssets) {
    for (const ref of storyAssets.costarRefs ?? []) {
      if (!ref.storagePath.startsWith(`${user.id}/`)) {
        return NextResponse.json({ error: "Invalid co-star image reference" }, { status: 400 });
      }
    }
    if (storyAssets.groupPhotoRef && !storyAssets.groupPhotoRef.storagePath.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: "Invalid group photo reference" }, { status: 400 });
    }
    for (const ref of storyAssets.brandRefs ?? []) {
      if (!ref.storagePath.startsWith(`${user.id}/`)) {
        return NextResponse.json({ error: "Invalid brand image reference" }, { status: 400 });
      }
      if (ref.placement && !VALID_BRAND_PLACEMENTS.has(ref.placement)) {
        return NextResponse.json({ error: "Invalid brand placement value" }, { status: 400 });
      }
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

  // Exchange rate — used to convert NGN prices to USD amounts for the gateway.
  // Safe fallback of 1600 prevents catastrophic overcharge if FX API is unavailable.
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
           c.paystack_subaccount_code AS cr_subaccount_paystack,
           c.flutterwave_subaccount_id AS cr_subaccount_flw
    FROM templates t
    LEFT JOIN creators c ON c.id = t.creator_id
    WHERE t.id = ${templateId} AND t.status = 'published'
  `;

  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  const isAdmin = isAdminEmail(user.email);

  if (!template.cr_subaccount_paystack && !template.cr_subaccount_flw && !isAdmin) {
    return NextResponse.json({ error: "Creator has not set up payouts yet" }, { status: 422 });
  }

  const VALID_TAGS = new Set(["OUTFIT", "HAIRSTYLE", "MAKEUP", "NAIL_DESIGN", "ACCESSORY", "BACKGROUND", "LIGHTING", "COLOR_GRADE", "WIG", "GOWN", "COLLAR_MALE", "COLLAR_FEMALE"]);
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

  // ── Background allocation ───────────────────────────────────────────────
  // Options only exist on templates whose category allows them (write-time gate),
  // and the resolved snapshot comes from the server-side template row.
  const templateBgOptions: BackgroundOption[] = Array.isArray(template.background_options)
    ? template.background_options
    : [];
  const { plan: backgroundPlan, error: bgError } =
    resolveBackgroundPlan(templateBgOptions, body.backgroundAllocations, buyerPackageSize);
  if (bgError) return NextResponse.json({ error: bgError }, { status: 400 });
  const bgOptionPaths = new Set(
    backgroundPlan ? templateBgOptions.map((o) => o.imagePath).filter(Boolean) as string[] : []
  );

  // ── Buyer choice groups (pick-one styling options) ─────────────────────────
  const templateGroups: ChoiceGroup[] = Array.isArray(template.option_groups)
    ? template.option_groups
    : [];
  const { selections: choiceSelections, error: choiceError } =
    resolveChoiceSelections(templateGroups, body.choiceSelections);
  if (choiceError) return NextResponse.json({ error: choiceError }, { status: 400 });
  // Exclude ALL group option images (chosen ones re-enter as dedicated refs below)
  // and the template's legacy single tagged image for any tag a group now covers.
  const groupOptionPaths = new Set(
    templateGroups.flatMap((g) => g.options.map((o) => o.imagePath)).filter(Boolean) as string[]
  );
  const groupCoveredTags = new Set(
    choiceSelections ? choiceSelections.selections.map((s) => s.tag) : []
  );

  const seenTaggedPaths = new Set<string>();
  const deduplicatedTaggedRefs = taggedRefs.filter((ref) => {
    if (seenTaggedPaths.has(ref.storagePath)) return false;
    seenTaggedPaths.add(ref.storagePath);
    // Background-option images travel via the plan, not as tagged refs (old clients may still send them)
    if (bgOptionPaths.has(ref.storagePath)) return false;
    if (groupOptionPaths.has(ref.storagePath)) return false;
    // A choice group supersedes the template's legacy single reference of that tag —
    // but only when the ref is a template image (buyer-uploaded replacements still win).
    if (groupCoveredTags.has(ref.tag) && templateImagePaths.has(ref.storagePath)) return false;
    return true;
  });

  const configRows = await sql`SELECT key, value FROM app_config WHERE key IN ('platform_fee_ngn', 'test_price_per_image_ngn')`;
  const configMap = new Map(configRows.map(r => [r.key as string, r.value as string]));
  let basePlatformFeeNgn = parseInt(configMap.get('platform_fee_ngn') ?? "15000", 10);

  const testPriceRaw = configMap.get('test_price_per_image_ngn');
  if (testPriceRaw) {
    const testPriceNgn = parseInt(testPriceRaw, 10);
    if (testPriceNgn > 0) {
      template.price_1_ngn = testPriceNgn;
      template.price_5_ngn = testPriceNgn * 5;
      template.price_ngn = testPriceNgn * 10;
      basePlatformFeeNgn = Math.max(10, Math.floor(testPriceNgn * 0.1));
    }
  }

  const platformFeeNgn = packagePrice(basePlatformFeeNgn, buyerPackageSize);

  const price10 = Number(template.price_ngn) || 0;
  const priceMap: Record<1 | 5 | 10, number | null> = {
    1: template.price_1_ngn != null ? Number(template.price_1_ngn) : (price10 ? Math.round(price10 * 0.12) : null),
    5: template.price_5_ngn != null ? Number(template.price_5_ngn) : (price10 ? Math.round(price10 * 0.60) : null),
    10: price10 || null,
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

  const amountNgn = buyerAmountNgn - couponDiscountNgn;
  const creatorPayoutNgn = buyerAmountNgn - platformFeeNgn;
  // Cap creator payout so the platform retains enough to cover gateway fees
  const estimatedGatewayFeeNgn = Math.min(Math.ceil(amountNgn * 0.015), 2000);
  const minPlatformNgn = estimatedGatewayFeeNgn + 50;
  const safeCreatorPayoutNgn = Math.max(0, Math.min(creatorPayoutNgn, amountNgn - minPlatformNgn));

  // Convert to the payment currency for the gateway abstraction layer.
  // Gateways receive values already in the correct currency (no FX inside gateways).
  const amountForGateway = payCurrency === "USD"
    ? parseFloat((amountNgn / usdToNgn).toFixed(2))
    : amountNgn;
  const creatorPayoutForGateway = safeCreatorPayoutNgn > 0
    ? (payCurrency === "USD"
        ? parseFloat((safeCreatorPayoutNgn / usdToNgn).toFixed(2))
        : safeCreatorPayoutNgn)
    : 0;

  const now = new Date();
  const shootId = crypto.randomUUID();

  // ── Create all DB records BEFORE calling any gateway ─────────────────────
  // This allows us to retry with Flutterwave on Paystack failure without
  // losing the shoot. Only roll back if BOTH gateways fail.
  const [shootRow] = await sql`
    INSERT INTO shoots
      (id, user_id, owner_email, mode, aspect_ratio, currency, package_size, status,
       progress, quote, identity_profile, shot_type, role_prompt, template_id, background_plan, choice_selections, created_at, updated_at)
    VALUES (
      ${shootId}, ${user.id}, ${user.email ?? ''}, ${template.shoot_mode ?? "advanced"},
      ${template.aspect_ratio ?? "4:5"}, ${payCurrency}, ${buyerPackageSize},
      'PENDING_PAYMENT', 0, ${JSON.stringify({ text: "", attribution: "" })}::jsonb,
      '', ${shotType}, ${rolePrompt}, ${templateId},
      ${backgroundPlan ? sql.json(backgroundPlan as unknown as Parameters<typeof sql.json>[0]) : null},
      ${choiceSelections ? sql.json(choiceSelections as unknown as Parameters<typeof sql.json>[0]) : null},
      ${now}, ${now}
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
    ...(storyAssets?.costarRefs ?? []).map((ref, i) => ({
      id: crypto.randomUUID(), shoot_id: shootId, user_id: user.id,
      purpose: "costar", tag: null, custom_name: null, note: null,
      name: ref.name ?? `costar-${i + 1}`, type: "image/jpeg", size: 1,
      storage_bucket: ref.storageBucket, storage_path: ref.storagePath, created_at: now,
    })),
    ...(storyAssets?.groupPhotoRef ? [{
      id: crypto.randomUUID(), shoot_id: shootId, user_id: user.id,
      purpose: "group_photo", tag: null, custom_name: null, note: null,
      name: storyAssets.groupPhotoRef.name ?? "group-photo", type: "image/jpeg", size: 1,
      storage_bucket: storyAssets.groupPhotoRef.storageBucket,
      storage_path: storyAssets.groupPhotoRef.storagePath, created_at: now,
    }] : []),
    ...(storyAssets?.brandRefs ?? []).map((ref, i) => ({
      id: crypto.randomUUID(), shoot_id: shootId, user_id: user.id,
      purpose: "brand", tag: null, custom_name: null, note: ref.placement ?? "everywhere",
      name: ref.name ?? `brand-${i + 1}`, type: "image/jpeg", size: 1,
      storage_bucket: ref.storageBucket, storage_path: ref.storagePath, created_at: now,
    })),
    // Photo background options — note carries the option id for generation-time lookup
    ...(backgroundPlan
      ? backgroundPlan.allocations
          .filter((a) => a.kind === "photo" && a.imagePath)
          .map((a, i) => ({
            id: crypto.randomUUID(), shoot_id: shootId, user_id: user.id,
            purpose: "background_option", tag: "BACKGROUND", custom_name: a.name, note: a.id,
            name: `background-${i + 1}`, type: "image/jpeg", size: 1,
            storage_bucket: a.imageBucket ?? "template-images", storage_path: a.imagePath!,
            created_at: now,
          }))
      : []),
    // Chosen choice-group photo options become ordinary tagged refs — the existing
    // per-tag consistency locks (OUTFIT, HAIRSTYLE, ...) handle the rest downstream.
    // A buyer's own uploaded replacement of the same tag wins over the group pick.
    ...(choiceSelections
      ? choiceSelections.selections
          .filter((s) => s.kind === "photo" && s.imagePath)
          // Single-instance tags defer to a buyer's own uploaded replacement;
          // ACCESSORY refs can coexist (e.g. chosen shoes + buyer's own jewelry).
          .filter((s) => s.tag === "ACCESSORY" || !deduplicatedTaggedRefs.some((r) => r.tag === s.tag))
          .map((s, i) => ({
            id: crypto.randomUUID(), shoot_id: shootId, user_id: user.id,
            purpose: "tagged", tag: s.tag, custom_name: s.name,
            note: s.description ?? null,
            name: `choice-${i + 1}`, type: "image/jpeg", size: 1,
            storage_bucket: s.imageBucket ?? "template-images", storage_path: s.imagePath!,
            created_at: now,
          }))
      : []),
  ];

  if (allRefs.length > 0) {
    const refInsertOk = await sql`INSERT INTO shoot_references ${sql(allRefs)}`.then(() => true).catch(() => false);
    if (!refInsertOk) {
      await sql`DELETE FROM shoot_images WHERE shoot_id = ${shootId}`;
      await sql`DELETE FROM shoots WHERE id = ${shootId}`;
      return NextResponse.json({ error: "Failed to save references" }, { status: 500 });
    }
  }

  // Admin bypass — queue immediately, no payment
  if (isAdmin) {
    await sql`UPDATE shoots SET status = 'QUEUED', updated_at = NOW() WHERE id = ${shootId} AND status = 'PENDING_PAYMENT'`;
    const siteUrl = SITE_URL;
    fetch(`${siteUrl}/api/shoots/${shootId}/start`, {
      method: "POST",
      headers: process.env.INTERNAL_API_SECRET ? { "x-internal-secret": process.env.INTERNAL_API_SECRET } : {},
      cache: "no-store",
    }).catch(console.error);
    return NextResponse.json({
      bypass: true,
      shootId,
      callbackUrl: `/marketplace/${templateId}/book/success?shoot_id=${shootId}`,
    });
  }

  const purchaseId = crypto.randomUUID();
  await sql`
    INSERT INTO template_purchases
      (id, template_id, shoot_id, user_id, amount_ngn, platform_fee_ngn, creator_payout_ngn,
       coupon_id, coupon_discount_ngn, currency, amount_usd,
       payment_provider, status, created_at)
    VALUES (
      ${purchaseId}, ${templateId}, ${shootId}, ${user.id}, ${amountNgn}, ${platformFeeNgn},
      ${creatorPayoutNgn}, ${couponId}, ${couponDiscountNgn}, ${payCurrency},
      ${payCurrency === "USD" ? parseFloat((amountNgn / usdToNgn).toFixed(2)) : null},
      'paystack', 'pending', ${now}
    )
  `;

  // ── Dual-gateway failover ─────────────────────────────────────────────────
  const gatewayParams: InitPaymentParams = {
    email: user.email!,
    amountNgn: amountForGateway,
    currency: payCurrency,
    metadata: {
      type: "template_purchase",
      template_id: templateId,
      purchase_id: purchaseId,
      shoot_id: shootId,
      user_id: user.id,
      coupon_id: couponId,
    },
    callbackUrl: `${SITE_URL}/marketplace/${templateId}/book/success?shoot_id=${shootId}`,
    creatorSubaccount:
      creatorPayoutForGateway > 0 && (template.cr_subaccount_paystack || template.cr_subaccount_flw)
        ? {
            paystackCode: template.cr_subaccount_paystack ?? undefined,
            flutterwaveId: template.cr_subaccount_flw ?? undefined,
            payoutNgn: creatorPayoutForGateway,
          }
        : undefined,
  };

  let paymentResult: InitPaymentResult | null = null;
  let paystackError: unknown = null;

  try {
    paymentResult = await initializePayment("paystack", gatewayParams);
  } catch (err) {
    paystackError = err;
    console.warn(`[book] Paystack failed for shoot ${shootId}:`, err instanceof Error ? err.message : String(err));

    try {
      paymentResult = await initializePayment("flutterwave", gatewayParams);
      // Update payment_provider since Flutterwave won the failover
      await sql`UPDATE template_purchases SET payment_provider = 'flutterwave' WHERE id = ${purchaseId}`;
    } catch (err2) {
      console.error(
        `[book][both-gateways-failed] shoot=${shootId} paystack=${paystackError instanceof Error ? paystackError.message : String(paystackError)} flutterwave=${err2 instanceof Error ? err2.message : String(err2)}`
      );
      // Both gateways failed — roll back all DB records so the user can retry cleanly
      await sql`DELETE FROM template_purchases WHERE id = ${purchaseId}`;
      await sql`DELETE FROM shoot_references WHERE shoot_id = ${shootId}`;
      await sql`DELETE FROM shoot_images WHERE shoot_id = ${shootId}`;
      await sql`DELETE FROM shoots WHERE id = ${shootId}`;
      return NextResponse.json(
        { error: "Payment processing is temporarily unavailable. Please try again in a few minutes." },
        { status: 503 }
      );
    }
  }

  // Store the winning gateway's reference
  await sql`
    UPDATE template_purchases
    SET paystack_reference = ${paymentResult.reference},
        provider_reference  = ${paymentResult.reference}
    WHERE id = ${purchaseId}
  `;

  return NextResponse.json({ authorizationUrl: paymentResult.authorizationUrl, shootId });
}
