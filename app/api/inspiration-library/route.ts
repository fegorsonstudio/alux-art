import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data, error } = await service
    .from("inspiration_images")
    .select("*")
    .eq("user_id", user.id)
    .order("last_used_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const signedImages = await Promise.all((data ?? []).map(async (img) => {
    const { data: signed } = await service.storage
      .from(img.storage_bucket)
      .createSignedUrl(img.storage_path, 3600);
    return signed?.signedUrl ? { ...img, url: signed.signedUrl } : null;
  }));
  const images = signedImages.filter(Boolean);

  return NextResponse.json({ images });
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
    await service.from("inspiration_images").delete().eq("id", imageId).eq("user_id", user.id);
  } else {
    await service.from("inspiration_images").delete().eq("user_id", user.id);
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contentType = request.headers.get("content-type") ?? "";
  let imageId: string | null = null;
  let tag: string | null | undefined;
  let note: string | null | undefined;
  let isMeta = false;

  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    imageId = body.id ?? null;
    tag = body.tag ?? null;
    note = body.note ?? null;
    isMeta = true;
  } else {
    const form = await request.formData();
    imageId = form.get("id") as string | null;
  }

  if (!imageId) return NextResponse.json({ error: "Missing image id" }, { status: 400 });

  const service = createServiceClient();
  const updates: Record<string, unknown> = { last_used_at: new Date().toISOString() };
  if (isMeta) {
    updates.tag = tag ?? null;
    updates.note = note ?? null;
  }

  const { error } = await service
    .from("inspiration_images")
    .update(updates)
    .eq("id", imageId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
