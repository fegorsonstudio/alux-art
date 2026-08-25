import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { r2SignedDownloadUrl } from "@/lib/r2";

/**
 * The full-size download link.
 *
 * Short, permanent while the file exists, and needs no login — which is the
 * whole point. A customer who bought through Instagram or WhatsApp has a
 * synthetic account with no password, so every "sign in and find it in your
 * studio" route is closed to them. This is the only way they can hold the 4K
 * file they paid for.
 *
 * A 302 to a freshly signed R2 url rather than streaming the bytes: proxying a
 * 20MB file through the app is roughly ten times slower, and the buyer's link
 * to this server is the ceiling on it.
 *
 * The token is unguessable and scoped to one image. It is not a secret worth
 * much — it grants exactly one photograph, the one its owner already paid for —
 * but it is not enumerable either.
 */

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return new NextResponse("Not found", { status: 404 });
  }

  const [row] = await sql<{
    bucket: string | null; path: string | null; slot: number; shoot_id: string;
  }[]>`
    SELECT COALESCE(download_storage_bucket, preview_storage_bucket) AS bucket,
           COALESCE(download_storage_path,   preview_storage_path)   AS path,
           slot, shoot_id
    FROM shoot_images
    WHERE download_token = ${token}
    LIMIT 1`.catch(() => []);

  if (!row?.path || !row.bucket) {
    // Either a bad token, or the retention sweep has removed the file. Say which
    // rather than a bare 404, because "my link stopped working" is otherwise a
    // support conversation with no answer in it.
    return new NextResponse(
      "This download link has expired. Files are kept for 7 days after your shoot. " +
      "Message us and we'll help.",
      { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  const filename = `alux-art-${row.shoot_id.slice(0, 8)}-${String(row.slot).padStart(2, "0")}.png`;
  const url = await r2SignedDownloadUrl(row.bucket, row.path, 3600, filename).catch(() => null);
  if (!url) return new NextResponse("Temporarily unavailable", { status: 503 });

  return NextResponse.redirect(url, 302);
}
