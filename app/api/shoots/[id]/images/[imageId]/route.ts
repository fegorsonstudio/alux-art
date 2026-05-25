import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { r2StreamObject, r2SignedDownloadUrl } from "@/lib/r2";
import sql from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  const { id, imageId } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [img] = await sql`
    SELECT * FROM shoot_images WHERE id = ${imageId} AND shoot_id = ${id}
  `;
  if (!img) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [shoot] = await sql`SELECT user_id FROM shoots WHERE id = ${id}`;
  const isAdmin = user.email === process.env.ADMIN_EMAIL;
  if (!shoot || (!isAdmin && shoot.user_id !== user.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const storagePath = img.download_storage_path ?? img.preview_storage_path;
  const storageBucket = img.download_storage_bucket ?? img.preview_storage_bucket;
  if (!storagePath) return NextResponse.json({ error: "No file" }, { status: 404 });

  const isDownload = request.nextUrl.searchParams.get("download") === "1";
  const filename = `aluxart-slot${img.slot}-${img.kind}.png`;

  if (isDownload) {
    // Stream the file directly from R2 through the server — no full-file buffering in RAM.
    // Used by mobile/Web Share API path where the browser needs a blob.
    let stream: ReadableStream<Uint8Array>, contentType: string, contentLength: number | undefined;
    try {
      ({ stream, contentType, contentLength } = await r2StreamObject(storageBucket, storagePath));
    } catch {
      return NextResponse.json({ error: "File not found in storage" }, { status: 404 });
    }
    sql`INSERT INTO download_logs (id, user_id, shoot_id, image_id, type, created_at) VALUES (${crypto.randomUUID()}, ${user.id}, ${id}, ${imageId}, '4k', NOW())`.catch(() => {});
    return new Response(stream, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        ...(contentLength ? { "Content-Length": String(contentLength) } : {}),
      },
    });
  }

  // Desktop path: return a signed URL with Content-Disposition:attachment baked in.
  // The browser navigates directly to R2 — zero server memory for the file transfer.
  const signedUrl = await r2SignedDownloadUrl(storageBucket, storagePath, 3600, filename).catch(() => null);
  if (!signedUrl) return NextResponse.json({ error: "Could not sign URL" }, { status: 500 });

  return NextResponse.json({
    url: signedUrl,
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    filename,
  });
}
