import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import { r2Download, r2Exists, r2GetStream } from "@/lib/r2";
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
    // 1. R2: STREAM the object through this route rather than redirecting to a
    // signed R2 URL. Buyers were landing on a raw *.r2.cloudflarestorage.com file
    // page, which exposed the storage provider and did not read as a download.
    //
    // The redirect existed because an older version BUFFERED whole ~18MB files in
    // memory before responding, which truncated downloads on flaky connections
    // and 502'd across restarts. Streaming avoids that: the body is piped through
    // untouched, Content-Length is preserved, and Range requests are passed to R2
    // so downloads stay resumable — the properties the redirect was protecting.
    if (await r2Exists(storageBucket, storagePath)) {
      try {
        const range = request.headers.get("range");
        const obj = await r2GetStream(storageBucket, storagePath, range);
        sql`INSERT INTO download_logs (id, user_id, shoot_id, image_id, type, created_at) VALUES (${crypto.randomUUID()}, ${user.id}, ${id}, ${imageId}, '4k', NOW())`.catch(() => {});
        return new Response(obj.stream, {
          status: obj.contentRange ? 206 : 200,
          headers: {
            "Content-Type": obj.contentType,
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Accept-Ranges": "bytes",
            ...(obj.contentLength ? { "Content-Length": String(obj.contentLength) } : {}),
            ...(obj.contentRange ? { "Content-Range": obj.contentRange } : {}),
            "Cache-Control": "private, max-age=0, must-revalidate",
          },
        });
      } catch { /* fall through to the buffered/legacy paths below */ }
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

  // Metadata path: hand back a URL on OUR domain, not a signed R2 one. Any caller
  // navigating to this gets the streaming branch above, so the bucket host is
  // never visible to a buyer.
  return NextResponse.json({
    url: `/api/shoots/${id}/images/${imageId}?download=1`,
    filename,
  });
}
