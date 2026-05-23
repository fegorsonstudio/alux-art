import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: shootId } = await params;

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();

  const { data: creator } = await service
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });

  // Fetch shoot with references — must belong to this user
  const { data: shoot } = await service
    .from("shoots")
    .select("*, shoot_references(*)")
    .eq("id", shootId)
    .eq("user_id", user.id)
    .single();

  if (!shoot) return NextResponse.json({ error: "Shoot not found" }, { status: 404 });
  if (shoot.status !== "COMPLETE") {
    return NextResponse.json({ error: "Shoot must be complete before turning into a template" }, { status: 422 });
  }

  const now = new Date().toISOString();

  // Create a draft template using the shoot's configuration
  const { data: template, error: tmplErr } = await service.from("templates").insert({
    creator_id: creator.id,
    title: "Untitled Template",
    description: "",
    category: "portrait",
    tags: [],
    shoot_mode: shoot.mode ?? "advanced",
    aspect_ratio: shoot.aspect_ratio ?? "4:5",
    package_size: shoot.package_size ?? 10,
    price_ngn: 0,
    status: "draft",
    cover_storage_path: null,
    cover_bucket: "template-images",
    created_at: now,
    updated_at: now,
  }).select().single();

  if (tmplErr || !template) {
    console.error("[to-template] insert error:", tmplErr?.message, tmplErr?.details, tmplErr?.hint);
    return NextResponse.json({ error: tmplErr?.message ?? "Failed to create template" }, { status: 500 });
  }

  // Copy inspiration + tagged references into template-images bucket
  type RefRow = {
    purpose: string;
    tag: string | null;
    custom_name: string | null;
    note: string | null;
    type: string | null;
    storage_bucket: string;
    storage_path: string;
  };

  const refs = ((shoot.shoot_references ?? []) as RefRow[]).filter(r => r.purpose !== "identity");

  for (let i = 0; i < refs.length; i++) {
    const ref = refs[i];

    // Sign a short-lived URL from the source bucket
    const { data: signed } = await service.storage
      .from(ref.storage_bucket)
      .createSignedUrl(ref.storage_path, 60);
    if (!signed?.signedUrl) continue;

    // Download
    const imgRes = await fetch(signed.signedUrl);
    if (!imgRes.ok) continue;
    const buffer = await imgRes.arrayBuffer();
    const contentType = ref.type ?? "image/jpeg";
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";

    // Re-upload to template-images bucket
    const destPath = `${user.id}/${template.id}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await service.storage
      .from("template-images")
      .upload(destPath, buffer, { contentType, upsert: false });
    if (upErr) continue;

    // Insert template_images row
    const { error: imgErr } = await service.from("template_images").insert({
      template_id: template.id,
      storage_path: destPath,
      storage_bucket: "template-images",
      display_order: i,
      purpose: ref.purpose,
      tag: ref.purpose === "tagged" ? (ref.tag ?? null) : null,
      custom_name: ref.custom_name ?? null,
      note: ref.note ?? null,
      created_at: now,
    });
    if (imgErr) console.error("[to-template] template_images insert error:", imgErr.message);

    // Auto-set first inspiration image as cover
    if (i === 0 && ref.purpose === "inspiration") {
      await service.from("templates")
        .update({ cover_storage_path: destPath, cover_bucket: "template-images", updated_at: now })
        .eq("id", template.id);
    }
  }

  return NextResponse.json({ templateId: template.id }, { status: 201 });
}
