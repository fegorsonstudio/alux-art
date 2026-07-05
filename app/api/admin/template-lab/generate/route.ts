import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { fal } from "@fal-ai/client";
import { r2SignedDownloadUrl, r2Upload } from "@/lib/r2";
import { isAdminEmail } from "@/lib/auth";

fal.config({ credentials: process.env.FAL_KEY ?? process.env.FAL_API_KEY ?? "" });

async function getAdminSession() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return null;
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

  const [slotImg] = await sql`
    SELECT id, shoot_id, slot, prompt, status, provider
    FROM shoot_images WHERE id = ${shoot_image_id}
  `;

  if (!slotImg) return NextResponse.json({ error: "Slot not found" }, { status: 404 });
  if (!slotImg.prompt) return NextResponse.json({ error: "No prompt saved for this slot" }, { status: 422 });

  const refs = await sql`
    SELECT purpose, storage_bucket, storage_path
    FROM shoot_references WHERE shoot_id = ${slotImg.shoot_id}
  `;

  const identityRefs = refs.filter((r) => r.purpose === "identity").slice(0, 3);
  const signedIdentityUrls: string[] = [];
  for (const ref of identityRefs) {
    const url = await r2SignedDownloadUrl(ref.storage_bucket as string, ref.storage_path as string, 300);
    signedIdentityUrls.push(url);
  }

  const nonIdentityRefs = refs.filter((r) => r.purpose !== "identity");
  const signedRefUrls: string[] = [];
  for (const ref of nonIdentityRefs) {
    const url = await r2SignedDownloadUrl(ref.storage_bucket as string, ref.storage_path as string, 300);
    signedRefUrls.push(url);
  }

  const imageUrls = [...signedIdentityUrls, ...signedRefUrls].slice(0, 9);
  if (imageUrls.length === 0) {
    return NextResponse.json({ error: "No reference images found for this shoot" }, { status: 422 });
  }

  let falUrl: string;
  try {
    const response = await fal.subscribe("google/nano-banana-2-lite/edit", {
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

  let uploadPath: string;
  try {
    const imgRes = await fetch(falUrl);
    if (!imgRes.ok) throw new Error(`Download failed: ${imgRes.status}`);
    const buffer = Buffer.from(await imgRes.arrayBuffer());

    uploadPath = `admin/${template_id}/${crypto.randomUUID()}.png`;
    await r2Upload("template-images", uploadPath, buffer, "image/png");
  } catch (err) {
    console.error("[template-lab/generate] upload error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 500 });
  }

  const [maxOrderRow] = await sql`
    SELECT display_order FROM template_images
    WHERE template_id = ${template_id}
    ORDER BY display_order DESC LIMIT 1
  `;
  const nextOrder = ((maxOrderRow?.display_order as number | null) ?? -1) + 1;

  const [newImg] = await sql`
    INSERT INTO template_images (template_id, storage_path, storage_bucket, display_order, purpose, created_at)
    VALUES (${template_id}, ${uploadPath}, 'template-images', ${nextOrder}, 'generated', NOW())
    RETURNING id
  `;

  if (!newImg) {
    console.error("[template-lab/generate] insert failed");
    return NextResponse.json({ error: "Failed to save image record" }, { status: 500 });
  }

  await sql`
    UPDATE shoot_images SET provider = 'nano-banana', updated_at = NOW()
    WHERE id = ${shoot_image_id}
  `;

  const signedUrl = await r2SignedDownloadUrl("template-images", uploadPath, 3600);

  return NextResponse.json({ imageId: newImg.id, signedUrl }, { status: 201 });
}
