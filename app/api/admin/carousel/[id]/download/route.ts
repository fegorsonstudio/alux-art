import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import sql from "@/lib/db";
import { r2Download } from "@/lib/r2";
import { requireAdmin, cleanId, loadPost, slidesFor, BUCKET } from "@/lib/carousel/posts";

/**
 * Everything one post needs, in one zip, for posting by hand: every slide at
 * full size (1080 × 1350 JPEG, in posting order), the caption, and the story
 * GIF if one has been made. Drawn fresh from what is saved, so the zip always
 * matches the preview.
 */

export const maxDuration = 120;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = cleanId((await params).id);
  const row = await loadPost(id);
  if (!row) return NextResponse.json({ error: "No such post." }, { status: 404 });

  let slides: Buffer[];
  try {
    slides = await slidesFor(row);
  } catch (e) {
    return NextResponse.json({ error: `Could not draw the slides: ${(e as Error).message}`.slice(0, 200) }, { status: 500 });
  }
  if (!slides.length) return NextResponse.json({ error: "Nothing to download yet — add the photos or a card." }, { status: 400 });

  const zip = new JSZip();
  slides.forEach((s, i) => zip.file(`slides/${String(i + 1).padStart(2, "0")}.jpg`, s));
  zip.file("caption.txt", row.caption ?? "");
  const [gif] = await sql<{ r2_key: string }[]>`SELECT r2_key FROM carousel_gifs WHERE local_id = ${id}`;
  if (gif) {
    try { zip.file("story.gif", (await r2Download(BUCKET, gif.r2_key)).buffer); } catch { /* the slides still go */ }
  }

  const body = await zip.generateAsync({ type: "uint8array", compression: "STORE" });
  // "S1 · Story 01 · Ep 1 — The Asoebi Group Chat" → "S1-Story-01-Ep-1-The-Asoebi-Group-Chat.zip"
  const name = row.title.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || id;
  return new NextResponse(Buffer.from(body), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${name}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
