import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { r2Exists } from "@/lib/r2";
import { ASPECTS, REFERENCE_TAGS, normalizePackageSize } from "@/lib/types";
import sql from "@/lib/db";

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

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? "20"), 100);
  const cursor = searchParams.get("cursor");

  const shoots = cursor
    ? await sql`
        SELECT s.*, t.title AS template_title
        FROM shoots s
        LEFT JOIN templates t ON t.id = s.template_id
        WHERE s.user_id = ${user.id} AND s.created_at < ${cursor}
        ORDER BY s.created_at DESC
        LIMIT ${limit + 1}
      `
    : await sql`
        SELECT s.*, t.title AS template_title
        FROM shoots s
        LEFT JOIN templates t ON t.id = s.template_id
        WHERE s.user_id = ${user.id}
        ORDER BY s.created_at DESC
        LIMIT ${limit + 1}
      `;

  const rows = shoots.slice(0, limit);
  const nextCursor = shoots.length > limit ? rows[rows.length - 1]?.created_at : null;

  // Attach shoot_images for each shoot in one query
  if (rows.length > 0) {
    const shootIds = rows.map((s) => s.id);
    const allImages = await sql`
      SELECT * FROM shoot_images WHERE shoot_id = ANY(${shootIds}) ORDER BY shoot_id, slot
    `;
    const imagesByShoot: Record<string, unknown[]> = {};
    for (const img of allImages) {
      if (!imagesByShoot[img.shoot_id]) imagesByShoot[img.shoot_id] = [];
      imagesByShoot[img.shoot_id].push(img);
    }
    const rowsWithImages = rows.map((s) => ({
      ...s,
      shoot_images: imagesByShoot[s.id] ?? [],
    }));
    return NextResponse.json({ shoots: rowsWithImages, nextCursor });
  }

  return NextResponse.json({ shoots: rows, nextCursor });
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

  // Check references exist in R2
  const referenceChecks = await Promise.all(
    allRefs.map((ref) => r2Exists(ref.storageBucket as string, ref.storagePath as string))
  );
  if (!referenceChecks.every(Boolean)) {
    return NextResponse.json({ error: "One or more selected reference images no longer exists. Refresh and choose saved images that still show previews." }, { status: 400 });
  }

  const isAdmin = user.email === process.env.ADMIN_EMAIL;

  // Validate saved character base if provided
  let resolvedBaseId: string | null = null;
  let baseIdentityProfile: string | null = null;
  if (characterBaseId && typeof characterBaseId === "string") {
    const [base] = await sql`
      SELECT id, user_id, status, identity_profile, is_archived
      FROM character_bases WHERE id = ${characterBaseId}
    `;
    if (!base || base.user_id !== user.id) {
      return NextResponse.json({ error: "Character base not found" }, { status: 400 });
    }
    if (!["AUTO_APPROVED", "USER_APPROVED"].includes(base.status) || base.is_archived) {
      return NextResponse.json({ error: "Character base is not approved or is archived" }, { status: 400 });
    }
    resolvedBaseId = base.id;
    baseIdentityProfile = base.identity_profile ?? null;
  }

  const shootId = crypto.randomUUID();
  const now = new Date().toISOString();
  const initialStatus = (isAdmin && adminBypass) ? "QUEUED" : "PENDING_PAYMENT";

  const [shoot] = await sql`
    INSERT INTO shoots (
      id, user_id, owner_email, mode, aspect_ratio, currency, package_size,
      status, progress, quote, character_base_id, base_lock_status,
      identity_profile, created_at, updated_at
    ) VALUES (
      ${shootId}, ${user.id}, ${user.email ?? ""}, ${mode}, ${aspectRatio},
      ${currency}, ${packageSize}, ${initialStatus}, 0, ${JSON.stringify(quote)},
      ${resolvedBaseId}, ${resolvedBaseId ? "USER_APPROVED" : null},
      ${baseIdentityProfile ?? ""}, ${now}, ${now}
    ) RETURNING *
  `;

  if (!shoot) return NextResponse.json({ error: "Failed to create shoot" }, { status: 500 });

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
        note: (r.note as string | null) ?? null,
        name: r.name as string,
        type: r.type as string,
        size: r.size as number,
        storage_bucket: r.storageBucket as string,
        storage_path: r.storagePath as string,
        created_at: now,
      };
    });
    try {
      await sql`INSERT INTO shoot_references ${sql(referenceRows)}`;
    } catch (err) {
      await sql`DELETE FROM shoots WHERE id = ${shootId}`;
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `Reference save failed: ${msg}` }, { status: 500 });
    }
  }

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
  try {
    await sql`INSERT INTO shoot_images ${sql(slots)}`;
  } catch (err) {
    await sql`DELETE FROM shoot_references WHERE shoot_id = ${shootId}`;
    await sql`DELETE FROM shoots WHERE id = ${shootId}`;
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Image slot setup failed: ${msg}` }, { status: 500 });
  }

  const shoot_images = await sql`SELECT * FROM shoot_images WHERE shoot_id = ${shootId} ORDER BY slot`;
  return NextResponse.json({ shoot: { ...shoot, shoot_images } });
}
