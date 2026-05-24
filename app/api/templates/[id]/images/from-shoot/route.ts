import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { r2SignedDownloadUrl, r2Upload } from "@/lib/r2";

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

  const [creator] = await sql`SELECT id FROM creators WHERE user_id = ${user.id}`;
  if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });

  const [template] = await sql`
    SELECT id, cover_storage_path FROM templates WHERE id = ${templateId} AND creator_id = ${creator.id}
  `;
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const [shootImage] = await sql`
    SELECT id, shoot_id, slot, status, fal_url, preview_storage_path, preview_storage_bucket
    FROM shoot_images
    WHERE id = ${body.shootImageId} AND user_id = ${user.id} AND status = 'COMPLETE'
  `;
  if (!shootImage) return NextResponse.json({ error: "Image not found or not complete" }, { status: 404 });

  const [shoot] = await sql`
    SELECT id, template_showcase_id FROM shoots WHERE id = ${shootImage.shoot_id} AND user_id = ${user.id}
  `;
  if (!shoot || shoot.template_showcase_id !== templateId) {
    return NextResponse.json({ error: "Image does not belong to a showcase for this template" }, { status: 403 });
  }

  let sourceUrl: string | null = (shootImage.fal_url as string | null) ?? null;
  if (!sourceUrl && shootImage.preview_storage_path) {
    sourceUrl = await r2SignedDownloadUrl(
      (shootImage.preview_storage_bucket ?? "shoot-images") as string,
      shootImage.preview_storage_path as string,
      300
    ).catch(() => null);
  }
  if (!sourceUrl) return NextResponse.json({ error: "No image URL available" }, { status: 422 });

  const imgRes = await fetch(sourceUrl);
  if (!imgRes.ok) return NextResponse.json({ error: "Failed to fetch image from source" }, { status: 502 });

  const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
  const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
  const ext = contentType.includes("png") ? "png" : "jpg";

  const destPath = `${user.id}/${templateId}/${crypto.randomUUID()}.${ext}`;
  await r2Upload("template-images", destPath, imgBuffer, contentType);

  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM template_images WHERE template_id = ${templateId}`;
  const displayOrder = (count as number) ?? 0;

  const newImageId = crypto.randomUUID();
  await sql`
    INSERT INTO template_images (id, template_id, storage_path, storage_bucket, display_order, purpose, tag, created_at)
    VALUES (${newImageId}, ${templateId}, ${destPath}, 'template-images', ${displayOrder}, 'sample', NULL, NOW())
  `;

  if (!template.cover_storage_path) {
    await sql`
      UPDATE templates SET cover_storage_path = ${destPath}, cover_bucket = 'template-images', updated_at = NOW()
      WHERE id = ${templateId}
    `;
  }

  const signedUrl = await r2SignedDownloadUrl("template-images", destPath, 3600).catch(() => null);

  return NextResponse.json({
    image: { id: newImageId, storagePath: destPath, storageBucket: "template-images", displayOrder, purpose: "sample", url: signedUrl },
  });
}
