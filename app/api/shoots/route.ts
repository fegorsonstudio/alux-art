import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import { ASPECTS, REFERENCE_TAGS, normalizePackageSize } from "@/lib/types";

const ALLOWED_BUCKETS = new Set(["identity-images", "inspiration-images"]);
const ALLOWED_TAGS = new Set<string>(REFERENCE_TAGS);
type ReferenceRecord = Record<string, unknown> & { purpose: string };

function isValidReference(ref: Record<string, unknown>, userId: string) {
  return typeof ref.id === "string" &&
    typeof ref.name === "string" &&
    typeof ref.type === "string" &&
    ref.type.startsWith("image/") &&
    typeof ref.size === "number" &&
    ref.size > 0 &&
    typeof ref.storageBucket === "string" &&
    ALLOWED_BUCKETS.has(ref.storageBucket) &&
    typeof ref.storagePath === "string" &&
    ref.storagePath.startsWith(`${userId}/`);
}

function normalizeTag(ref: ReferenceRecord) {
  const rawTag = typeof ref.tag === "string" ? ref.tag.trim() : "";
  const rawCustom = typeof ref.customName === "string" ? ref.customName.trim() : "";
  const normalized = rawTag.toUpperCase().replace(/\s+/g, "_");

  if (ALLOWED_TAGS.has(normalized)) {
    return { tag: normalized, customName: rawCustom || null };
  }

  return {
    tag: null,
    customName: rawCustom || rawTag || null,
  };
}

export async function GET() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: shoots } = await service
    .from("shoots")
    .select("*, shoot_images(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(25);

  return NextResponse.json({ shoots: shoots ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const {
    mode = "fast",
    aspectRatio = "4:5",
    currency = "NGN",
    identityImages = [],
    inspirationImages = [],
    taggedReferences = [],
    quote = { text: "", attribution: "" },
    packageSize: rawPackageSize = 10,
    adminBypass = false,
    characterBaseId = null,
  } = body;

  if (!Array.isArray(identityImages) || !Array.isArray(inspirationImages) || !Array.isArray(taggedReferences)) {
    return NextResponse.json({ error: "Invalid reference image metadata" }, { status: 400 });
  }
  if (identityImages.length < 3) {
    return NextResponse.json({ error: "At least 3 identity photos required" }, { status: 400 });
  }
  if (inspirationImages.length < 1) {
    return NextResponse.json({ error: "At least 1 inspiration photo required" }, { status: 400 });
  }
  if (!["fast", "advanced"].includes(mode)) {
    return NextResponse.json({ error: "Invalid shoot mode" }, { status: 400 });
  }
  if (!(aspectRatio in ASPECTS)) {
    return NextResponse.json({ error: "Invalid aspect ratio" }, { status: 400 });
  }
  if (!["NGN", "USD"].includes(currency)) {
    return NextResponse.json({ error: "Invalid currency" }, { status: 400 });
  }
  const packageSize = normalizePackageSize(rawPackageSize);

  const allRefs: ReferenceRecord[] = [
    ...identityImages.map((r: Record<string, unknown>) => ({ ...r, purpose: "identity" })),
    ...inspirationImages.map((r: Record<string, unknown>) => ({ ...r, purpose: "inspiration" })),
    ...taggedReferences.map((r: Record<string, unknown>) => ({ ...r, purpose: "tagged" })),
  ];

  if (!allRefs.every((ref) => isValidReference(ref, user.id))) {
    return NextResponse.json({ error: "Invalid reference image metadata" }, { status: 400 });
  }

  const service = createServiceClient();

  const referenceChecks = await Promise.all(allRefs.map(async (ref) => {
    const { data } = await service.storage
      .from(ref.storageBucket as string)
      .createSignedUrl(ref.storagePath as string, 60);
    return Boolean(data?.signedUrl);
  }));

  if (!referenceChecks.every(Boolean)) {
    return NextResponse.json({ error: "One or more selected reference images no longer exists. Refresh and choose saved images that still show previews." }, { status: 400 });
  }

  const isAdmin = user.email === process.env.ADMIN_EMAIL;

  // Validate saved character base if provided
  let resolvedBaseId: string | null = null;
  let baseIdentityProfile: string | null = null;
  if (characterBaseId && typeof characterBaseId === "string") {
    const { data: base } = await service
      .from("character_bases")
      .select("id, user_id, status, identity_profile, is_archived")
      .eq("id", characterBaseId)
      .single();
    if (!base || base.user_id !== user.id) {
      return NextResponse.json({ error: "Character base not found" }, { status: 400 });
    }
    if (!["AUTO_APPROVED", "USER_APPROVED"].includes(base.status) || base.is_archived) {
      return NextResponse.json({ error: "Character base is not approved or is archived" }, { status: 400 });
    }
    resolvedBaseId = base.id;
    baseIdentityProfile = base.identity_profile ?? null;
  }

  // Create shoot record
  const shootId = crypto.randomUUID();
  const now = new Date().toISOString();
  const initialStatus = (isAdmin && adminBypass) ? "QUEUED" : "PENDING_PAYMENT";

  const { data: shoot, error: shootError } = await service.from("shoots").insert({
    id: shootId,
    user_id: user.id,
    owner_email: user.email,
    mode,
    aspect_ratio: aspectRatio,
    currency,
    package_size: packageSize,
    status: initialStatus,
    progress: 0,
    quote,
    // Saved character base shortcut — skips Stages 1 and 1.5 entirely
    character_base_id: resolvedBaseId,
    base_lock_status: resolvedBaseId ? "USER_APPROVED" : null,
    identity_profile: baseIdentityProfile ?? "",
    created_at: now,
    updated_at: now,
  }).select().single();

  if (shootError) return NextResponse.json({ error: shootError.message }, { status: 500 });

  if (allRefs.length > 0) {
    const referenceRows = allRefs.map((r) => {
      const normalized = normalizeTag(r);
      return {
        id: crypto.randomUUID(),
        shoot_id: shootId,
        user_id: user.id,
        purpose: r.purpose,
        tag: normalized.tag,
        custom_name: normalized.customName,
        note: r.note ?? null,
        name: r.name,
        type: r.type,
        size: r.size,
        storage_bucket: r.storageBucket,
        storage_path: r.storagePath,
        created_at: now,
      };
    });
    const { error: referenceError } = await service.from("shoot_references").insert(referenceRows);
    if (referenceError) {
      await service.from("shoots").delete().eq("id", shootId);
      return NextResponse.json({ error: `Reference save failed: ${referenceError.message}` }, { status: 500 });
    }
  }

  // Create one slot per purchased package image.
  const slots = Array.from({ length: packageSize }, (_, i) => ({
    id: crypto.randomUUID(),
    shoot_id: shootId,
    user_id: user.id,
    slot: i + 1,
    kind: i < 8 ? "portrait" : i === 8 ? "mood" : "quote",
    status: "PENDING",
    created_at: now,
    updated_at: now,
  }));
  const { error: slotsError } = await service.from("shoot_images").insert(slots);
  if (slotsError) {
    await service.from("shoot_references").delete().eq("shoot_id", shootId);
    await service.from("shoots").delete().eq("id", shootId);
    return NextResponse.json({ error: `Image slot setup failed: ${slotsError.message}` }, { status: 500 });
  }

  const { data: fullShoot } = await service
    .from("shoots")
    .select("*, shoot_images(*)")
    .eq("id", shootId)
    .single();

  return NextResponse.json({ shoot: fullShoot });
}
