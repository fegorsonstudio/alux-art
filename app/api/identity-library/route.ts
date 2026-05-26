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

  const path = `${user.id}/${Date.now()}-${file.name}`;

  try {
    await r2Upload("identity-images", path, file, file.type);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 500 });
  }

  const now = new Date();
  const [record] = await sql`
    INSERT INTO identity_images (user_id, name, type, size, storage_bucket, storage_path, created_at, last_used_at)
    VALUES (${user.id}, ${file.name}, ${file.type}, ${file.size}, 'identity-images', ${path}, ${now}, ${now})
    RETURNING *
  `;

  const url = await r2SignedDownloadUrl("identity-images", path, 3600).catch(() => null);
  return NextResponse.json({ image: { ...record, url } });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const imageId = searchParams.get("id");

  if (imageId) {
    const [img] = await sql`SELECT * FROM identity_images WHERE id = ${imageId} AND user_id = ${user.id}`;
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
