import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

const MAX_SIZE = 20 * 1024 * 1024;
const ALLOWED_BUCKETS = new Set(["identity-images", "inspiration-images", "template-images"]);

function sanitizeFileName(name: string) {
  return name.replace(/[\\/]/g, "_").replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, "_");
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { filename, contentType, size, bucket } = body;

  if (typeof filename !== "string" || !filename.trim())
    return NextResponse.json({ error: "filename required" }, { status: 400 });
  if (typeof contentType !== "string" || !contentType.startsWith("image/"))
    return NextResponse.json({ error: "contentType must be image/*" }, { status: 400 });
  if (typeof size !== "number" || size <= 0 || size > MAX_SIZE)
    return NextResponse.json({ error: "size must be 1-10MB" }, { status: 400 });
  if (typeof bucket !== "string" || !ALLOWED_BUCKETS.has(bucket))
    return NextResponse.json({ error: "invalid bucket" }, { status: 400 });

  const uniqueId = crypto.randomUUID();
  const sanitized = sanitizeFileName(filename);
  const path = `${user.id}/${uniqueId}-${sanitized}`;
  const service = createServiceClient();

  const { data: uploadData, error: uploadErr } = await service.storage
    .from(bucket).createSignedUploadUrl(path);
  if (uploadErr || !uploadData)
    return NextResponse.json({ error: uploadErr?.message ?? "presign failed" }, { status: 500 });

  return NextResponse.json({
    uploadUrl:     uploadData.signedUrl,
    uploadToken:   uploadData.token,
    id:            uniqueId,
    name:          filename,
    type:          contentType,
    size,
    storageBucket: bucket,
    storagePath:   path,
  });
}
