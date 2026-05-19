import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

// Public proxy so Meta's scraper can fetch template cover images without auth.
// Returns a 302 redirect to a 1-hour Supabase signed URL.
// Falls back to the site logo if no cover image exists.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const fallback = `${siteUrl}/logo.png`;

  const service = createServiceClient();
  const { data: template } = await service
    .from("templates")
    .select("cover_storage_path, cover_bucket")
    .eq("id", id)
    .eq("status", "published")
    .single();

  if (!template?.cover_storage_path) {
    return NextResponse.redirect(fallback);
  }

  const { data: signed } = await service.storage
    .from(template.cover_bucket ?? "template-images")
    .createSignedUrl(template.cover_storage_path, 3600);

  if (!signed?.signedUrl) {
    return NextResponse.redirect(fallback);
  }

  return NextResponse.redirect(signed.signedUrl, {
    headers: {
      // Tell caches to revalidate after 50 minutes (before the 1-hour signed URL expires)
      "Cache-Control": "public, max-age=3000, stale-while-revalidate=600",
    },
  });
}
