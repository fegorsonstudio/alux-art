import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

// Proxy Supabase Storage files through the app server to avoid CORS/ORB restrictions.
// Usage: /api/media?b=<bucket>&p=<path>
export async function GET(req: NextRequest) {
  const bucket = req.nextUrl.searchParams.get("b");
  const path = req.nextUrl.searchParams.get("p");

  if (!bucket || !path) {
    return new NextResponse("Missing b or p", { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.storage.from(bucket).download(path);

  if (error || !data) {
    return new NextResponse("Not found", { status: 404 });
  }

  const contentType = data.type || "application/octet-stream";
  const buffer = await data.arrayBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
