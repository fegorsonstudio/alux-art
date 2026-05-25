import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@/lib/supabase-server";
import { r2 } from "@/lib/r2";

const MAX_SIZE = 20 * 1024 * 1024;
const ALLOWED_BUCKETS = new Set(["identity-images", "inspiration-images", "template-images"]);

function sanitizeFileName(name: string) {
  return name.replace(/[\\/]/g, "_").replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, "_");
}

// Server-side file upload to R2 — avoids browser CORS restrictions on direct R2 PUTs.
// Usage: POST multipart/form-data with `file` (Blob) and `bucket` (string) fields.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  if (!file.type.startsWith("image/"))
    return NextResponse.json({ error: "file must be an image" }, { status: 400 });
  if (file.size > MAX_SIZE)
    return NextResponse.json({ error: "file too large (max 20MB)" }, { status: 400 });

  const uniqueId = crypto.randomUUID();
  const storagePath = `${user.id}/${uniqueId}-${sanitizeFileName(file.name)}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  await r2.send(new PutObjectCommand({
    Bucket: bucket,
    Key: storagePath,
    Body: buffer,
    ContentType: file.type,
  }));

  return NextResponse.json({ storagePath, id: uniqueId });
}
