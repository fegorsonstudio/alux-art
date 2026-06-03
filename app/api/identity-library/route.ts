import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { r2ProxyUrl, r2Upload, r2Delete } from "@/lib/r2";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await sql`
    SELECT * FROM identity_images WHERE user_id = ${user.id} ORDER BY last_used_at DESC
  `;

  const images = data.map((img) => ({
    ...img,
    url: r2ProxyUrl(img.storage_bucket as string, img.storage_path as string),
  }));

  return NextResponse.json({ images });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file") as File;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
  const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 15 MB)" }, { status: 413 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Only JPEG, PNG, WebP, and HEIC images are allowed" }, { status: 415 });
  }

  const ext = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
  const safePath = `${user.id}/${crypto.randomUUID()}.${ext}`;

  try {
    await r2Upload("identity-images", safePath, file, file.type);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 500 });
  }

  const displayName = file.name.slice(0, 200);
  const now = new Date();
  const [record] = await sql`
    INSERT INTO identity_images (user_id, name, type, size, storage_bucket, storage_path, created_at, last_used_at)
    VALUES (${user.id}, ${displayName}, ${file.type}, ${file.size}, 'identity-images', ${safePath}, ${now}, ${now})
    RETURNING *
  `;

  const url = r2ProxyUrl("identity-images", safePath);
  return NextResponse.json({ image: { ...record, url } });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const imageId = searchParams.get("id");

  if (imageId) {
    const [img] = await sql`SELECT storage_bucket, storage_path FROM identity_images WHERE id = ${imageId} AND user_id = ${user.id}`;
    if (img) {
      await r2Delete(img.storage_bucket as string, [img.storage_path as string]).catch(() => {});
      await sql`DELETE FROM identity_images WHERE id = ${imageId}`;
    }
  } else {
    const imgs = await sql`SELECT storage_bucket, storage_path FROM identity_images WHERE user_id = ${user.id}`;
    if (imgs.length > 0) {
      const byBucket = new Map<string, string[]>();
      for (const img of imgs) {
        const b = img.storage_bucket as string;
        if (!byBucket.has(b)) byBucket.set(b, []);
        byBucket.get(b)!.push(img.storage_path as string);
      }
      await Promise.allSettled(Array.from(byBucket.entries()).map(([b, paths]) => r2Delete(b, paths)));
      await sql`DELETE FROM identity_images WHERE user_id = ${user.id}`;
    }
  }

  return NextResponse.json({ ok: true });
}
