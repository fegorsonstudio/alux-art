import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import { r2Download, r2Exists, r2SignedDownloadUrl } from "@/lib/r2";
import { signedMediaUrl } from "@/lib/media-url";
import sql from "@/lib/db";
import { isAdminEmail } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  const { id, imageId } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [img] = await sql`
    SELECT id, slot, kind, status, preview_storage_bucket, preview_storage_path,
           download_storage_path, download_storage_bucket, fal_url
    FROM shoot_images WHERE id = ${imageId} AND shoot_id = ${id}
  `;
  if (!img) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [shoot] = await sql`SELECT user_id FROM shoots WHERE id = ${id}`;
  const isAdmin = isAdminEmail(user.email);
  if (!shoot || (!isAdmin && shoot.user_id !== user.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const storagePath = img.download_storage_path ?? img.preview_storage_path;
  const storageBucket = img.download_storage_bucket ?? img.preview_storage_bucket;
  if (!storagePath) return NextResponse.json({ error: "No file" }, { status: 404 });

  const isDownload = request.nextUrl.searchParams.get("download") === "1";
  const filename = `aluxart-slot${img.slot}-${img.kind}.png`;

  if (isDownload) {
    // 1. R2 (new files saved by r2StreamUpload): redirect to a signed URL so the
    // browser downloads straight from R2 — resumable (Accept-Ranges), correct
    // Content-Length, zero server memory, and immune to app restarts. Proxying
    // ~18MB files through Node produced truncated files on flaky connections
    // and 502s during restarts, which browsers saved as kilobyte "images".
    //
    // Do NOT replace this with a stream/proxy through the app to hide the bucket
    // hostname. That was tried (d1f5d07) and reverted the same day: measured on a
    // real 18MB file, R2 -> browser runs at ~529 KB/s (34s) because Cloudflare
    // serves it from an edge near the buyer, while browser -> our VPS runs at
    // 20-47 KB/s whether or not Cloudflare fronts it, so the same file took 6-9
    // minutes and died on mobile data. The server itself is fast (R2 -> VPS is
    // 24 MB/s); the buyer's link to the VPS is the ceiling, so no code change
    // makes proxying fast. To hide the hostname, put the bucket behind an R2
    // custom domain (media.aluxartandframes.shop) and sign against that endpoint
    // — edge delivery is kept and the URL becomes ours.
    if (await r2Exists(storageBucket, storagePath)) {
      // Prefer our own media hostname when the Worker is configured. Same edge
      // delivery and same expiring-link protection, minus the bucket URL. Returns
      // null when MEDIA_DOMAIN/MEDIA_SIGNING_SECRET are unset, so this is inert
      // until they are set.
      const signedUrl =
        (await signedMediaUrl(storageBucket, storagePath, { filename }).catch(() => null))
        ?? (await r2SignedDownloadUrl(storageBucket, storagePath, 3600, filename).catch(() => null));
      if (signedUrl) {
        sql`INSERT INTO download_logs (id, user_id, shoot_id, image_id, type, created_at) VALUES (${crypto.randomUUID()}, ${user.id}, ${id}, ${imageId}, '4k', NOW())`.catch(() => {});
        return NextResponse.redirect(signedUrl, 302);
      }
    }

    let body: ReadableStream<Uint8Array> | ArrayBuffer | undefined;
    let contentType = "image/png";
    let contentLength: number | undefined;

    // 1b. R2 buffered fallback — only reached if the HEAD check or signing failed
    // transiently even though the object may exist.
    try {
      const { buffer, contentType: ct } = await r2Download(storageBucket, storagePath);
      if (buffer.byteLength > 0) {
        body = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
        contentType = ct;
        contentLength = buffer.byteLength;
      }
    } catch { /* fall through */ }

    // 2. fal_url — original 4K from fal.ai CDN (expires ~24-48h after generation)
    if (!body && img.fal_url) {
      try {
        const falRes = await fetch(img.fal_url as string);
        if (falRes.ok) {
          const buf = Buffer.from(await falRes.arrayBuffer());
          body = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
          contentType = falRes.headers.get("content-type") || "image/png";
          contentLength = buf.byteLength;
        }
      } catch { /* fall through */ }
    }

    // 3. Supabase Storage (older/pre-R2 files)
    if (!body) {
      const supa = createServiceClient();
      const { data: blob, error: sbErr } = await supa.storage.from(storageBucket).download(storagePath);
      if (sbErr || !blob) return NextResponse.json({ error: "File not found in storage" }, { status: 404 });
      body = await blob.arrayBuffer();
      contentType = blob.type || "image/png";
      contentLength = body.byteLength;
    }

    sql`INSERT INTO download_logs (id, user_id, shoot_id, image_id, type, created_at) VALUES (${crypto.randomUUID()}, ${user.id}, ${id}, ${imageId}, '4k', NOW())`.catch(() => {});
    return new Response(body, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        ...(contentLength ? { "Content-Length": String(contentLength) } : {}),
      },
    });
  }

  // Desktop path: return a signed URL with Content-Disposition:attachment baked in.
  // The browser navigates directly to R2 — zero server memory for the file transfer.
  const signedUrl =
    (await signedMediaUrl(storageBucket, storagePath, { filename }).catch(() => null))
    ?? (await r2SignedDownloadUrl(storageBucket, storagePath, 3600, filename).catch(() => null));
  if (!signedUrl) return NextResponse.json({ error: "Could not sign URL" }, { status: 500 });

  return NextResponse.json({
    url: signedUrl,
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    filename,
  });
}
