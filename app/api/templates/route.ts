import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import { ASPECTS } from "@/lib/types";

const ALLOWED_CATEGORIES = new Set(["portrait", "editorial", "corporate", "glamour", "wedding", "maternity", "fantasy", "boudoir", "street", "other"]);
const ALLOWED_MODES = new Set(["fast", "advanced"]);

export async function GET() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: creator } = await service.from("creators").select("id").eq("user_id", user.id).single();
  if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });

  const { data: templates, error } = await service
    .from("templates")
    .select("*, template_images(id, display_order, purpose, tag)")
    .eq("creator_id", creator.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Failed to load templates" }, { status: 500 });
  return NextResponse.json({ templates: templates ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: creator } = await service.from("creators").select("id").eq("user_id", user.id).single();
  if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });

  const body = await request.json() as Record<string, unknown>;
  const { title, description, category, tags, priceNgn, shootMode, aspectRatio, packageSize } = body;

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
  if (!Number.isInteger(priceNgn) || (priceNgn as number) < 1000) {
    return NextResponse.json({ error: "Price must be at least ₦1,000" }, { status: 400 });
  }
  const pkg = [5, 10].includes(Number(packageSize)) ? Number(packageSize) : 10;
  const { coverStoragePath } = body;

  const now = new Date().toISOString();
  const { data: template, error } = await service.from("templates").insert({
    creator_id: creator.id,
    title: (title as string).trim(),
    description: typeof description === "string" ? description.trim() : null,
    category,
    tags: Array.isArray(tags) ? (tags as unknown[]).filter((t) => typeof t === "string").slice(0, 10) : [],
    price_ngn: priceNgn,
    shoot_mode: shootMode,
    aspect_ratio: aspectRatio,
    package_size: pkg,
    status: "draft",
    cover_storage_path: typeof coverStoragePath === "string" && coverStoragePath ? coverStoragePath : null,
    cover_bucket: "template-images",
    created_at: now,
    updated_at: now,
  }).select().single();

  if (error) return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
  return NextResponse.json({ template }, { status: 201 });
}
