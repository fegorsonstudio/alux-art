import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  const { id, imageId } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: img } = await service
    .from("shoot_images")
    .select("*")
    .eq("id", imageId)
    .eq("shoot_id", id)
    .single();

  if (!img) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: shoot } = await service
    .from("shoots")
    .select("user_id")
    .eq("id", id)
    .single();
  const isAdmin = user.email === process.env.ADMIN_EMAIL;
  if (!shoot || (!isAdmin && shoot.user_id !== user.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const storagePath = img.download_storage_path ?? img.preview_storage_path;
  const storageBucket = img.download_storage_bucket ?? img.preview_storage_bucket;
  if (!storagePath) return NextResponse.json({ error: "No file" }, { status: 404 });

  const isDownload = request.nextUrl.searchParams.get("download") === "1";
  const filename = `aluxart-slot${img.slot}-${img.kind}.png`;

  const { data: signed } = await service.storage
    .from(storageBucket)
    .createSignedUrl(storagePath, 3600, {
      download: isDownload ? filename : undefined,
    });

  if (!signed?.signedUrl) return NextResponse.json({ error: "Could not sign URL" }, { status: 500 });

  if (isDownload) {
    await service.from("download_logs").insert({
      id: crypto.randomUUID(),
      user_id: user.id,
      shoot_id: id,
      image_id: imageId,
      type: "4k",
      created_at: new Date().toISOString(),
    });

    return NextResponse.redirect(signed.signedUrl);
  }

  // For preview (no download param), just return the signed URL
  return NextResponse.json({
    url: signed.signedUrl,
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    filename,
  });
}
