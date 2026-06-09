import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { ASPECTS, packagePrice } from "@/lib/types";

const ALLOWED_CATEGORIES = new Set(["portrait", "editorial", "corporate", "glamour", "wedding", "maternity", "fantasy", "boudoir", "street", "other"]);
const ALLOWED_MODES = new Set(["fast", "advanced"]);
const ALLOWED_STORY_TYPES = new Set(["solo", "duo", "group", "brand", "group_brand", "director"]);

async function getPlatformFee(): Promise<number> {
  const [row] = await sql`SELECT value FROM app_config WHERE key = 'platform_fee_ngn'`;
  return parseInt(row?.value ?? "15000", 10);
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [creator] = await sql`SELECT id FROM creators WHERE user_id = ${user.id}`;
  if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });

  const templates = await sql`SELECT * FROM templates WHERE creator_id = ${creator.id} ORDER BY created_at DESC`;

  const templateIds = templates.map((t) => t.id as string);
  const images: Record<string, unknown>[] = templateIds.length
    ? await sql`SELECT id, template_id, display_order, purpose, tag FROM template_images WHERE template_id = ANY(${templateIds})`
    : [];

  const imagesByTemplate: Record<string, Record<string, unknown>[]> = {};
  for (const img of images) {
    if (!imagesByTemplate[img.template_id as string]) imagesByTemplate[img.template_id as string] = [];
    imagesByTemplate[img.template_id as string].push(img);
  }

  return NextResponse.json({
    templates: templates.map((t) => ({ ...t, template_images: imagesByTemplate[t.id as string] ?? [] })),
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [creator] = await sql`SELECT id FROM creators WHERE user_id = ${user.id}`;
  if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });

  const body = await request.json() as Record<string, unknown>;
  const { title, description, category, tags, priceNgn, price1Ngn, price5Ngn, shootMode, aspectRatio, packageSize } = body;

  if (typeof title !== "string" || title.trim().length < 2) {
    return NextResponse.json({ error: "Title is required (min 2 characters)" }, { status: 400 });
  }
  if (typeof category !== "string" || !ALLOWED_CATEGORIES.has(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }
  if (typeof shootMode !== "string" || !ALLOWED_MODES.has(shootMode)) {
    return NextResponse.json({ error: "Invalid shoot mode" }, { status: 400 });
  }
  if (typeof aspectRatio !== "string" || !(aspectRatio in ASPECTS)) {
    return NextResponse.json({ error: "Invalid aspect ratio" }, { status: 400 });
  }

  const platformFeeNgn = await getPlatformFee();

  if (!Number.isInteger(priceNgn) || (priceNgn as number) <= platformFeeNgn) {
    return NextResponse.json({ error: `10-image price must be more than ₦${platformFeeNgn.toLocaleString()} (the platform fee)` }, { status: 400 });
  }
  if (price1Ngn !== undefined && price1Ngn !== null) {
    if (!Number.isInteger(price1Ngn) || (price1Ngn as number) <= packagePrice(platformFeeNgn, 1)) {
      return NextResponse.json({ error: `1-image price must be more than ₦${packagePrice(platformFeeNgn, 1).toLocaleString()}` }, { status: 400 });
    }
  }
  if (price5Ngn !== undefined && price5Ngn !== null) {
    if (!Number.isInteger(price5Ngn) || (price5Ngn as number) <= packagePrice(platformFeeNgn, 5)) {
      return NextResponse.json({ error: `5-image price must be more than ₦${packagePrice(platformFeeNgn, 5).toLocaleString()}` }, { status: 400 });
    }
  }

  const pkg = [1, 5, 10].includes(Number(packageSize)) ? Number(packageSize) : 10;
  const { coverStoragePath, isStory, storyType, defaultRole, roleChips, scenes, directorPrompt } = body;
  const safeIsStory = isStory === true;
  const safeStoryType = typeof storyType === "string" && ALLOWED_STORY_TYPES.has(storyType) ? storyType : null;
  const safeDefaultRole = typeof defaultRole === "string" ? defaultRole.trim().slice(0, 100) || null : null;
  const safeRoleChips = Array.isArray(roleChips) ? (roleChips as unknown[]).filter(c => typeof c === "string").slice(0, 6) : [];
  const safeScenes = Array.isArray(scenes) ? scenes : [];
  const safeDirectorPrompt = typeof directorPrompt === "string" ? directorPrompt.trim().slice(0, 20000) || null : null;

  const [template] = await sql`
    INSERT INTO templates
      (creator_id, title, description, category, tags, price_ngn, price_1_ngn, price_5_ngn,
       shoot_mode, aspect_ratio, package_size, status, cover_storage_path, cover_bucket,
       is_story, story_type, default_role, role_chips, scenes, director_prompt,
       created_at, updated_at)
    VALUES (
      ${creator.id},
      ${(title as string).trim()},
      ${typeof description === "string" ? description.trim() : null},
      ${category}, ${(Array.isArray(tags) ? (tags as unknown[]).filter((t) => typeof t === "string").slice(0, 10) : []) as string[]},
      ${priceNgn as number},
      ${(price1Ngn != null && Number.isInteger(price1Ngn)) ? price1Ngn as number : null},
      ${(price5Ngn != null && Number.isInteger(price5Ngn)) ? price5Ngn as number : null},
      ${shootMode}, ${aspectRatio}, ${pkg},
      ${(body.status === "published" || body.status === "draft") ? body.status as string : "draft"},
      ${typeof coverStoragePath === "string" && coverStoragePath ? coverStoragePath : null},
      'template-images',
      ${safeIsStory}, ${safeStoryType}, ${safeDefaultRole},
      ${safeRoleChips as string[]}, ${sql.json(safeScenes)}, ${safeDirectorPrompt},
      NOW(), NOW()
    )
    RETURNING *
  `.catch((err) => { console.error("[templates POST]", err); return [null]; });

  if (!template) return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
  return NextResponse.json({ template }, { status: 201 });
}
