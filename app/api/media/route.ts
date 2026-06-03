import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import { r2Download } from "@/lib/r2";
import { isAdminEmail } from "@/lib/auth";

// Buckets that are publicly viewable (marketplace browse, template previews).
const PUBLIC_BUCKETS = new Set(["template-images"]);

async function processImage(
  rawBuffer: ArrayBuffer,
  widthParam: string | null,
  qualityParam: string | null,
  formatParam: string | null,
): Promise<{ data: ArrayBuffer; contentType: string } | null> {
  if (!widthParam && !formatParam) return null;
  try {
    const sharp = (await import("sharp")).default;
    let pipeline = sharp(Buffer.from(rawBuffer));
    if (widthParam) {
      pipeline = pipeline.resize(Math.min(Number(widthParam), 2400), undefined, { withoutEnlargement: true });
    }
    const fmt = formatParam === "avif" ? "avif" : "webp";
    const quality = qualityParam ? Math.min(Math.max(Number(qualityParam), 1), 100) : 75;
    pipeline = pipeline[fmt]({ quality });
    const buf = await pipeline.toBuffer();
    return { data: buf.buffer as ArrayBuffer, contentType: `image/${fmt}` };
  } catch {
    return null;
  }
}

// Proxy storage files through the app server to avoid CORS/ORB restrictions.
// Usage: /api/media?b=<bucket>&p=<path>[&width=N&quality=N&format=webp]
export async function GET(req: NextRequest) {
  const bucket = req.nextUrl.searchParams.get("b");
  const path   = req.nextUrl.searchParams.get("p");

  if (!bucket || !path) {
    return new NextResponse("Missing b or p", { status: 400 });
  }

  // Non-public buckets require an authenticated user who owns the file.
  if (!PUBLIC_BUCKETS.has(bucket)) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new NextResponse("Unauthorized", { status: 401 });

    // Ownership check: path must begin with the user's own ID, or caller is admin.
    const isAdmin = isAdminEmail(user.email);
    if (!isAdmin && !path.startsWith(`${user.id}/`)) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  const widthParam   = req.nextUrl.searchParams.get("width");
  const qualityParam = req.nextUrl.searchParams.get("quality");
  const formatParam  = req.nextUrl.searchParams.get("format");

  const cacheControl = PUBLIC_BUCKETS.has(bucket)
    ? "public, max-age=86400, stale-while-revalidate=604800"
    : "private, max-age=3600, stale-while-revalidate=86400";

  // Try R2 first (all files after migration)
  try {
    const { buffer, contentType } = await r2Download(bucket, path);
    const raw = buffer.buffer as ArrayBuffer;
    const processed = await processImage(raw, widthParam, qualityParam, formatParam);
    if (processed) {
      return new NextResponse(processed.data, {
        headers: { "Content-Type": processed.contentType, "Cache-Control": cacheControl },
      });
    }
    return new NextResponse(raw, {
      headers: { "Content-Type": contentType, "Cache-Control": cacheControl },
    });
  } catch {
    // fall through to Supabase for older files
  }

  // Fall back to Supabase Storage (files uploaded before R2 migration)
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (!error && data) {
    const raw = await data.arrayBuffer();
    const processed = await processImage(raw, widthParam, qualityParam, formatParam);
    if (processed) {
      return new NextResponse(processed.data, {
        headers: { "Content-Type": processed.contentType, "Cache-Control": cacheControl },
      });
    }
    return new NextResponse(raw, {
      headers: {
        "Content-Type": data.type || "application/octet-stream",
        "Cache-Control": cacheControl,
      },
    });
  }

  return new NextResponse("Not found", { status: 404 });
}
