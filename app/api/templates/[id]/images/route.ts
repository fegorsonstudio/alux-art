import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

const ALLOWED_PURPOSES = new Set(["inspiration", "tagged", "sample"]);
const ALLOWED_TAGS = new Set(["OUTFIT", "HAIRSTYLE", "MAKEUP", "NAIL_DESIGN", "BACKGROUND", "LIGHTING", "ACCESSORY", "COLOR_GRADE"]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: creator } = await service.from("creators").select("id").eq("user_id", user.id).single();
  if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });

  const { data: template } = await service
    .from("templates")
    .select("id")
    .eq("id", id)
    .eq("creator_id", creator.id)
    .single();
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const body = await request.json() as Record<string, unknown>;
  const { storagePath, displayOrder, purpose, tag, note, customName } = body;

  if (typeof storagePath !== "string" || !storagePath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "Invalid storage path" }, { status: 400 });
  }
  if (typeof purpose !== "string" || !ALLOWED_PURPOSES.has(purpose)) {
    return NextResponse.json({ error: "Invalid purpose" }, { status: 400 });
  }
  if (purpose === "tagged" && (typeof tag !== "string" || !ALLOWED_TAGS.has(tag))) {
    return NextResponse.json({ error: "Invalid tag for tagged image" }, { status: 400 });
  }

  // Enforce separate limits: 8 for workflow refs, 10 for sample gallery images
  const limitField = purpose === "sample" ? "sample" : "workflow";
  const purposeFilter = limitField === "sample"
    ? service.from("template_images").select("id", { count: "exact", head: true }).eq("template_id", id).eq("purpose", "sample")
    : service.from("template_images").select("id", { count: "exact", head: true }).eq("template_id", id).neq("purpose", "sample");
  const { count } = await purposeFilter;
  const maxAllowed = limitField === "sample" ? 10 : 8;
  if ((count ?? 0) >= maxAllowed) {
    return NextResponse.json({ error: `Maximum ${maxAllowed} ${limitField} images per template` }, { status: 400 });
  }

  const { data: image, error } = await service.from("template_images").insert({
    template_id: id,
    storage_path: storagePath,
    storage_bucket: "template-images",
    display_order: Number(displayOrder) || 0,
    purpose,
    tag: purpose === "tagged" ? tag : null,
    note: (typeof note === "string" && note.trim()) ? note.trim() : null,
    custom_name: (typeof customName === "string" && customName.trim()) ? customName.trim() : null,
    created_at: new Date().toISOString(),
  }).select().single();

  if (error) return NextResponse.json({ error: "Failed to add image" }, { status: 500 });
  return NextResponse.json({ image }, { status: 201 });
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
  const { imageId, tag, note, customName } = body;

  if (typeof imageId !== "string") return NextResponse.json({ error: "imageId required" }, { status: 400 });
  if (tag !== undefined && (typeof tag !== "string" || !ALLOWED_TAGS.has(tag as string))) {
    return NextResponse.json({ error: "Invalid tag" }, { status: 400 });
  }

  // Verify image belongs to this template and creator owns the template
  const { data: img } = await service
    .from("template_images")
    .select("id, template_id")
    .eq("id", imageId)
    .eq("template_id", id)
    .single();
  if (!img) return NextResponse.json({ error: "Image not found" }, { status: 404 });

  const { data: tmpl } = await service
    .from("templates")
    .select("id")
    .eq("id", img.template_id)
    .eq("creator_id", creator.id)
    .single();
  if (!tmpl) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const updates: Record<string, unknown> = {};
  if (tag !== undefined) updates.tag = tag;
  if (note !== undefined) updates.note = (typeof note === "string" && note.trim()) ? note.trim() : null;
  if (customName !== undefined) updates.custom_name = (typeof customName === "string" && customName.trim()) ? customName.trim() : null;

  if (Object.keys(updates).length === 0) return NextResponse.json({ ok: true });

  await service.from("template_images").update(updates).eq("id", imageId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: creator } = await service.from("creators").select("id").eq("user_id", user.id).single();
  if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });

  const body = await request.json() as { imageId?: string };
  if (typeof body.imageId !== "string") return NextResponse.json({ error: "imageId required" }, { status: 400 });

  const { data: img } = await service
    .from("template_images")
    .select("id, storage_path, template_id")
    .eq("id", body.imageId)
    .eq("template_id", id)
    .single();
  if (!img) return NextResponse.json({ error: "Image not found" }, { status: 404 });

  const { data: tmpl } = await service
    .from("templates")
    .select("id")
    .eq("id", img.template_id)
    .eq("creator_id", creator.id)
    .single();
  if (!tmpl) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await service.storage.from("template-images").remove([img.storage_path]);
  await service.from("template_images").delete().eq("id", body.imageId);

  return NextResponse.json({ ok: true });
}
