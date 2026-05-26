import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { createServiceClient } from "@/lib/supabase-server";
import { r2 } from "@/lib/r2";

// Proxy storage files through the app server to avoid CORS/ORB restrictions.
// Tries Supabase Storage first (older files), then R2 (newer uploads).
// Usage: /api/media?b=<bucket>&p=<path>
export async function GET(req: NextRequest) {
  const bucket = req.nextUrl.searchParams.get("b");
  const path = req.nextUrl.searchParams.get("p");

  if (!bucket || !path) {
    return new NextResponse("Missing b or p", { status: 400 });
  }

  // Try Supabase Storage first
  const supabase = createServiceClient();
  const { data, error: sbError } = await supabase.storage.from(bucket).download(path);
  if (!sbError && data) {
    const buffer = await data.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": data.type || "application/octet-stream",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  }
  if (sbError) {
    console.error(`[media] Supabase miss b=${bucket} p=${path}: ${sbError.message}`);
  }

  // Fall back to R2 (files uploaded after R2 migration)
  try {
    const obj = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: path }));
    const contentType = obj.ContentType ?? "application/octet-stream";
    const body = obj.Body as ReadableStream<Uint8Array>;
    return new NextResponse(body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch (r2Err) {
    console.error(`[media] R2 miss b=${bucket} p=${path}: ${r2Err instanceof Error ? r2Err.message : String(r2Err)}`);
    return new NextResponse("Not found", { status: 404 });
  }
}
