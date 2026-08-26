import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import sql from "@/lib/db";
import { r2Download } from "@/lib/r2";

/**
 * A small version of the photo, for the download page to show.
 *
 * The real file is a ~21MB PNG. Putting that in an <img> would mean a customer
 * on mobile data downloading it once to look at it and again to keep it, which
 * is both slow and expensive on a Nigerian phone plan.
 *
 * Proxied rather than redirected, unlike the full file: this is a couple of
 * hundred kilobytes, and generating it needs the bytes anyway.
 */

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 16) return new NextResponse("Not found", { status: 404 });

  const [row] = await sql<{ bucket: string | null; path: string | null }[]>`
    SELECT COALESCE(download_storage_bucket, preview_storage_bucket) AS bucket,
           COALESCE(download_storage_path,   preview_storage_path)   AS path
    FROM shoot_images WHERE download_token = ${token} LIMIT 1`.catch(() => []);

  if (!row?.path || !row.bucket) return new NextResponse("Not found", { status: 404 });

  try {
    const { buffer } = await r2Download(row.bucket, row.path);

    // An animated GIF is served whole. sharp keeps only the first frame of an
    // animation, so resizing one here turns a loop into a photograph — and the
    // customer then saves the still, because a still is what the page gave them.
    // The size argument above does not apply either: a loop is ~1.5MB, which is
    // already the size this route is trying to produce.
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
      return new NextResponse(new Uint8Array(buffer), {
        headers: { 'content-type': 'image/gif', 'cache-control': 'public, max-age=86400' },
      });
    }

    const out = await sharp(buffer).rotate().resize({ width: 900, withoutEnlargement: true })
      .jpeg({ quality: 80 }).toBuffer();
    return new NextResponse(new Uint8Array(out), {
      headers: {
        "content-type": "image/jpeg",
        // Immutable: the underlying photograph never changes once generated.
        "cache-control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse("Temporarily unavailable", { status: 503 });
  }
}
