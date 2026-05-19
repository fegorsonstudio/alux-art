import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const isAdmin = user.email === process.env.ADMIN_EMAIL;

  const { data: shoot } = await service.from("shoots").select("user_id").eq("id", id).single();
  if (!shoot) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (shoot.user_id !== user.id && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Delete in FK-safe order
  await service.from("generation_events").delete().eq("shoot_id", id);
  await service.from("shoot_images").delete().eq("shoot_id", id);
  await service.from("shoot_references").delete().eq("shoot_id", id);
  await service.from("shoots").delete().eq("id", id);

  return NextResponse.json({ ok: true });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const isAdmin = user.email === process.env.ADMIN_EMAIL;

  const query = service.from("shoots").select("*, shoot_images(*)").eq("id", id);
  if (!isAdmin) query.eq("user_id", user.id);
  const { data: shoot } = await query.single();

  if (!shoot) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Generate preview URLs for completed images.
  // Use the stored fal.ai CDN URL for non-composite slots (zero Supabase egress).
  // Quote card slots have a server-side composite stored in Supabase, so those still get signed URLs.
  const images = await Promise.all((shoot.shoot_images ?? []).map(async (img: Record<string, unknown>) => {
    if (img.status === "COMPLETE") {
      if (img.fal_url && img.kind !== "quote") {
        return { ...img, previewUrl: img.fal_url };
      }
      if (img.preview_storage_bucket && img.preview_storage_path) {
        const { data } = await service.storage
          .from(img.preview_storage_bucket as string)
          .createSignedUrl(img.preview_storage_path as string, 3600);
        return { ...img, previewUrl: data?.signedUrl };
      }
    }
    return img;
  }));

  return NextResponse.json({ shoot: { ...shoot, shoot_images: images } });
}
