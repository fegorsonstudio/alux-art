import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import { r2SignedDownloadUrl, r2Upload, r2Delete } from "@/lib/r2";

export async function GET() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data } = await service
    .from("identity_images")
    .select("*")
    .eq("user_id", user.id)
    .order("last_used_at", { ascending: false });

  const signedImages = await Promise.all((data ?? []).map(async (img) => {
    const url = await r2SignedDownloadUrl(img.storage_bucket, img.storage_path, 3600).catch(() => null);
    return url ? { ...img, url } : null;
  }));
  const images = signedImages.filter(Boolean);

  return NextResponse.json({ images });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file") as File;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const service = createServiceClient();
  const path = `${user.id}/${Date.now()}-${file.name}`;

  try {
    await r2Upload("identity-images", path, file, file.type);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 500 });
  }

  const { data: record } = await service.from("identity_images").insert({
    user_id: user.id,
    name: file.name,
    type: file.type,
    size: file.size,
    storage_bucket: "identity-images",
    storage_path: path,
    created_at: new Date().toISOString(),
    last_used_at: new Date().toISOString(),
  }).select().single();

  const url = await r2SignedDownloadUrl("identity-images", path, 3600).catch(() => null);
  return NextResponse.json({ image: { ...record, url } });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const imageId = searchParams.get("id");
  const service = createServiceClient();

  if (imageId) {
    const { data: img } = await service.from("identity_images").select("*").eq("id", imageId).eq("user_id", user.id).single();
    if (img) {
      await r2Delete(img.storage_bucket, [img.storage_path]).catch(() => {});
      await service.from("identity_images").delete().eq("id", imageId);
    }
  } else {
    const { data: imgs } = await service.from("identity_images").select("*").eq("user_id", user.id);
    if (imgs && imgs.length > 0) {
      const byBucket = new Map<string, string[]>();
      for (const img of imgs) {
        if (!byBucket.has(img.storage_bucket)) byBucket.set(img.storage_bucket, []);
        byBucket.get(img.storage_bucket)!.push(img.storage_path);
      }
      await Promise.allSettled(Array.from(byBucket.entries()).map(([b, paths]) => r2Delete(b, paths)));
      await service.from("identity_images").delete().eq("user_id", user.id);
    }
  }

  return NextResponse.json({ ok: true });
}
