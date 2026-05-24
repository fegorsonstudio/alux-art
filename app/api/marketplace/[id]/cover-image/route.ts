import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { r2SignedDownloadUrl } from "@/lib/r2";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const fallback = `${siteUrl}/logo.png`;

  const [template] = await sql`
    SELECT cover_storage_path, cover_bucket FROM templates
    WHERE id = ${id} AND status = 'published'
  `;

  if (!template?.cover_storage_path) {
    return NextResponse.redirect(fallback);
  }

  const signedUrl = await r2SignedDownloadUrl(
    (template.cover_bucket ?? "template-images") as string,
    template.cover_storage_path as string,
    3600
  ).catch(() => null);

  if (!signedUrl) {
    return NextResponse.redirect(fallback);
  }

  return NextResponse.redirect(signedUrl, {
    headers: {
      "Cache-Control": "public, max-age=3000, stale-while-revalidate=600",
    },
  });
}
