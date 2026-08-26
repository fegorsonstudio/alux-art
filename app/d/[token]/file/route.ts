import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { r2SignedDownloadUrl } from "@/lib/r2";

/**
 * The bytes themselves.
 *
 * Split out from the landing page at /d/<token> because Content-Disposition is
 * not enough on its own: Instagram's in-app browser ignores it and renders the
 * PNG, so a customer tapping the link saw their photo and no way to keep it.
 * The page gives them a button; this is what the button points at.
 *
 * A 302 to a freshly signed R2 url rather than streaming — proxying a 21MB file
 * through the app is about ten times slower.
 */

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 16) return new NextResponse("Not found", { status: 404 });

  const [row] = await sql<{
    bucket: string | null; path: string | null; slot: number; shoot_id: string;
  }[]>`
    SELECT COALESCE(download_storage_bucket, preview_storage_bucket) AS bucket,
           COALESCE(download_storage_path,   preview_storage_path)   AS path,
           slot, shoot_id
    FROM shoot_images WHERE download_token = ${token} LIMIT 1`.catch(() => []);

  if (!row?.path || !row.bucket) {
    return new NextResponse("This download has expired.", { status: 404 });
  }

  // The extension has to match what the bytes actually are. A loop saved as
  // .png is a GIF wearing the wrong name: the file is perfectly good, but the
  // phone and the desktop both open it in a still-image viewer and the customer
  // reasonably concludes it did not save as a GIF. Taken from the stored path,
  // which is what R2 actually holds.
  const ext = /\.(gif|jpe?g|webp|png)$/i.exec(row.path)?.[1]?.toLowerCase() ?? "png";
  const filename = `alux-art-${row.shoot_id.slice(0, 8)}-${String(row.slot).padStart(2, "0")}.${ext}`;
  const url = await r2SignedDownloadUrl(row.bucket, row.path, 3600, filename).catch(() => null);
  if (!url) return new NextResponse("Temporarily unavailable", { status: 503 });
  return NextResponse.redirect(url, 302);
}
