import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import { fal } from "@fal-ai/client";

fal.config({ credentials: process.env.FAL_KEY ?? process.env.FAL_API_KEY ?? "" });

async function getAdminSession() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user || user.email !== process.env.ADMIN_EMAIL) return null;
  return user;
}

export async function POST(req: NextRequest) {
  const user = await getAdminSession();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { shoot_image_id, template_id } = body as { shoot_image_id: string; template_id: string };
  if (!shoot_image_id || !template_id) {
    return NextResponse.json({ error: "shoot_image_id and template_id are required" }, { status: 400 });
  }

  const service = createServiceClient();

  // 1. Fetch the shoot_images row
  const { data: slotImg } = await service
    .from("shoot_images")
    .select("id, shoot_id, slot, prompt, status, provider")
    .eq("id", shoot_image_id)
    .single();

  if (!slotImg) return NextResponse.json({ error: "Slot not found" }, { status: 404 });
  if (!slotImg.prompt) return NextResponse.json({ error: "No prompt saved for this slot" }, { status: 422 });

  // 2. Fetch shoot references
  const { data: refs } = await service
    .from("shoot_references")
    .select("purpose, storage_bucket, storage_path")
    .eq("shoot_id", slotImg.shoot_id);

  // Sign identity references (up to 3)
  const identityRefs = (refs ?? []).filter((r: { purpose: string }) => r.purpose === "identity").slice(0, 3);
  const signedIdentityUrls: string[] = [];
  for (const ref of identityRefs) {
    const { data } = await service.storage
      .from(ref.storage_bucket as string)
      .createSignedUrl(ref.storage_path as string, 300);
    if (data?.signedUrl) signedIdentityUrls.push(data.signedUrl);
  }

  // Sign non-identity (inspiration + tagged) references
  const nonIdentityRefs = (refs ?? []).filter((r: { purpose: string }) => r.purpose !== "identity");
  const signedRefUrls: string[] = [];
  for (const ref of nonIdentityRefs) {
    const { data } = await service.storage
      .from(ref.storage_bucket as string)
      .createSignedUrl(ref.storage_path as string, 300);
    if (data?.signedUrl) signedRefUrls.push(data.signedUrl);
  }

  const imageUrls = [...signedIdentityUrls, ...signedRefUrls].slice(0, 9);
  if (imageUrls.length === 0) {
    return NextResponse.json({ error: "No reference images found for this shoot" }, { status: 422 });
  }

  // 3. Call fal.ai nano-banana
  let falUrl: string;
  try {
    const response = await fal.subscribe("fal-ai/nano-banana-2/edit", {
      input: {
        prompt: slotImg.prompt as string,
        num_images: 1,
        aspect_ratio: "4:5" as const,
        output_format: "png" as const,
        safety_tolerance: "6",
        image_urls: imageUrls,
        limit_generations: false,
      },
    });
    const output = ((response as Record<string, unknown>).data || response) as { images?: Array<{ url: string }> };
    falUrl = output.images?.[0]?.url ?? "";
    if (!falUrl) throw new Error("fal.ai returned no image URL");
  } catch (err) {
    console.error("[template-lab/generate] fal error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "fal.ai generation failed" }, { status: 500 });
  }

  // 4. Download the image and upload to template-images bucket
  let uploadPath: string;
  try {
    const imgRes = await fetch(falUrl);
    if (!imgRes.ok) throw new Error(`Download failed: ${imgRes.status}`);
    const buffer = await imgRes.arrayBuffer();

    uploadPath = `admin/${template_id}/${crypto.randomUUID()}.png`;
    const { error: upErr } = await service.storage
      .from("template-images")
      .upload(uploadPath, buffer, { contentType: "image/png", upsert: false });
    if (upErr) throw new Error(upErr.message);
  } catch (err) {
    console.error("[template-lab/generate] upload error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 500 });
  }

  // 5. Get current max display_order for this template
  const { data: existing } = await service
    .from("template_images")
    .select("display_order")
    .eq("template_id", template_id)
    .order("display_order", { ascending: false })
    .limit(1);
  const nextOrder = ((existing?.[0]?.display_order as number | null) ?? -1) + 1;

  // 6. Insert template_images row
  const { data: newImg, error: insertErr } = await service
    .from("template_images")
    .insert({
      template_id,
      storage_path: uploadPath,
      storage_bucket: "template-images",
      display_order: nextOrder,
      purpose: "generated",
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertErr) {
    console.error("[template-lab/generate] insert error:", insertErr);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // 7. Mark shoot_image as generated via nano-banana
  await service.from("shoot_images").update({
    provider: "nano-banana",
    updated_at: new Date().toISOString(),
  }).eq("id", shoot_image_id);

  // 8. Sign the new image for response
  const { data: signed } = await service.storage
    .from("template-images")
    .createSignedUrl(uploadPath, 3600);

  return NextResponse.json({
    imageId: newImg?.id,
    signedUrl: signed?.signedUrl ?? null,
  }, { status: 201 });
}
