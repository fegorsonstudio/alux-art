import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_BUCKETS = new Set(["identity-images", "inspiration-images"]);

export const runtime = "nodejs";
export const maxDuration = 60;

function sanitizeFileName(name: string) {
  return name.replace(/[\\/]/g, "_").replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, "_");
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const bucket = (form.get("bucket") as string | null) ?? "inspiration-images";
  const saveToLibrary = (form.get("saveToLibrary") as string) === "true";

  if (!ALLOWED_BUCKETS.has(bucket)) {
    return NextResponse.json({ error: "Invalid bucket" }, { status: 400 });
  }

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

    const service = createServiceClient();
    const now = new Date().toISOString();
    if (saveToLibrary && storageBucket === "identity-images") {
      const { error: dbErr } = await service.from("identity_images").upsert({
        id: imageId,
        user_id: user.id,
        name: filename,
        type: contentType,
        size,
        storage_bucket: storageBucket,
        storage_path: storagePath,
        created_at: now,
        last_used_at: now,
      }, { onConflict: "id" });

      if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
    }

    const { data: signed, error: signedErr } = await service.storage.from(storageBucket).createSignedUrl(storagePath, 3600);
    if (signedErr || !signed?.signedUrl) {
      return NextResponse.json({ error: signedErr?.message ?? "Unable to sign uploaded image" }, { status: 500 });
    }

    return NextResponse.json({
      image: {
        id: imageId,
        name: filename,
        type: contentType,
        size,
        storageBucket,
        storagePath,
        url: signed.signedUrl,
      },
    });
  }

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_SIZE) return NextResponse.json({ error: "Max 10MB" }, { status: 400 });

  const service = createServiceClient();
  const uniqueId = crypto.randomUUID();
  const path = `${user.id}/${uniqueId}-${sanitizeFileName(file.name)}`;

  const { error: uploadError } = await service.storage
    .from(bucket)
    .upload(path, file, { contentType: file.type, upsert: true });

  if (uploadError) {
    console.error("[upload] storage error:", uploadError.message);
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: signed } = await service.storage.from(bucket).createSignedUrl(path, 3600);

  const imageId = uniqueId;

  // Optionally persist to identity library
  if (saveToLibrary && bucket === "identity-images") {
    try {
      const now = new Date().toISOString();
      const { error: dbErr } = await service.from("identity_images").insert({
        id: imageId,
        user_id: user.id,
        name: file.name,
        type: file.type,
        size: file.size,
        storage_bucket: bucket,
        storage_path: path,
        created_at: now,
        last_used_at: now,
      });
      if (dbErr) console.error("[upload] identity_images insert error:", dbErr.message);
    } catch (e) {
      console.error("[upload] identity_images insert threw:", e);
    }
  }

  return NextResponse.json({
    image: {
      id: imageId,
      name: file.name,
      type: file.type,
      size: file.size,
      storageBucket: bucket,
      storagePath: path,
      url: signed?.signedUrl,
    },
  });
}
