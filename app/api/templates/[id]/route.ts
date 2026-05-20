import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import { ASPECTS } from "@/lib/types";

const ALLOWED_CATEGORIES = new Set(["portrait", "editorial", "corporate", "glamour", "wedding", "maternity", "fantasy", "boudoir", "street", "other"]);
const ALLOWED_MODES = new Set(["fast", "advanced"]);

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
  return NextResponse.json({ template });
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

  if (typeof body.title === "string" && body.title.trim().length >= 2) updates.title = body.title.trim();
  if (typeof body.description === "string") updates.description = body.description.trim();
  if (typeof body.category === "string" && ALLOWED_CATEGORIES.has(body.category)) updates.category = body.category;
  if (typeof body.shootMode === "string" && ALLOWED_MODES.has(body.shootMode)) updates.shoot_mode = body.shootMode;
  if (typeof body.aspectRatio === "string" && body.aspectRatio in ASPECTS) updates.aspect_ratio = body.aspectRatio;
  if (Number.isInteger(body.priceNgn) && (body.priceNgn as number) >= 1000) updates.price_ngn = body.priceNgn;
  if ([1, 5, 10].includes(Number(body.packageSize))) updates.package_size = Number(body.packageSize);
  if (Array.isArray(body.tags)) updates.tags = (body.tags as unknown[]).filter((t) => typeof t === "string").slice(0, 10);
  if (body.status === "published" || body.status === "draft") updates.status = body.status;
  if (typeof body.coverStoragePath === "string") updates.cover_storage_path = body.coverStoragePath;

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
