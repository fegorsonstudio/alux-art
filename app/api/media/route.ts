import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import { r2Download } from "@/lib/r2";
import { isAdminEmail } from "@/lib/auth";

// Buckets that are publicly viewable (marketplace browse, template previews).
const PUBLIC_BUCKETS = new Set(["template-images"]);

// Proxy storage files through the app server to avoid CORS/ORB restrictions.
// Usage: /api/media?b=<bucket>&p=<path>
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

  // Try R2 first (all files after migration)
  try {
    const { buffer, contentType } = await r2Download(bucket, path);
    return new NextResponse(buffer.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400",
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
        "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400",
      },
    });
  }

  return new NextResponse("Not found", { status: 404 });
}
