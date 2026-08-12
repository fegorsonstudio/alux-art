import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { ASPECTS, packagePrice } from "@/lib/types";
import { assetSheetAngle, assetKindById } from "@/lib/asset-extractor";
import { SITE_URL } from "@/lib/site-url";
import { isAdminEmail } from "@/lib/auth";
import { initializePayment } from "@/lib/payment-gateway";
import type { InitPaymentParams, InitPaymentResult } from "@/lib/payment-types";
import { resolveBackgroundPlan, type BackgroundOption } from "@/lib/background-plan";
import { resolveLightingPlan, type LightingLook } from "@/lib/lighting-plan";
import { resolveChoiceSelections, type ChoiceGroup } from "@/lib/choice-groups";
import { resalePlatformFee, resolveResaleSource } from "@/lib/resale";
import { sanitizeFlagText, type FlagShotConfig } from "@/lib/flag-shot";
import { sanitizeMugshotSelection, sanitizeBowlSelection, sanitizeNewsSelection, type TrendSlotsConfig, type TrendSlotsSelection } from "@/lib/trend-slots";
import { pickRandomPoseOptions, type PoseOption } from "@/lib/pose-options";
import { sanitizeInductionSelection, type InductionSelection } from "@/lib/nursing-induction";
import { sanitizeEnhanceSelection, CUSTOM_BACKDROP_ID, type EnhanceSelection } from "@/lib/gear-equalizer";
import { claimFreeBooking, releaseFreeBooking, recordFreeBooking, sponsorshipCovers, grantBalance, type SponsorFields } from "@/lib/free-access";

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
  const { data: { user: sessionUser }, error: authError } = await supabase.auth.getUser();

  // Normally a browser session. The WhatsApp bot has no session — its customer
  // is a phone number — so a server-to-server call may instead present the
  // internal secret plus the user it is acting for. Everything downstream is
  // unchanged and still keyed to user.id, including the checks that every
  // supplied storage path sits under `${user.id}/`, so a bot booking cannot
  // reach another person's photos any more than a browser one can.
  //
  // Deliberately strict: the secret must be configured AND presented AND match,
  // and the id must resolve to a real user. Any doubt falls through to 401.
  let user = sessionUser;
  if (!user) {
    const secret = process.env.INTERNAL_API_SECRET;
    const presented = request.headers.get("x-internal-secret");
    const actAs = request.headers.get("x-act-as-user");
    if (secret && presented === secret && actAs && /^[0-9a-f-]{36}$/i.test(actAs)) {
      // profiles, not auth.users: Supabase auth lives in Supabase cloud and
      // that schema is not reachable from this database at all. Querying it
      // threw, which turned a should-be-401 into a 500.
      const [row] = await sql<{ id: string; email: string | null; banned: boolean | null }[]>`
        SELECT id, email, banned FROM profiles WHERE id = ${actAs}`.catch(() => []);
      // Cast, not construct: only id and email are read downstream, and taking
      // the email from the database means an internal caller cannot claim to be
      // an admin by asserting one. A banned account is refused here too, the
      // same as it would be through the browser.
      if (row && !row.banned) user = { id: row.id, email: row.email ?? undefined } as typeof sessionUser;
    }
  }

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: templateId } = await params;
  const body = await request.json().catch(() => ({})) as {
    identityRefs?: RefInput[];
    taggedRefs?: TaggedRefInput[];
    poseRefs?: RefInput[];
    shotType?: string;
    aspectRatio?: string;   // photo upgrades only — the buyer keeps their own shape
    assetPicks?: Record<string, string[]>;   // asset extractor: photo path -> kind ids
    couponCode?: string;
    packageSize?: number;
    currency?: string;
    rolePrompt?: string;
    backgroundAllocations?: Array<{ optionId: string; count: number }>;
    choiceSelections?: Array<{ groupId: string; optionId: string; colorOverride?: string }>;
    // Manual lighting toggle (regular templates): buyer ticks one or more
    // lighting looks from the template's "lighting" choice group; they get
    // spread across the images. Absent/empty = AI-described lighting.
    manualLighting?: boolean;
    lightingOptionIds?: string[];
    induction?: { name?: string; titles?: string[]; year?: number; cap?: "grad" | "none" };
    enhance?: { lighting?: string; camera?: string; backdropOptionId?: string | null; lightingByPath?: Record<string, string>; customBackdrop?: { storagePath?: string; storageBucket?: string } };
    noSmile?: boolean;
    flagShot?: { enabled?: boolean; text?: string };
    trendSlots?: {
      mugshot?: { enabled?: boolean; name?: string; offense?: string; date?: string };
      bowl?: { enabled?: boolean; mode?: string };
      news?: { headline?: string; subtitle?: string; caption?: string };
    };
    bowlContentRef?: { storagePath?: string; storageBucket?: string };
    storyAssets?: {
      costarRefs?: Array<{ storagePath: string; storageBucket: string; name?: string }>;
      groupPhotoRef?: { storagePath: string; storageBucket: string; name?: string };
      brandRefs?: Array<{ storagePath: string; storageBucket: string; placement?: string; name?: string }>;
    };
  };

  const identityRefs: RefInput[] = body.identityRefs ?? [];
  // Slot plates (FLAG_SCENE, MUGSHOT_BOARD, BOWL_PROP) are attached server-side from the
  // template config — never accept them from the client.
  const SERVER_ONLY_TAGS = new Set(["FLAG_SCENE", "MUGSHOT_BOARD", "BOWL_PROP", "BOWL_CONTENT", "VIRAL_LOOK", "CO_STAR", "NEWS_FRAME"]);
  const taggedRefs: TaggedRefInput[] = (body.taggedRefs ?? []).filter((r) => !SERVER_ONLY_TAGS.has(r.tag));

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

  // What the buyer asked for. Which of these counts is legal depends on the
  // template, which is loaded further down, so the decision is made there.
  const requestedCount = Number(body.packageSize);
  const packagedSize: 1 | 5 | 10 = ([1, 5, 10] as const).includes(body.packageSize as 1 | 5 | 10)
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
    packagedSize === 1 && typeof body.shotType === "string" && VALID_SHOT_TYPES.has(body.shotType)
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
  // An imported template stores no looks of its own — they live on the source.
  // Resolve before ANY read of option_groups/background_options below.
  Object.assign(template, await resolveResaleSource(template, sql));
  const isAdmin = isAdminEmail(user.email);

  // Photo upgrades are priced PER IMAGE rather than in 1/5/10 packages: the buyer
  // brings however many photos they have and pays the single-image price for
  // each, up to ten. Everything else keeps the fixed packages.
  // Asset Extractor: the buyer ticks what to pull out of each photo. One ticked
  // kind is one image — a gown's front, back and side share a single sheet — so
  // the slot count is the number of ticks, never the photo count.
  const isAssetExtract = template.category === "asset_extract";
  const assetPlan: Array<{ sourcePath: string; kindId: string; angleId: string }> = [];
  if (isAssetExtract) {
    const picks = body.assetPicks && typeof body.assetPicks === "object" ? body.assetPicks : {};
    for (const [sourcePath, kindIds] of Object.entries(picks)) {
      if (typeof sourcePath !== "string" || !Array.isArray(kindIds)) continue;
      for (const kindId of kindIds) {
        const kind = typeof kindId === "string" ? assetKindById(kindId) : undefined;
        // Only image kinds occupy a generation slot; text recipes cost a vision
        // call and are handled separately.
        if (!kind || kind.output !== "image") continue;
        assetPlan.push({ sourcePath, kindId: kind.id, angleId: assetSheetAngle(kind).id });
      }
    }
    if (assetPlan.length === 0) {
      return NextResponse.json({ error: "Choose at least one thing to extract from your photos." }, { status: 400 });
    }
    if (assetPlan.length > 10) {
      return NextResponse.json(
        { error: `That selection makes ${assetPlan.length} assets — the most in one job is 10. Untick something or split it into two jobs.` },
        { status: 400 }
      );
    }
  }

  const perImagePricing = template.category === "photo_upgrade" || isAssetExtract;
  if (isAssetExtract) {
    const uploaded = new Set(identityRefs.map((r) => r.storagePath));
    const unknown = assetPlan.find((p) => !uploaded.has(p.sourcePath));
    if (identityRefs.length === 0) {
      return NextResponse.json({ error: "Upload at least one photo to extract from." }, { status: 400 });
    }
    if (unknown) {
      return NextResponse.json({ error: "One of the selections points at a photo that was not uploaded." }, { status: 400 });
    }
  }
  // Photo upgrades act on the buyer's own photograph, so the output shape is
  // theirs to choose — the creator's template ratio would re-crop a picture they
  // already framed. Every other template keeps the ratio its creator set.
  const requestedAspect = typeof body.aspectRatio === "string" ? body.aspectRatio : "";
  const shootAspectRatio = perImagePricing && requestedAspect in ASPECTS
    ? requestedAspect
    : (template.aspect_ratio ?? "4:5");
  const buyerPackageSize: number = isAssetExtract
    ? assetPlan.length
    : perImagePricing
      ? Math.min(10, Math.max(1, Number.isInteger(requestedCount) ? requestedCount : 1))
      : packagedSize;

  // A free booking (admin, sponsor-funded template, or an admin-granted credit)
  // never touches a payment gateway, so the creator's payout setup is irrelevant
  // to it. Checked without consuming anything — the actual claim happens below.
  const freeEligible = isAdmin
    || sponsorshipCovers(template as SponsorFields, buyerPackageSize)
    || (await grantBalance(user.email)) >= buyerPackageSize;

  if (!template.cr_subaccount_paystack && !template.cr_subaccount_flw && !freeEligible) {
    return NextResponse.json({ error: "Creator has not set up payouts yet" }, { status: 422 });
  }

  const VALID_TAGS = new Set(["OUTFIT", "HAIRSTYLE", "MAKEUP", "NAIL_DESIGN", "ACCESSORY", "BACKGROUND", "LIGHTING", "COLOR_GRADE", "WIG", "GOWN", "COLLAR_MALE", "COLLAR_FEMALE", "SASH", "SCRUBS", "SUIT"]);
  type TemplateImgMeta = { storage_path: string; storage_bucket?: string | null; tag?: string | null; purpose?: string; note?: string | null; custom_name?: string | null };

  const templateImgList = await sql`
    SELECT storage_path, storage_bucket, tag, purpose, note, custom_name
    FROM template_images WHERE template_id = ${templateId}
  ` as TemplateImgMeta[];

  const templateImagePaths = new Set(templateImgList.map((img) => img.storage_path));
  // Creator-attached co-star photos (story templates) — copied into the shoot as
  // purpose='costar' refs below so generation treats them like duo uploads.
  const templateCostarImgs = templateImgList
    .filter((img) => img.purpose === "tagged" && img.tag === "CO_STAR" && img.storage_path)
    .slice(0, 6);
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

  // ── Viral flag shot ─────────────────────────────────────────────────────────
  // Resolved before the background plan because it consumes one image slot that uses
  // the rooftop scene (no studio backdrop), so backgrounds only cover the rest.
  const templateFlagShot = (template.flag_shot ?? null) as FlagShotConfig | null;
  let flagShot: { enabled: true; text: string } | null = null;
  if (body.flagShot?.enabled && templateFlagShot?.enabled && templateFlagShot.imagePath) {
    const flagText = sanitizeFlagText(body.flagShot.text);
    if (flagText.length > 0) {
      flagShot = { enabled: true, text: flagText };
    }
  }

  const templatePoseOptions = (Array.isArray(template.pose_options) ? template.pose_options : []) as PoseOption[];

  // ── Trend slots (Trending category) ─────────────────────────────────────────
  // Mugshot is background-exempt (the height chart IS its background); bowl keeps
  // the buyer's chosen backdrop. The bowl needs the buyer's product/logo upload.
  const templateTrendSlots = (template.trend_slots ?? null) as TrendSlotsConfig | null;
  let trendMugshot = templateTrendSlots?.mugshot?.enabled && templateTrendSlots.mugshot.imagePath
    ? sanitizeMugshotSelection(body.trendSlots?.mugshot)
    : null;
  if (trendMugshot && !trendMugshot.date) {
    trendMugshot = { ...trendMugshot, date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) };
  }
  const bowlRef = body.bowlContentRef;
  const bowlRefValid = !!(bowlRef && typeof bowlRef.storagePath === "string" && bowlRef.storagePath.startsWith(`${user.id}/`));
  const trendBowl = templateTrendSlots?.bowl?.enabled && templateTrendSlots.bowl.imagePath && bowlRefValid
    ? sanitizeBowlSelection(body.trendSlots?.bowl)
    : null;
  // Viral chair pose: NOT buyer-optional — every booking of a template with the
  // plate configured gets it automatically.
  const trendViral = templateTrendSlots?.viral?.enabled && templateTrendSlots.viral.imagePath
    ? { enabled: true as const }
    : null;
  // News-broadcast still: forced-on when the template has it (like viral) but requires
  // the buyer's three typed lines. sanitizeNewsSelection returns null without them, so
  // the checkout blocks payment until headline + caption are filled.
  const trendNews = templateTrendSlots?.news?.enabled && templateTrendSlots.news.imagePath
    ? sanitizeNewsSelection(body.trendSlots?.news)
    : null;
  const trendSelection: TrendSlotsSelection | null = (trendMugshot || trendBowl || trendViral || trendNews)
    ? { mugshot: trendMugshot, bowl: trendBowl, viral: trendViral, news: trendNews }
    : null;

  // ── Induction personalization (nursing_induction category) ─────────────────
  // Name + credential titles + class year, rendered as embroidered sash/scrubs
  // text by the generation directives. Name is required — the sash is the
  // template's centerpiece and blank sashes read as broken output.
  let induction: InductionSelection | null = null;
  if (template.category === "nursing_induction") {
    induction = sanitizeInductionSelection(body.induction);
    if (!induction) {
      return NextResponse.json({ error: "Please enter the name for your sash" }, { status: 400 });
    }
  }

  // ── Gear Equalizer (photo_upgrade category) ─────────────────────────────────
  // The uploaded "identity" photos ARE the source photographs to upgrade — one
  // photo per package slot, upgraded with the clicked lighting + camera presets.
  let enhance: EnhanceSelection | null = null;
  // The extraction plan rides the same column — generate.ts reads it back per
  // category — so slot N is plan[N-1] no matter how the shoot is retried.
  let assetEnhance: { plan: typeof assetPlan } | null = isAssetExtract ? { plan: assetPlan } : null;
  if (template.category === "photo_upgrade") {
    if (identityRefs.length !== buyerPackageSize) {
      return NextResponse.json(
        { error: `Upload exactly ${buyerPackageSize} photo${buyerPackageSize === 1 ? "" : "s"} for the ${buyerPackageSize}-image package (you selected ${identityRefs.length}).` },
        { status: 400 }
      );
    }
    const backdropIds = new Set(
      (Array.isArray(template.background_options) ? template.background_options : [])
        .map((o: { id?: string }) => o.id)
        .filter(Boolean) as string[]
    );
    // Manual per-photo lighting looks (creator's "lighting" choice group). Snapshot
    // the hidden recipes server-side so the client never supplies the prompt text.
    const photoUpgradeLightingLooks = new Map<string, { name: string; directive: string }>(
      (Array.isArray(template.option_groups) ? template.option_groups as ChoiceGroup[] : [])
        .filter((g) => g.type === "lighting")
        .flatMap((g) => g.options)
        .filter((o) => o.kind === "prompt" && typeof o.description === "string" && o.description.trim().length > 0)
        .map((o) => [o.id, { name: o.name, directive: (o.description as string).trim() }])
    );
    enhance = sanitizeEnhanceSelection(body.enhance, backdropIds, photoUpgradeLightingLooks);
    if (!enhance) {
      return NextResponse.json({ error: "Pick a lighting style and a camera look for your upgrade" }, { status: 400 });
    }
    // A buyer-uploaded backdrop is a buyer-supplied storage path, so it obeys the
    // same rule as every other one on this route: it must live under their own
    // prefix. Without this a booking could name someone else's file and have it
    // rendered into their shoot.
    if (enhance.customBackdrop && !enhance.customBackdrop.storagePath.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: "Invalid backdrop image reference" }, { status: 400 });
    }
  }

  // Custom slots (flag, mugshot, bowl, viral, news) sit outside the backdrop distribution —
  // the buyer only places their normal portraits across backdrops.
  const bgSlotCount = buyerPackageSize - (flagShot ? 1 : 0) - (trendMugshot ? 1 : 0) - (trendBowl ? 1 : 0) - (trendViral ? 1 : 0) - (trendNews ? 1 : 0);

  // ── Signature poses (creator-uploaded pose mimicry) ─────────────────────────
  // Not buyer-chosen — the planner randomly picks one DISTINCT pose per normal
  // portrait slot (bgSlotCount), so no pose repeats within a shoot as long as
  // the creator's pool is at least that large. Selected poses become ordinary
  // purpose='pose' shoot_references, merged below with anything the buyer
  // separately uploaded — both flow through the same Group D pipeline.
  const selectedPoseOptions = pickRandomPoseOptions(templatePoseOptions, bgSlotCount);

  // ── Background allocation ───────────────────────────────────────────────
  // Options only exist on templates whose category allows them (write-time gate),
  // and the resolved snapshot comes from the server-side template row.
  const templateBgOptions: BackgroundOption[] = Array.isArray(template.background_options)
    ? template.background_options
    : [];
  // photo_upgrade has no per-slot backdrop distribution — its single optional swap
  // rides shoots.enhance; a default background plan here would attach a stray
  // background ref and junk background_plan JSONB.
  const { plan: backgroundPlan, error: bgError } = template.category === "photo_upgrade"
    ? { plan: null, error: undefined }
    : resolveBackgroundPlan(templateBgOptions, body.backgroundAllocations, bgSlotCount);
  if (bgError) return NextResponse.json({ error: bgError }, { status: 400 });
  const bgOptionPaths = new Set(
    backgroundPlan ? templateBgOptions.map((o) => o.imagePath).filter(Boolean) as string[] : []
  );

  // ── Buyer choice groups (pick-one styling options) ─────────────────────────
  const templateGroups: ChoiceGroup[] = Array.isArray(template.option_groups)
    ? template.option_groups
    : [];
  // Lighting is buyer-directed through its own manual-lighting picker (below) and
  // travels as lighting_plan, NOT as a generic styling selection — exclude it from
  // the choice-selection path so a lighting look can never double-apply.
  const nonLightingGroups = templateGroups.filter((g) => g.type !== "lighting");
  const { selections: choiceSelections, error: choiceError } =
    resolveChoiceSelections(nonLightingGroups, body.choiceSelections);
  if (choiceError) return NextResponse.json({ error: choiceError }, { status: 400 });

  // ── Manual lighting allocation (regular templates) ──────────────────────────
  // The creator's lighting looks are a "lighting" choice group of kind "prompt"
  // (name + hidden recipe in description). When the buyer turns on manual lighting
  // and ticks looks, snapshot the hidden recipes server-side (never trusted from
  // the client) and spread them across the portrait slots. photo_upgrade relights
  // per uploaded photo instead, so it never uses this whole-shoot plan.
  const lightingLooks: LightingLook[] = template.category === "photo_upgrade"
    ? []
    : templateGroups
        .filter((g) => g.type === "lighting")
        .flatMap((g) => g.options)
        .filter((o) => o.kind === "prompt" && typeof o.description === "string" && o.description.trim().length > 0)
        .map((o) => ({ id: o.id, name: o.name, directive: (o.description as string).trim() }));
  const lightingPlan = body.manualLighting === true
    ? resolveLightingPlan(lightingLooks, body.lightingOptionIds, bgSlotCount)
    : null;
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

  // Test pricing overrides every template's price. Requires BOTH the config row AND the
  // ENABLE_TEST_PRICING env flag — a stray DB row alone can never zero out live prices.
  const testPriceRaw = configMap.get('test_price_per_image_ngn');
  if (testPriceRaw && process.env.ENABLE_TEST_PRICING === "true") {
    const testPriceNgn = parseInt(testPriceRaw, 10);
    if (testPriceNgn > 0) {
      console.warn(`[book] TEST PRICING ACTIVE — template ${templateId} priced at ₦${testPriceNgn}/image`);
      template.price_1_ngn = testPriceNgn;
      template.price_5_ngn = testPriceNgn * 5;
      template.price_ngn = testPriceNgn * 10;
      basePlatformFeeNgn = Math.max(10, Math.floor(testPriceNgn * 0.1));
    }
  }

  const price10 = Number(template.price_ngn) || 0;
  const unitPriceNgn = template.price_1_ngn != null
    ? Number(template.price_1_ngn)
    : (price10 ? Math.round(price10 * 0.12) : 0);

  // Per-image: the fee and the price both scale with the actual photo count.
  //
  // A RESOLD template overrides all of that. The global fee is a share of a
  // creator's own pricing; an imported template is the studio's product being
  // sold on, so the studio takes a fixed amount per image and the creator keeps
  // what they priced above it. Without the override a ₦1,000 resale would pay
  // the creator ₦400 instead of the ₦200 the offer promises.
  const resaleFeeNgn = resalePlatformFee(template, buyerPackageSize);
  const platformFeeNgn = resaleFeeNgn ?? (perImagePricing
    ? Math.ceil(basePlatformFeeNgn * (buyerPackageSize / 10))
    : packagePrice(basePlatformFeeNgn, buyerPackageSize as 1 | 5 | 10));

  const priceMap: Record<1 | 5 | 10, number | null> = {
    1: unitPriceNgn || null,
    5: template.price_5_ngn != null ? Number(template.price_5_ngn) : (price10 ? Math.round(price10 * 0.60) : null),
    10: price10 || null,
  };
  const buyerAmountNgn: number | null = perImagePricing
    ? (unitPriceNgn ? unitPriceNgn * buyerPackageSize : null)
    : priceMap[buyerPackageSize as 1 | 5 | 10];
  if (!buyerAmountNgn) {
    return NextResponse.json({ error: "This package is not available for this template" }, { status: 422 });
  }

  // Admin-authored templates are exempt: the upgrade, relight and extraction
  // products are deliberately cheap and their margin is the studio's call. The
  // flag is recorded on the template because this route knows the BUYER's
  // identity, not the author's, and auth.users is unreachable from here.
  if (!template.platform_fee_exempt && buyerAmountNgn <= platformFeeNgn) {
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
       progress, quote, identity_profile, shot_type, role_prompt, template_id, background_plan, lighting_plan, choice_selections, flag_shot, trend_slots, induction, enhance, no_smile, created_at, updated_at)
    VALUES (
      ${shootId}, ${user.id}, ${user.email ?? ''}, ${template.shoot_mode ?? "advanced"},
      ${shootAspectRatio}, ${payCurrency}, ${buyerPackageSize},
      'PENDING_PAYMENT', 0, ${JSON.stringify({ text: "", attribution: "" })}::jsonb,
      '', ${shotType}, ${rolePrompt}, ${templateId},
      ${backgroundPlan ? sql.json(backgroundPlan as unknown as Parameters<typeof sql.json>[0]) : null},
      ${lightingPlan ? sql.json(lightingPlan as unknown as Parameters<typeof sql.json>[0]) : null},
      ${choiceSelections ? sql.json(choiceSelections as unknown as Parameters<typeof sql.json>[0]) : null},
      ${flagShot ? sql.json(flagShot as unknown as Parameters<typeof sql.json>[0]) : null},
      ${trendSelection ? sql.json(trendSelection as unknown as Parameters<typeof sql.json>[0]) : null},
      ${induction ? sql.json(induction as unknown as Parameters<typeof sql.json>[0]) : null},
      ${enhance ? sql.json(enhance as unknown as Parameters<typeof sql.json>[0]) : (assetEnhance ? sql.json(assetEnhance as unknown as Parameters<typeof sql.json>[0]) : null)},
      ${body.noSmile === true},
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
    // Creator-provided signature poses the buyer selected — same purpose='pose'
    // pipeline as a buyer's own upload above, just sourced from the template.
    ...selectedPoseOptions.map((p) => ({
      id: crypto.randomUUID(), shoot_id: shootId, user_id: user.id,
      purpose: "pose", tag: null, custom_name: p.name, note: p.description ?? null,
      name: p.name, type: "image/jpeg", size: 1,
      storage_bucket: p.imageBucket ?? "template-images", storage_path: p.imagePath,
      created_at: now,
    })),
    // Co-star references: creator-attached template CO_STAR photos take priority
    // (the template IS about that person); buyer duo uploads are the fallback.
    ...(templateCostarImgs.length > 0
      ? templateCostarImgs.map((img, i) => ({
          id: crypto.randomUUID(), shoot_id: shootId, user_id: user.id,
          purpose: "costar", tag: null, custom_name: null, note: null,
          name: `costar-${i + 1}`, type: "image/jpeg", size: 1,
          storage_bucket: img.storage_bucket ?? "template-images",
          storage_path: img.storage_path, created_at: now,
        }))
      : (storyAssets?.costarRefs ?? []).map((ref, i) => ({
          id: crypto.randomUUID(), shoot_id: shootId, user_id: user.id,
          purpose: "costar", tag: null, custom_name: null, note: null,
          name: ref.name ?? `costar-${i + 1}`, type: "image/jpeg", size: 1,
          storage_bucket: ref.storageBucket, storage_path: ref.storagePath, created_at: now,
        }))),
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
    // Gear Equalizer backdrop swap — the single chosen backdrop plate rides along
    // as a background_option ref (note = optionId) for the enhance pipeline.
    ...(enhance?.backdropOptionId
      ? templateBgOptions
          .filter((o) => o.id === enhance!.backdropOptionId && o.kind === "photo" && o.imagePath)
          .map((o) => ({
            id: crypto.randomUUID(), shoot_id: shootId, user_id: user.id,
            purpose: "background_option", tag: "BACKGROUND", custom_name: o.name, note: o.id,
            name: "enhance-backdrop", type: "image/jpeg", size: 1,
            storage_bucket: o.imageBucket ?? "template-images", storage_path: o.imagePath!,
            created_at: now,
          }))
      : []),
    // A backdrop the BUYER uploaded. Written exactly like a creator's plate so
    // generation needs no special case: it finds the row by note and attaches it
    // as IMAGE 2, where the existing per-crop scale rule takes over.
    ...(enhance?.backdropOptionId === CUSTOM_BACKDROP_ID && enhance.customBackdrop
      ? [{
          id: crypto.randomUUID(), shoot_id: shootId, user_id: user.id,
          purpose: "background_option", tag: "BACKGROUND",
          custom_name: "Your own backdrop", note: CUSTOM_BACKDROP_ID,
          name: "enhance-backdrop-custom", type: "image/jpeg", size: 1,
          storage_bucket: enhance.customBackdrop.storageBucket,
          storage_path: enhance.customBackdrop.storagePath,
          created_at: now,
        }]
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
    // Flag-shot plate — the empty-flag scene the model composites the subject onto.
    // Only attached when the buyer opted in and the template has a configured plate.
    ...(flagShot && templateFlagShot?.imagePath ? [{
      id: crypto.randomUUID(), shoot_id: shootId, user_id: user.id,
      purpose: "tagged", tag: "FLAG_SCENE", custom_name: "Flag scene", note: null,
      name: "flag-scene", type: "image/jpeg", size: 1,
      storage_bucket: templateFlagShot.imageBucket ?? "template-images",
      storage_path: templateFlagShot.imagePath, created_at: now,
    }] : []),
    // Trend-slot plates + the buyer's bowl content (product/logo upload)
    ...(trendMugshot && templateTrendSlots?.mugshot?.imagePath ? [{
      id: crypto.randomUUID(), shoot_id: shootId, user_id: user.id,
      purpose: "tagged", tag: "MUGSHOT_BOARD", custom_name: "Mugshot board", note: null,
      name: "mugshot-board", type: "image/jpeg", size: 1,
      storage_bucket: templateTrendSlots.mugshot.imageBucket ?? "template-images",
      storage_path: templateTrendSlots.mugshot.imagePath, created_at: now,
    }] : []),
    ...(trendBowl && templateTrendSlots?.bowl?.imagePath ? [{
      id: crypto.randomUUID(), shoot_id: shootId, user_id: user.id,
      purpose: "tagged", tag: "BOWL_PROP", custom_name: "Business bowl", note: null,
      name: "bowl-prop", type: "image/jpeg", size: 1,
      storage_bucket: templateTrendSlots.bowl.imageBucket ?? "template-images",
      storage_path: templateTrendSlots.bowl.imagePath, created_at: now,
    }] : []),
    ...(trendViral && templateTrendSlots?.viral?.imagePath ? [{
      id: crypto.randomUUID(), shoot_id: shootId, user_id: user.id,
      purpose: "tagged", tag: "VIRAL_LOOK", custom_name: "Viral chair pose", note: null,
      name: "viral-look", type: "image/jpeg", size: 1,
      storage_bucket: templateTrendSlots.viral.imageBucket ?? "template-images",
      storage_path: templateTrendSlots.viral.imagePath, created_at: now,
    }] : []),
    ...(trendNews && templateTrendSlots?.news?.imagePath ? [{
      id: crypto.randomUUID(), shoot_id: shootId, user_id: user.id,
      purpose: "tagged", tag: "NEWS_FRAME", custom_name: "News broadcast frame", note: null,
      name: "news-frame", type: "image/jpeg", size: 1,
      storage_bucket: templateTrendSlots.news.imageBucket ?? "template-images",
      storage_path: templateTrendSlots.news.imagePath, created_at: now,
    }] : []),
    ...(trendBowl && bowlRefValid ? [{
      id: crypto.randomUUID(), shoot_id: shootId, user_id: user.id,
      purpose: "tagged", tag: "BOWL_CONTENT",
      custom_name: trendBowl.mode === "logo" ? "Business logo" : "Business product", note: null,
      name: "bowl-content", type: "image/jpeg", size: 1,
      storage_bucket: bowlRef!.storageBucket ?? "identity-images",
      storage_path: bowlRef!.storagePath!, created_at: now,
    }] : []),
  ];

  if (allRefs.length > 0) {
    const refInsertOk = await sql`INSERT INTO shoot_references ${sql(allRefs)}`.then(() => true).catch(() => false);
    if (!refInsertOk) {
      await sql`DELETE FROM shoot_images WHERE shoot_id = ${shootId}`;
      await sql`DELETE FROM shoots WHERE id = ${shootId}`;
      return NextResponse.json({ error: "Failed to save references" }, { status: 500 });
    }
  }

  // Free booking — admin, a sponsor-funded template, or an admin-granted credit.
  // Queue immediately, no payment. The claim is atomic: if the sponsor's cap or
  // the grant ran out since the eligibility check above, this returns null and we
  // fall through to the normal paid flow.
  const freeClaim = await claimFreeBooking({
    userId: user.id,
    email: user.email,
    isAdmin,
    packageSize: buyerPackageSize,
    template: template as SponsorFields,
  });
  if (freeClaim) {
    const queued = await sql`
      UPDATE shoots SET status = 'QUEUED', updated_at = NOW()
      WHERE id = ${shootId} AND status = 'PENDING_PAYMENT' RETURNING id
    `;
    if (queued.length === 0) {
      // Someone else already moved this shoot — never keep the consumed credit.
      await releaseFreeBooking(freeClaim, { packageSize: buyerPackageSize, templateId });
      return NextResponse.json({ error: "Booking could not be started" }, { status: 409 });
    }

    // The creator still earns on a free booking. There is no gateway split to do
    // it automatically, so record the full (uncapped) payout as owed and settle
    // it by hand from the admin dashboard. The gateway-fee cap that produces
    // safeCreatorPayoutNgn does not apply when no gateway is involved.
    await recordFreeBooking({
      claim: freeClaim, shootId, userId: user.id, email: user.email,
      templateId, packageSize: buyerPackageSize, creatorPayoutNgn,
    });
    // Zero-amount purchase row so the creator's existing earnings query keeps
    // working unchanged; is_free lets revenue/sales counts exclude it.
    await sql`
      INSERT INTO template_purchases
        (id, template_id, shoot_id, user_id, amount_ngn, platform_fee_ngn, creator_payout_ngn,
         coupon_id, coupon_discount_ngn, currency, amount_usd,
         payment_provider, status, is_free, created_at)
      VALUES (
        ${crypto.randomUUID()}, ${templateId}, ${shootId}, ${user.id}, 0, 0,
        ${creatorPayoutNgn}, null, 0, ${payCurrency}, null,
        'free', 'success', true, ${now}
      )
    `.catch((err) => console.error("[book] free purchase row failed:", err));

    fetch(`${SITE_URL}/api/shoots/${shootId}/start`, {
      method: "POST",
      headers: process.env.INTERNAL_API_SECRET ? { "x-internal-secret": process.env.INTERNAL_API_SECRET } : {},
      cache: "no-store",
    }).catch(console.error);
    return NextResponse.json({
      bypass: true,
      shootId,
      free: true,
      freeSource: freeClaim.source,
      freeRemaining: freeClaim.remaining ?? null,
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
