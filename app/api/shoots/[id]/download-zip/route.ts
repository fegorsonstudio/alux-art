import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

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
  const { data: shoot } = await service
    .from("shoots")
    .select("*, shoot_images(*)")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!shoot) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const completedImages = (shoot.shoot_images ?? []).filter(
    (i: Record<string, unknown>) => i.status === "COMPLETE" && i.download_storage_path
  );
  if (completedImages.length === 0) return NextResponse.json({ error: "No completed images are available to download yet." }, { status: 400 });

  // If ZIP already exists, return its signed URL
  if (shoot.status === "COMPLETE" && shoot.zip_storage_path) {
    const { data: signed } = await service.storage
      .from(shoot.zip_storage_bucket)
      .createSignedUrl(shoot.zip_storage_path, 3600);
    return NextResponse.json({ url: signed?.signedUrl, expiresAt: new Date(Date.now() + 3600000).toISOString() });
  }

  // Build ZIP from all completed images available for this shoot.
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  for (const img of completedImages) {
    const { data: fileData } = await service.storage
      .from(img.download_storage_bucket as string)
      .download(img.download_storage_path as string);
    if (fileData) {
      zip.file(`slot-${img.slot}-${img.kind}.png`, await fileData.arrayBuffer());
    }
  }

  const zipBuf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const zipPath = `${user.id}/${id}/shoot-${id}.zip`;

  await service.storage.from("shoot-zips").upload(zipPath, zipBuf, { contentType: "application/zip", upsert: true });
  await service.from("shoots").update({ zip_storage_bucket: "shoot-zips", zip_storage_path: zipPath, zip_status: "ready" }).eq("id", id);

  const { data: signed } = await service.storage.from("shoot-zips").createSignedUrl(zipPath, 3600);
  return NextResponse.json({ url: signed?.signedUrl, expiresAt: new Date(Date.now() + 3600000).toISOString() });
}
