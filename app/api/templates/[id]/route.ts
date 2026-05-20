import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import { ASPECTS, packagePrice } from "@/lib/types";

const ALLOWED_CATEGORIES = new Set(["portrait", "editorial", "corporate", "glamour", "wedding", "maternity", "fantasy", "boudoir", "street", "other"]);
const ALLOWED_MODES = new Set(["fast", "advanced"]);

async function getPlatformFee(service: ReturnType<typeof createServiceClient>): Promise<number> {
  const { data } = await service.from("app_config").select("value").eq("key", "platform_fee_ngn").single();
  return parseInt(data?.value ?? "15000", 10);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: creator } = await service.from("creators").select("id").eq("user_id", user.id).single();
  if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });

  const { data: template, error } = await service
    .from("templates")
    .select("*, template_images(*)")
    .eq("id", id)
    .eq("creator_id", creator.id)
    .single();

  if (error || !template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rawImages = (template.template_images ?? []) as Array<{
    id: string; storage_path: string; storage_bucket: string;
    display_order: number; purpose: string; tag?: string; created_at: string;
  }>;

  const imagesWithUrls = await Promise.all(
    rawImages
      .sort((a, b) => a.display_order - b.display_order)
      .map(async (img) => {
        const { data: s } = await service.storage
          .from(img.storage_bucket ?? "template-images")
          .createSignedUrl(img.storage_path, 3600);
        return { ...img, signed_url: s?.signedUrl ?? null };
      })
  );

  return NextResponse.json({ template: { ...template, template_images: imagesWithUrls } });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: creator } = await service.from("creators").select("id").eq("user_id", user.id).single();
  if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });

  const body = await request.json() as Record<string, unknown>;
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  const platformFeeNgn = await getPlatformFee(service);

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

  const { data: template, error } = await service
    .from("templates")
    .update(updates)
    .eq("id", id)
    .eq("creator_id", creator.id)
    .select()
    .single();

  if (error || !template) return NextResponse.json({ error: "Update failed" }, { status: 500 });
  return NextResponse.json({ template });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: creator } = await service.from("creators").select("id").eq("user_id", user.id).single();
  if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });

  const { count } = await service
    .from("template_purchases")
    .select("id", { count: "exact", head: true })
    .eq("template_id", id)
    .eq("status", "success");

  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: "Cannot delete a template with completed purchases" }, { status: 409 });
  }

  const { error } = await service
    .from("templates")
    .delete()
    .eq("id", id)
    .eq("creator_id", creator.id);

  if (error) return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
