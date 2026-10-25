import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { createClient } from "@/lib/supabase-server";
import { isAdminEmail } from "@/lib/auth";
import { r2Download } from "@/lib/r2";
import { episodeFiles, sponsorshipForViewer } from "@/lib/drama/sponsor";

/**
 * One episode, everything in one zip, for the season's sponsor (or an admin):
 * the slides as posted (slides/NN.jpg), caption.txt, the cover video with the
 * soundtrack and the soundtrack itself when they were made. Files are copied
 * from storage as they are — nothing is redrawn — so the zip is what posted.
 */
export const maxDuration = 120;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; n: string }> }) {
  const { id, n: nParam } = await params;
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const sp = await sponsorshipForViewer(id, { id: user.id, admin: isAdminEmail(user.email) });
  if (!sp) return NextResponse.json({ error: "Not yours." }, { status: 403 });
  if (!["paid", "producing", "delivered"].includes(sp.status)) return NextResponse.json({ error: "The payment is not confirmed yet." }, { status: 402 });
  const n = parseInt(nParam, 10);
  const ep = (await episodeFiles(sp.story_id)).find((e) => e.n === n);
  if (!ep) return NextResponse.json({ error: "That episode is not made yet." }, { status: 404 });
  if (!ep.slides.length) return NextResponse.json({ error: "This episode's slides are not stored yet." }, { status: 404 });

  const zip = new JSZip();
  for (let i = 0; i < ep.slides.length; i++) {
    const { buffer } = await r2Download("generated-4k", ep.slides[i]);
    zip.file(`slides/${String(i + 1).padStart(2, "0")}.jpg`, buffer);
  }
  zip.file("caption.txt", ep.caption);
  for (const [name, key] of [["cover-with-sound.mp4", ep.coverVideo], ["soundtrack.m4a", ep.soundtrack]] as const) {
    if (!key) continue;
    try { zip.file(name, (await r2Download("generated-4k", key)).buffer); } catch { /* the slides still go */ }
  }
  zip.file("README.txt",
    `${sp.title} — Episode ${ep.n}: ${ep.title}\nPresented by ${sp.brand_name}\n\n` +
    "slides/01.jpg … 08.jpg  the carousel, in posting order (1080 × 1350)\n" +
    "caption.txt             the caption as posted — keep the two comment words so your audience can vote\n" +
    (ep.coverVideo ? "cover-with-sound.mp4    slide 1 as a 30-second video with the soundtrack — use it as the first item of the carousel\n" : "") +
    (ep.soundtrack ? "soundtrack.m4a          the soundtrack on its own\n" : "") +
    "\nAlux Micro Drama · aluxartandframes.shop/d/drama\n");
  const body = await zip.generateAsync({ type: "uint8array", compression: "STORE" });
  const name = `${sp.title}-Episode-${ep.n}-${ep.title}`.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  return new NextResponse(Buffer.from(body), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${name}.zip"`, "Cache-Control": "no-store" },
  });
}
