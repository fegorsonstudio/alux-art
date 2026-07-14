import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { r2Download, r2SignedDownloadUrl, r2Upload } from "@/lib/r2";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [shoot] = await sql`SELECT id, user_id FROM shoots WHERE id = ${id} AND user_id = ${user.id}`;
  if (!shoot) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const completedImages = await sql`
    SELECT slot, download_storage_bucket, download_storage_path, fal_url FROM shoot_images
    WHERE shoot_id = ${id} AND status = 'COMPLETE' AND download_storage_path IS NOT NULL
  `;

  if (completedImages.length === 0) {
    return NextResponse.json({ error: "No completed images available to download yet." }, { status: 400 });
  }

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  const supa = createServiceClient();
  for (const img of completedImages) {
    const bucket = img.download_storage_bucket as string;
    const path = img.download_storage_path as string;
    let buffer: Buffer | undefined;

    // 1. R2 (new files)
    try {
      const { buffer: r2Buf } = await r2Download(bucket, path);
      if (r2Buf.byteLength > 0) buffer = r2Buf;
    } catch { /* fall through */ }

    // 2. fal_url — original 4K from fal.ai CDN (expires ~24-48h after generation)
    if (!buffer && img.fal_url) {
      try {
        const falRes = await fetch(img.fal_url as string);
        if (falRes.ok) buffer = Buffer.from(await falRes.arrayBuffer());
      } catch { /* fall through */ }
    }

    // 3. Supabase Storage (older/pre-R2 files)
    if (!buffer) {
      const { data: blob } = await supa.storage.from(bucket).download(path);
      if (blob) buffer = Buffer.from(await blob.arrayBuffer());
    }

    if (buffer) {
      const ext = path.endsWith(".png") ? "png" : "jpg";
      zip.file(`portrait-${img.slot}.${ext}`, buffer);
    } else {
      console.error("[download-zip] not found in R2, fal.ai, or Supabase:", path);
    }
  }

  if (Object.keys(zip.files).length === 0) {
    return NextResponse.json({ error: "Could not read any image files for this shoot." }, { status: 500 });
  }

  const zipBuf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });

  const zipFilename = `aluxart-portraits-${id.slice(0, 8)}.zip`;

  // Upload the ZIP to R2, then redirect the browser to a signed URL so it downloads
  // straight from R2 — resumable, correct Content-Length, no multi-hundred-MB
  // response held open through Node/nginx (which truncated large transfers on
  // flaky connections).
  try {
    const zipPath = `${user.id}/${id}/shoot-${id}.zip`;
    await r2Upload("shoot-zips", zipPath, zipBuf, "application/zip");
    await sql`
      UPDATE shoots SET zip_storage_bucket = 'shoot-zips', zip_storage_path = ${zipPath}, zip_status = 'ready'
      WHERE id = ${id}
    `;
    const signedUrl = await r2SignedDownloadUrl("shoot-zips", zipPath, 3600, zipFilename);
    return NextResponse.redirect(signedUrl, 302);
  } catch { /* non-fatal — fall back to serving the buffer directly */ }

  return new Response(zipBuf.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipFilename}"`,
      "Content-Length": String(zipBuf.byteLength),
    },
  });
}
