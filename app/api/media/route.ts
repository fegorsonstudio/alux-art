import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { r2Download } from "@/lib/r2";

// Proxy storage files through the app server to avoid CORS/ORB restrictions.
// Tries R2 first (newer uploads), then Supabase Storage (older files).
// Usage: /api/media?b=<bucket>&p=<path>
export async function GET(req: NextRequest) {
  const bucket = req.nextUrl.searchParams.get("b");
  const path = req.nextUrl.searchParams.get("p");

  if (!bucket || !path) {
    return new NextResponse("Missing b or p", { status: 400 });
  }

  // Try R2 first (all files after migration)
  try {
    const { buffer, contentType } = await r2Download(bucket, path);
    return new NextResponse(buffer.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    // fall through to Supabase for older files
  }

  // Fall back to Supabase Storage (files uploaded before R2 migration)
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (!error && data) {
    const buffer = await data.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": data.type || "application/octet-stream",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  }

  return new NextResponse("Not found", { status: 404 });
}
