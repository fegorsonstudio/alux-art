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
  const { storagePath, displayOrder, purpose, tag, note, customName, noteHidden } = body;

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
  const maxAllowed = limitField === "sample" ? 10 : 20;
  if ((count ?? 0) >= maxAllowed) {
    return NextResponse.json({ error: `Maximum ${maxAllowed} ${limitField} images per template` }, { status: 400 });
  }

  const noteVal = (typeof note === "string" && note.trim()) ? note.trim() : null;
  const customNameVal = (typeof customName === "string" && customName.trim()) ? customName.trim() : null;

  // Build insert object without optional columns when null, so a missing migration
  // (e.g. 016_template_images_custom_name) doesn't cause every insert to fail.
  const insertRow: Record<string, unknown> = {
    template_id: id,
    storage_path: storagePath,
    storage_bucket: "template-images",
    display_order: Number(displayOrder) || 0,
    purpose,
    tag: purpose === "tagged" ? tag : null,
    created_at: new Date().toISOString(),
  };
  if (noteVal !== null) insertRow.note = noteVal;
  if (customNameVal !== null) insertRow.custom_name = customNameVal;
  if (noteHidden === true) insertRow.note_hidden = true;

  let { data: image, error } = await service.from("template_images").insert(insertRow).select().single();
  if (error && insertRow.note_hidden !== undefined) {
    // note_hidden column may not exist yet — retry without it
    const { note_hidden: _nh, ...insertRowCore } = insertRow;
    ({ data: image, error } = await service.from("template_images").insert(insertRowCore).select().single());
  }

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
  const { imageId, tag, note, customName, noteHidden } = body;

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
  if (noteHidden !== undefined) updates.note_hidden = noteHidden === true;

  if (Object.keys(updates).length === 0) return NextResponse.json({ ok: true });

  const { error: updateErr } = await service.from("template_images").update(updates).eq("id", imageId);
  if (updateErr && updates.note_hidden !== undefined) {
    // note_hidden column may not exist yet — retry without it so other fields still save
    const { note_hidden: _nh, ...updatesCore } = updates;
    if (Object.keys(updatesCore).length > 0) {
      await service.from("template_images").update(updatesCore).eq("id", imageId);
    }
  }
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

  const body = await request.json() as { imageId?: string; clearAll?: boolean };

  // clearAll=true wipes every workflow ref (tagged + inspiration) for this template
  if (body.clearAll === true) {
    const { data: tmpl } = await service
      .from("templates")
      .select("id")
      .eq("id", id)
      .eq("creator_id", creator.id)
      .single();
    if (!tmpl) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data: allRefs } = await service
      .from("template_images")
      .select("id, storage_path")
      .eq("template_id", id)
      .in("purpose", ["tagged", "inspiration"]);

    if (allRefs && allRefs.length > 0) {
      const paths = allRefs.map(r => r.storage_path).filter(Boolean);
      if (paths.length > 0) await service.storage.from("template-images").remove(paths);
      const ids = allRefs.map(r => r.id);
      await service.from("template_images").delete().in("id", ids);
    }
    return NextResponse.json({ ok: true, deleted: allRefs?.length ?? 0 });
  }

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
