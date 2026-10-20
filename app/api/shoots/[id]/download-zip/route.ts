import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { r2Download, r2SignedDownloadUrl, r2Upload } from "@/lib/r2";
import { signedMediaUrl } from "@/lib/media-url";

// One build per shoot at a time (PM2 runs one process). Two clicks used to
// build two ZIPs of up to ten 20–50 MB photos in memory at once.
const building = new Map<string, Promise<Response>>();

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [shoot] = await sql`SELECT id, user_id, expires_at, zip_status, zip_storage_bucket, zip_storage_path, zip_ready_at FROM shoots WHERE id = ${id} AND user_id = ${user.id}`;
  if (!shoot) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (shoot.expires_at && new Date(shoot.expires_at as string).getTime() <= Date.now()) {
    return NextResponse.json({ error: "This order's photos were removed after 7 days." }, { status: 410 });
  }
  const zipFilename = `aluxart-portraits-${id.slice(0, 8)}.zip`;

  // A ZIP built after the newest photo finished is still current: hand it out
  // instead of building it again on every click.
  if (shoot.zip_status === "ready" && shoot.zip_storage_bucket && shoot.zip_storage_path && shoot.zip_ready_at) {
    const [newest] = await sql<{ at: string | null }[]>`
      SELECT max(updated_at) AS at FROM shoot_images WHERE shoot_id = ${id} AND status = 'COMPLETE'`;
    if (newest?.at && new Date(shoot.zip_ready_at as string) >= new Date(newest.at)) {
      const reuse =
        (await signedMediaUrl(shoot.zip_storage_bucket as string, shoot.zip_storage_path as string, { filename: zipFilename }).catch(() => null))
        ?? (await r2SignedDownloadUrl(shoot.zip_storage_bucket as string, shoot.zip_storage_path as string, 3600, zipFilename).catch(() => null));
      if (reuse) return NextResponse.redirect(reuse, 302);
    }
  }

  const inFlight = building.get(id);
  if (inFlight) return (await inFlight).clone();
  const job = buildZip(id, user.id, zipFilename);
  building.set(id, job);
  try { return (await job).clone(); } finally { building.delete(id); }
}

async function buildZip(id: string, userId: string, zipFilename: string): Promise<Response> {

  const completedImages = await sql`
    SELECT slot, kind, download_storage_bucket, download_storage_path, fal_url FROM shoot_images
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
      // Extension and name both follow the file. A loop bundles four items —
      // landscape and portrait, GIF and MP4 — and calling an MP4
      // "portrait-2.jpg" inside the zip makes all four unopenable.
      const ext = /\.(gif|mp4|png|jpe?g|webp)$/i.exec(path)?.[1]?.toLowerCase() ?? "jpg";
      const stem = img.kind && /^(landscape|portrait)-(gif|mp4)$/.test(img.kind)
        ? `loop-${img.kind}`
        : `portrait-${img.slot}`;
      zip.file(`${stem}.${ext}`, buffer);
    } else {
      console.error("[download-zip] not found in R2, fal.ai, or Supabase:", path);
    }
  }

  if (Object.keys(zip.files).length === 0) {
    return NextResponse.json({ error: "Could not read any image files for this shoot." }, { status: 500 });
  }

  // Photos are already compressed; deflating them again only costs time.
  const zipBuf = await zip.generateAsync({ type: "nodebuffer", compression: "STORE" });

  // Upload the ZIP to R2, then redirect the browser to a signed URL so it downloads
  // straight from R2 — resumable, correct Content-Length, no multi-hundred-MB
  // response held open through Node/nginx (which truncated large transfers on
  // flaky connections).
  try {
    const zipPath = `${userId}/${id}/shoot-${id}.zip`;
    await r2Upload("shoot-zips", zipPath, zipBuf, "application/zip");
    await sql`
      UPDATE shoots SET zip_storage_bucket = 'shoot-zips', zip_storage_path = ${zipPath}, zip_status = 'ready',
        zip_ready_at = NOW(), zip_file_size = ${zipBuf.byteLength}
      WHERE id = ${id}
    `;
    // Our own media hostname when the Worker is configured, otherwise the R2
    // signed URL exactly as before (signedMediaUrl returns null when unset).
    const signedUrl =
      (await signedMediaUrl("shoot-zips", zipPath, { filename: zipFilename }).catch(() => null))
      ?? (await r2SignedDownloadUrl("shoot-zips", zipPath, 3600, zipFilename));
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
