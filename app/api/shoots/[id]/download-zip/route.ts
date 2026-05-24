import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import { r2Download, r2Upload } from "@/lib/r2";

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
  if (completedImages.length === 0) {
    return NextResponse.json({ error: "No completed images available to download yet." }, { status: 400 });
  }

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  for (const img of completedImages) {
    try {
      const fileData = await r2Download(
        img.download_storage_bucket as string,
        img.download_storage_path as string
      );
      const ext = (img.download_storage_path as string).endsWith(".png") ? "png" : "jpg";
      zip.file(`portrait-${img.slot}.${ext}`, await fileData.arrayBuffer());
    } catch (err) {
      console.error("[download-zip] R2 download error:", img.download_storage_path, err instanceof Error ? err.message : err);
    }
  }

  if (Object.keys(zip.files).length === 0) {
    return NextResponse.json({ error: "Could not read any image files for this shoot." }, { status: 500 });
  }

  const zipBuf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });

  // Best-effort cache to storage — silently skip if bucket/columns not yet migrated
  try {
    const zipPath = `${user.id}/${id}/shoot-${id}.zip`;
    await r2Upload("shoot-zips", zipPath, zipBuf, "application/zip");
    await service.from("shoots").update({
      zip_storage_bucket: "shoot-zips",
      zip_storage_path: zipPath,
      zip_status: "ready",
    }).eq("id", id);
  } catch { /* non-fatal — ZIP still returned inline */ }

  return new Response(zipBuf.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="aluxart-portraits-${id.slice(0, 8)}.zip"`,
      "Content-Length": String(zipBuf.byteLength),
    },
  });
}
