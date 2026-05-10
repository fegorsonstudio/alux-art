import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const isAdmin = user.email === process.env.ADMIN_EMAIL;

  const query = service.from("shoots").select("*, shoot_images(*)").eq("id", id);
  if (!isAdmin) query.eq("user_id", user.id);
  const { data: shoot } = await query.single();

  if (!shoot) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Generate signed preview URLs for completed images
  const images = await Promise.all((shoot.shoot_images ?? []).map(async (img: Record<string, unknown>) => {
    if (img.preview_storage_path) {
      const { data } = await service.storage
        .from(img.preview_storage_bucket as string)
        .createSignedUrl(img.preview_storage_path as string, 3600);
      return { ...img, previewUrl: data?.signedUrl };
    }
    return img;
  }));

  return NextResponse.json({ shoot: { ...shoot, shoot_images: images } });
}
