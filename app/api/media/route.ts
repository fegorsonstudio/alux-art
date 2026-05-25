import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { r2 } from "@/lib/r2";

// Proxy R2 images through the app server to avoid CORS/ORB issues with private buckets.
// Usage: /api/media?b=<bucket>&p=<path>
export async function GET(req: NextRequest) {
  const bucket = req.nextUrl.searchParams.get("b");
  const path = req.nextUrl.searchParams.get("p");

  if (!bucket || !path) {
    return new NextResponse("Missing b or p", { status: 400 });
  }

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
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
