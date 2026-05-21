import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: templateId } = await params;
  const body = await request.json().catch(() => ({})) as { shootImageId?: string };

  if (!body.shootImageId || typeof body.shootImageId !== "string") {
    return NextResponse.json({ error: "shootImageId required" }, { status: 400 });
  }

  const service = createServiceClient();

  // Verify creator owns this template
  const { data: creator } = await service
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });

  const { data: template } = await service
    .from("templates")
    .select("id, cover_storage_path")
    .eq("id", templateId)
    .eq("creator_id", creator.id)
    .single();

  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  // Fetch the shoot image (must be COMPLETE and owned by this user)
  const { data: shootImage } = await service
    .from("shoot_images")
    .select("id, shoot_id, slot, status, fal_url, preview_storage_path, preview_storage_bucket")
    .eq("id", body.shootImageId)
    .eq("user_id", user.id)
    .eq("status", "COMPLETE")
    .single();

  if (!shootImage) return NextResponse.json({ error: "Image not found or not complete" }, { status: 404 });

  // Verify the shoot is a showcase shoot for this template
  const { data: shoot } = await service
    .from("shoots")
    .select("id, template_showcase_id")
    .eq("id", shootImage.shoot_id)
    .eq("user_id", user.id)
    .single();

  if (!shoot || shoot.template_showcase_id !== templateId) {
    return NextResponse.json({ error: "Image does not belong to a showcase for this template" }, { status: 403 });
  }

  // Resolve source URL: fal CDN first, then signed URL from storage
  let sourceUrl: string | null = (shootImage as Record<string, unknown>).fal_url as string | null ?? null;
  if (!sourceUrl) {
    const previewPath = (shootImage as Record<string, unknown>).preview_storage_path as string | null;
    const previewBucket = (shootImage as Record<string, unknown>).preview_storage_bucket as string | null;
    if (previewPath) {
      const { data: signed } = await service.storage
        .from(previewBucket ?? "shoot-images")
        .createSignedUrl(previewPath, 300);
      sourceUrl = signed?.signedUrl ?? null;
    }
  }
  if (!sourceUrl) return NextResponse.json({ error: "No image URL available" }, { status: 422 });

  // Download the image from fal CDN
  const imgRes = await fetch(sourceUrl);
  if (!imgRes.ok) return NextResponse.json({ error: "Failed to fetch image from source" }, { status: 502 });

  const imgBuffer = await imgRes.arrayBuffer();
  const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
  const ext = contentType.includes("png") ? "png" : "jpg";

  // Upload to template-images bucket
  const destPath = `${user.id}/${templateId}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadErr } = await service.storage
    .from("template-images")
    .upload(destPath, imgBuffer, { contentType, upsert: false });

  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

  const now = new Date().toISOString();

  // Count existing gallery images for display_order
  const { count } = await service
    .from("template_images")
    .select("*", { count: "exact", head: true })
    .eq("template_id", templateId);

  const displayOrder = count ?? 0;

  // Insert template_images row
  const newImageId = crypto.randomUUID();
  const { error: insertErr } = await service.from("template_images").insert({
    id: newImageId,
    template_id: templateId,
    storage_path: destPath,
    storage_bucket: "template-images",
    display_order: displayOrder,
    purpose: "inspiration",
    tag: null,
    created_at: now,
  });

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  // Auto-set as cover if none exists yet
  if (!template.cover_storage_path) {
    await service.from("templates")
      .update({ cover_storage_path: destPath, cover_bucket: "template-images", updated_at: now })
      .eq("id", templateId);
  }

  // Return signed URL for immediate display
  const { data: signed } = await service.storage
    .from("template-images")
    .createSignedUrl(destPath, 3600);

  return NextResponse.json({
    image: {
      id: newImageId,
      storagePath: destPath,
      storageBucket: "template-images",
      displayOrder,
      purpose: "inspiration",
      url: signed?.signedUrl ?? null,
    },
  });
}
