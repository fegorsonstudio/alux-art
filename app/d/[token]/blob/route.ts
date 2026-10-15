import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { r2Download } from "@/lib/r2";

/**
 * The full-size file from our own address, for the download page's
 * "Save to Photos" button.
 *
 * iPhone has no way for a web page to put a picture in Photos except the share
 * sheet ("Save Image"), and the share sheet needs the file's bytes inside the
 * page. The page cannot read them from R2 (another origin, no CORS), so they are
 * served from here. /file stays a 302 to R2 for everything else: proxying a 21MB
 * file is about ten times slower, which is acceptable only when there is no
 * other way to save it.
 */

export const dynamic = "force-dynamic";

/**
 * A token can point at a shoot image or at a RETOUCHED image.
 *
 * Retouched files are paywalled: the retouch is done by hand and the customer
 * pays to unlock it, so a token whose order is neither paid nor free resolves
 * to nothing at all. Same check as /file and /preview.
 */
async function resolveToken(token: string): Promise<
  { bucket: string; path: string; slot: number; shootId: string; retouched: boolean } | null
> {
  const [img] = await sql<{
    bucket: string | null; path: string | null; slot: number; shoot_id: string;
  }[]>`
    SELECT COALESCE(download_storage_bucket, preview_storage_bucket) AS bucket,
           COALESCE(download_storage_path,   preview_storage_path)   AS path,
           slot, shoot_id
    FROM shoot_images WHERE download_token = ${token} LIMIT 1`.catch(() => []);
  if (img?.path && img.bucket) {
    return { bucket: img.bucket, path: img.path, slot: img.slot, shootId: img.shoot_id, retouched: false };
  }

  const [re] = await sql<{
    bucket: string | null; path: string | null; slot: number | null;
    shoot_id: string; paid: boolean | null; free: boolean | null;
  }[]>`
    SELECT r.storage_bucket AS bucket, r.storage_path AS path, r.slot, r.shoot_id,
           o.paid, o.free
    FROM shoot_retouched_images r
    LEFT JOIN shoot_retouch o ON o.shoot_id = r.shoot_id
    WHERE r.download_token = ${token} LIMIT 1`.catch(() => []);
  if (!re?.path || !re.bucket) return null;
  if (!re.paid && !re.free) return null;   // unpaid: the link is inert

  return { bucket: re.bucket, path: re.path, slot: re.slot ?? 1, shootId: re.shoot_id, retouched: true };
}

const TYPES: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 16) return new NextResponse("Not found", { status: 404 });
  const row = await resolveToken(token);
  if (!row) return new NextResponse("This download has expired.", { status: 404 });
  try {
    const { buffer } = await r2Download(row.bucket, row.path);
    const ext = /\.([a-z0-9]+)$/i.exec(row.path)?.[1]?.toLowerCase() ?? "jpg";
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "content-type": TYPES[ext] ?? "application/octet-stream",
        "content-length": String(buffer.byteLength),
        "cache-control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("Temporarily unavailable", { status: 503 });
  }
}
