import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import { fal } from "@fal-ai/client";

fal.config({ credentials: process.env.FAL_KEY });

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data } = await service
    .from("identity_images")
    .select("*")
    .eq("user_id", user.id)
    .order("last_used_at", { ascending: false });

  // Generate signed URLs for each image
  const signedImages = await Promise.all((data ?? []).map(async (img) => {
    const { data: signed } = await service.storage
      .from(img.storage_bucket)
      .createSignedUrl(img.storage_path, 3600);
    return signed?.signedUrl ? { ...img, url: signed.signedUrl } : null;
  }));
  const images = signedImages.filter(Boolean);

  return NextResponse.json({ images });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file") as File;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const service = createServiceClient();
  const path = `${user.id}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await service.storage
    .from("identity-images")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

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

  const { data: signed } = await service.storage
    .from("identity-images")
    .createSignedUrl(path, 3600);

  return NextResponse.json({ image: { ...record, url: signed?.signedUrl } });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const imageId = searchParams.get("id");
  const service = createServiceClient();

  if (imageId) {
    const { data: img } = await service.from("identity_images").select("*").eq("id", imageId).eq("user_id", user.id).single();
    if (img) {
      await service.storage.from(img.storage_bucket).remove([img.storage_path]);
      await service.from("identity_images").delete().eq("id", imageId);
    }
  } else {
    const { data: imgs } = await service.from("identity_images").select("*").eq("user_id", user.id);
    if (imgs) {
      await Promise.all(imgs.map(img => service.storage.from(img.storage_bucket).remove([img.storage_path])));
      await service.from("identity_images").delete().eq("user_id", user.id);
    }
  }

  return NextResponse.json({ ok: true });
}
