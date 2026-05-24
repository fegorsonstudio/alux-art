import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
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

  const [shoot] = await sql`SELECT id, user_id FROM shoots WHERE id = ${id} AND user_id = ${user.id}`;
  if (!shoot) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const completedImages = await sql`
    SELECT slot, download_storage_bucket, download_storage_path FROM shoot_images
    WHERE shoot_id = ${id} AND status = 'COMPLETE' AND download_storage_path IS NOT NULL
  `;

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

  try {
    const zipPath = `${user.id}/${id}/shoot-${id}.zip`;
    await r2Upload("shoot-zips", zipPath, zipBuf, "application/zip");
    await sql`
      UPDATE shoots SET zip_storage_bucket = 'shoot-zips', zip_storage_path = ${zipPath}, zip_status = 'ready'
      WHERE id = ${id}
    `;
  } catch { /* non-fatal */ }

  return new Response(zipBuf.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="aluxart-portraits-${id.slice(0, 8)}.zip"`,
      "Content-Length": String(zipBuf.byteLength),
    },
  });
}
