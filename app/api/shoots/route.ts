import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import { ASPECTS } from "@/lib/types";

const ALLOWED_BUCKETS = new Set(["identity-images", "inspiration-images"]);
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

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: shoots } = await service
    .from("shoots")
    .select("*, shoot_images(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const hydrated = await Promise.all((shoots ?? []).map(async (shoot: Record<string, unknown>) => {
    const images = await Promise.all(((shoot.shoot_images as Record<string, unknown>[] | undefined) ?? []).map(async (img) => {
      if (img.preview_storage_bucket && img.preview_storage_path) {
        const { data } = await service.storage
          .from(img.preview_storage_bucket as string)
          .createSignedUrl(img.preview_storage_path as string, 3600);
        return { ...img, previewUrl: data?.signedUrl };
      }
      return img;
    }));
    return { ...shoot, shoot_images: images };
  }));

  return NextResponse.json({ shoots: hydrated });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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
    adminBypass = false,
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
    status: initialStatus,
    progress: 0,
    quote,
    created_at: now,
    updated_at: now,
  }).select().single();

  if (shootError) return NextResponse.json({ error: shootError.message }, { status: 500 });

  if (allRefs.length > 0) {
    await service.from("shoot_references").insert(
      allRefs.map((r) => ({
        id: crypto.randomUUID(),
        shoot_id: shootId,
        user_id: user.id,
        purpose: r.purpose,
        tag: r.tag ?? null,
        custom_name: r.customName ?? null,
        note: r.note ?? null,
        name: r.name,
        type: r.type,
        size: r.size,
        storage_bucket: r.storageBucket,
        storage_path: r.storagePath,
        created_at: now,
      }))
    );
  }

  // Create 10 image slot records
  const slots = Array.from({ length: 10 }, (_, i) => ({
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

  const { data: fullShoot } = await service
    .from("shoots")
    .select("*, shoot_images(*)")
    .eq("id", shootId)
    .single();

  return NextResponse.json({ shoot: fullShoot });
}
