import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@/lib/supabase-server";
import { r2 } from "@/lib/r2";
import { heicToJpeg, isHeic, sniffImageType } from "@/lib/heic";

// Matches fal.ai nano-banana-2's 30MB per-image limit — see lib/resize-image.ts.
// Uploads at or under this are stored untouched at native resolution so the
// model receives full reference/identity fidelity.
const MAX_SIZE = 30 * 1024 * 1024;
const ALLOWED_BUCKETS = new Set(["identity-images", "inspiration-images", "template-images"]);

function sanitizeFileName(name: string) {
  return name.replace(/[\\/]/g, "_").replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, "_");
}

// Server-side file upload to R2 — avoids browser CORS restrictions on direct R2 PUTs.
// Usage: POST multipart/form-data with `file` (Blob) and `bucket` (string) fields.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    console.error("[upload/file] auth failed:", authError?.message ?? "no user");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const bucket = formData.get("bucket") as string | null;

  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });
  if (!bucket || !ALLOWED_BUCKETS.has(bucket))
    return NextResponse.json({ error: "invalid bucket" }, { status: 400 });
  // SVGs can carry executable script; served inline from the media proxy that would be
  // stored XSS. Raster formats only.
  if (file.type === "image/svg+xml" || /\.svg$/i.test(file.name))
    return NextResponse.json({ error: "SVG images are not allowed" }, { status: 400 });
  if (file.size > MAX_SIZE)
    return NextResponse.json({ error: "file too large (max 30MB)" }, { status: 400 });

  let buffer: Buffer = Buffer.from(await file.arrayBuffer());
  let contentType = file.type;
  let fileName = file.name;
  let converted = false;

  // iPhone photos (HEIC) become full-resolution JPEGs here: Chrome on Windows
  // sends them with no type, and nothing downstream can read HEIC (lib/heic.ts).
  if (isHeic(buffer)) {
    try {
      buffer = await heicToJpeg(buffer);
    } catch (err) {
      console.error("[upload/file] HEIC conversion failed:", err instanceof Error ? err.message : err);
      return NextResponse.json({ error: "This iPhone photo could not be opened — please send it as a JPEG" }, { status: 400 });
    }
    contentType = "image/jpeg";
    fileName = fileName.replace(/\.(heic|heif)$/i, "") + ".jpg";
    converted = true;
  } else if (!contentType.startsWith("image/")) {
    // A browser that does not recognise the file sends no type; trust the bytes instead.
    const sniffed = sniffImageType(buffer);
    if (!sniffed) return NextResponse.json({ error: "file must be an image" }, { status: 400 });
    contentType = sniffed;
  }

  const uniqueId = crypto.randomUUID();
  const storagePath = `${user.id}/${uniqueId}-${sanitizeFileName(fileName)}`;

  try {
    await r2.send(new PutObjectCommand({
      Bucket: bucket,
      Key: storagePath,
      Body: buffer,
      ContentType: contentType,
    }));
  } catch (err) {
    console.error("[upload/file] R2 upload failed:", err);
    return NextResponse.json({ error: "Storage upload failed" }, { status: 500 });
  }

  return NextResponse.json(converted ? { storagePath, id: uniqueId, converted: true } : { storagePath, id: uniqueId });
}
