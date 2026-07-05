import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { ASPECTS, packagePrice } from "@/lib/types";
import { r2ProxyUrl } from "@/lib/r2";

const ALLOWED_CATEGORIES = new Set(["portrait", "editorial", "corporate", "glamour", "wedding", "maternity", "fantasy", "boudoir", "street", "call_to_bar", "other"]);
const ALLOWED_MODES = new Set(["fast", "advanced"]);
const ALLOWED_STORY_TYPES = new Set(["solo", "duo", "group", "brand", "group_brand"]);

async function getPlatformFee(): Promise<number> {
  const [row] = await sql`SELECT value FROM app_config WHERE key = 'platform_fee_ngn'`;
  return parseInt(row?.value ?? "15000", 10);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [creator] = await sql`SELECT id FROM creators WHERE user_id = ${user.id}`;
  if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });

  const [template] = await sql`
    SELECT * FROM templates WHERE id = ${id} AND creator_id = ${creator.id}
  `;
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rawImages = await sql`
    SELECT * FROM template_images WHERE template_id = ${id} ORDER BY display_order ASC
  `;

  const imagesWithUrls = rawImages.map((img) => ({
    ...img,
    signed_url: img.storage_path
      ? r2ProxyUrl((img.storage_bucket ?? "template-images") as string, img.storage_path as string)
      : null,
  }));

  return NextResponse.json({ template: { ...template, template_images: imagesWithUrls } });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [creator] = await sql`SELECT id FROM creators WHERE user_id = ${user.id}`;
  if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });

  const body = await request.json() as Record<string, unknown>;
  const platformFeeNgn = await getPlatformFee();
  const updates: Record<string, unknown> = { updated_at: new Date() };

  if (typeof body.title === "string" && body.title.trim().length >= 2) updates.title = body.title.trim();
  if (typeof body.description === "string") updates.description = body.description.trim();
  if (typeof body.category === "string" && ALLOWED_CATEGORIES.has(body.category)) updates.category = body.category;
  if (typeof body.shootMode === "string" && ALLOWED_MODES.has(body.shootMode)) updates.shoot_mode = body.shootMode;
  if (typeof body.aspectRatio === "string" && body.aspectRatio in ASPECTS) updates.aspect_ratio = body.aspectRatio;
  if (Number.isInteger(body.priceNgn) && (body.priceNgn as number) > platformFeeNgn) updates.price_ngn = body.priceNgn;
  if (Number.isInteger(body.price1Ngn) && (body.price1Ngn as number) > packagePrice(platformFeeNgn, 1)) updates.price_1_ngn = body.price1Ngn;
  if (body.price1Ngn === null) updates.price_1_ngn = null;
  if (Number.isInteger(body.price5Ngn) && (body.price5Ngn as number) > packagePrice(platformFeeNgn, 5)) updates.price_5_ngn = body.price5Ngn;
  if (body.price5Ngn === null) updates.price_5_ngn = null;
  if ([1, 5, 10].includes(Number(body.packageSize))) updates.package_size = Number(body.packageSize);
  if (Array.isArray(body.tags)) updates.tags = (body.tags as unknown[]).filter((t) => typeof t === "string").slice(0, 10);
  if (body.status === "published" || body.status === "draft") updates.status = body.status;
  if (typeof body.coverStoragePath === "string") {
    updates.cover_storage_path = body.coverStoragePath;
    updates.cover_bucket = "template-images";
  }
  if (typeof body.isStory === "boolean") updates.is_story = body.isStory;
  if (typeof body.storyType === "string" && ALLOWED_STORY_TYPES.has(body.storyType)) updates.story_type = body.storyType;
  if (body.storyType === null) updates.story_type = null;
  if (typeof body.defaultRole === "string") updates.default_role = body.defaultRole.trim().slice(0, 100) || null;
  if (Array.isArray(body.roleChips)) updates.role_chips = (body.roleChips as unknown[]).filter(c => typeof c === "string").slice(0, 6);
  const scenesArray = Array.isArray(body.scenes) ? body.scenes : null;
  const scenesClause = scenesArray !== null ? sql`, scenes = ${sql.json(scenesArray as any)}` : sql``;

  const [template] = await sql`
    UPDATE templates SET ${sql(updates)}${scenesClause}
    WHERE id = ${id} AND creator_id = ${creator.id} RETURNING *
  `.catch(() => [null]);

  if (!template) return NextResponse.json({ error: "Update failed" }, { status: 500 });
  return NextResponse.json({ template });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [creator] = await sql`SELECT id FROM creators WHERE user_id = ${user.id}`;
  if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });

  const purchases = await sql`
    SELECT user_id FROM template_purchases
    WHERE template_id = ${id} AND status = 'success'
  `;

  const externalPurchases = purchases.filter((p) => p.user_id !== user.id);
  if (externalPurchases.length > 0) {
    return NextResponse.json({ error: "Cannot delete a template that has been purchased by other users" }, { status: 409 });
  }

  await sql`DELETE FROM templates WHERE id = ${id} AND creator_id = ${creator.id}`;
  return NextResponse.json({ ok: true });
}
