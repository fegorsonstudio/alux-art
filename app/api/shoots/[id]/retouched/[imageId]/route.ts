import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { r2Download, r2Exists, r2SignedDownloadUrl } from "@/lib/r2";
import { signedMediaUrl } from "@/lib/media-url";
import sql from "@/lib/db";
import { isAdminEmail } from "@/lib/auth";

/**
 * Download one retouched image.
 *
 * This is where the money is enforced. The tile is visible to the buyer either
 * way; the file only comes out once the retouch is paid for, or was comped.
 *
 * Delivery mirrors the generated-image route exactly: a 302 to a signed R2 URL
 * so the bytes travel Cloudflare edge -> buyer instead of R2 -> our VPS ->
 * buyer. That is not a style preference. Proxying an 18MB file was measured at
 * 6-9 minutes against 34 seconds, and died outright on mobile data.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  const { id, imageId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [shoot] = await sql`SELECT user_id FROM shoots WHERE id = ${id}`;
  const isAdmin = isAdminEmail(user.email);
  if (!shoot || (!isAdmin && shoot.user_id !== user.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [img] = await sql<{
    id: string; slot: number | null; storage_bucket: string; storage_path: string;
  }[]>`SELECT id, slot, storage_bucket, storage_path
       FROM shoot_retouched_images WHERE id = ${imageId} AND shoot_id = ${id}`;
  if (!img) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [order] = await sql<{ paid: boolean; free: boolean; price_ngn: number }[]>`
    SELECT paid, free, price_ngn FROM shoot_retouch WHERE shoot_id = ${id}`;

  // Admins can always pull a file — they need to check the work they delivered.
  const unlocked = isAdmin || Boolean(order?.paid || order?.free);
  if (!unlocked) {
    return NextResponse.json(
      { error: "Retouch not paid for", priceNgn: order?.price_ngn ?? 0 },
      { status: 402 }
    );
  }

  const filename = `aluxart-retouched-${img.slot ?? "image"}.jpg`;

  if (await r2Exists(img.storage_bucket, img.storage_path)) {
    const signedUrl =
      (await signedMediaUrl(img.storage_bucket, img.storage_path, { filename }).catch(() => null))
      ?? (await r2SignedDownloadUrl(img.storage_bucket, img.storage_path, 3600, filename).catch(() => null));
    if (signedUrl) {
      sql`INSERT INTO download_logs (id, user_id, shoot_id, image_id, type, created_at)
          VALUES (${crypto.randomUUID()}, ${user.id}, ${id}, ${img.id}, 'retouched', NOW())`.catch(() => {});
      return NextResponse.redirect(signedUrl, 302);
    }
  }

  // Buffered fallback, only if the HEAD check or the signing failed transiently.
  try {
    const { buffer, contentType } = await r2Download(img.storage_bucket, img.storage_path);
    if (buffer.byteLength > 0) {
      return new NextResponse(
        buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
        {
          headers: {
            "Content-Type": contentType || "image/jpeg",
            "Content-Length": String(buffer.byteLength),
            "Content-Disposition": `attachment; filename="${filename}"`,
          },
        }
      );
    }
  } catch (e) {
    console.error("[retouched download] r2 failed:", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ error: "File unavailable" }, { status: 404 });
}
