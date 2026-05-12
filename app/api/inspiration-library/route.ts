import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data, error } = await service
    .from("inspiration_images")
    .select("*")
    .eq("user_id", user.id)
    .order("last_used_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const images = await Promise.all((data ?? []).map(async (img) => {
    const { data: signed } = await service.storage
      .from(img.storage_bucket)
      .createSignedUrl(img.storage_path, 3600);
    return { ...img, url: signed?.signedUrl };
  }));

  return NextResponse.json({ images });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const imageId = searchParams.get("id");
  const service = createServiceClient();

  if (imageId) {
    await service.from("inspiration_images").delete().eq("id", imageId).eq("user_id", user.id);
  } else {
    await service.from("inspiration_images").delete().eq("user_id", user.id);
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData();
  const imageId = form.get("id") as string | null;
  if (!imageId) return NextResponse.json({ error: "Missing image id" }, { status: 400 });

  const service = createServiceClient();
  const { error } = await service
    .from("inspiration_images")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", imageId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
