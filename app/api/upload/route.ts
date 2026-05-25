import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { r2Upload, r2SignedDownloadUrl } from "@/lib/r2";

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_BUCKETS = new Set(["identity-images", "inspiration-images"]);

export const runtime = "nodejs";
export const maxDuration = 60;

function sanitizeFileName(name: string) {
  return name.replace(/[\\/]/g, "_").replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, "_");
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    console.error("[upload] auth failed:", authError?.message ?? "no user");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const bucket = (form.get("bucket") as string | null) ?? "inspiration-images";
  const saveToLibrary = (form.get("saveToLibrary") as string) === "true";

  if (!ALLOWED_BUCKETS.has(bucket)) {
    return NextResponse.json({ error: "Invalid bucket" }, { status: 400 });
  }

  // Re-confirm an already-uploaded file (no re-upload, just save to library and return URL)
  if (!file && form.has("storagePath")) {
    const imageId = form.get("id") as string | null;
    const filename = form.get("filename") as string | null;
    const contentType = form.get("contentType") as string | null;
    const size = Number(form.get("size"));
    const storageBucket = form.get("storageBucket") as string | null;
    const storagePath = form.get("storagePath") as string | null;

    if (!imageId || !filename || !contentType || !storageBucket || !storagePath) {
      return NextResponse.json({ error: "Missing image metadata" }, { status: 400 });
    }
    if (!ALLOWED_BUCKETS.has(storageBucket) || !storagePath.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: "Invalid image metadata" }, { status: 400 });
    }
    if (!contentType.startsWith("image/") || !Number.isFinite(size) || size <= 0 || size > MAX_SIZE) {
      return NextResponse.json({ error: "Invalid image metadata" }, { status: 400 });
    }

    const libraryTable = storageBucket === "identity-images" ? "identity_images"
      : storageBucket === "inspiration-images" ? "inspiration_images" : null;

    if ((saveToLibrary || storageBucket === "inspiration-images") && libraryTable) {
      const now = new Date();
      await sql`
        INSERT INTO ${sql(libraryTable)} (id, user_id, name, type, size, storage_bucket, storage_path, created_at, last_used_at)
        VALUES (${imageId}, ${user.id}, ${filename}, ${contentType}, ${size}, ${storageBucket}, ${storagePath}, ${now}, ${now})
        ON CONFLICT (id) DO UPDATE SET last_used_at = EXCLUDED.last_used_at
      `.catch((err) => console.error(`[upload] ${libraryTable} upsert:`, err));
    }

    const signedUrl = await r2SignedDownloadUrl(storageBucket, storagePath, 3600).catch(() => null);
    if (!signedUrl) return NextResponse.json({ error: "Unable to sign uploaded image" }, { status: 500 });

    return NextResponse.json({ image: { id: imageId, name: filename, type: contentType, size, storageBucket, storagePath, url: signedUrl } });
  }

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_SIZE) return NextResponse.json({ error: "Max 10MB" }, { status: 400 });

  const uniqueId = crypto.randomUUID();
  const path = `${user.id}/${uniqueId}-${sanitizeFileName(file.name)}`;

  try {
    await r2Upload(bucket, path, file, file.type);
  } catch (uploadError) {
    console.error("[upload] R2 error:", uploadError instanceof Error ? uploadError.message : uploadError);
    return NextResponse.json({ error: uploadError instanceof Error ? uploadError.message : "Upload failed" }, { status: 500 });
  }

  const signedUrl = await r2SignedDownloadUrl(bucket, path, 3600).catch(() => null);

  const libraryTable = bucket === "identity-images" ? "identity_images"
    : bucket === "inspiration-images" ? "inspiration_images" : null;

  if ((saveToLibrary || bucket === "inspiration-images") && libraryTable) {
    const now = new Date();
    await sql`
      INSERT INTO ${sql(libraryTable)} (id, user_id, name, type, size, storage_bucket, storage_path, created_at, last_used_at)
      VALUES (${uniqueId}, ${user.id}, ${file.name}, ${file.type}, ${file.size}, ${bucket}, ${path}, ${now}, ${now})
      ON CONFLICT (id) DO UPDATE SET last_used_at = EXCLUDED.last_used_at
    `.catch((err) => console.error(`[upload] ${libraryTable} upsert:`, err));
  }

  return NextResponse.json({ image: { id: uniqueId, name: file.name, type: file.type, size: file.size, storageBucket: bucket, storagePath: path, url: signedUrl } });
}
