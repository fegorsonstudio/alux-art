import { NextResponse } from "next/server";
import { r2SignedDownloadUrl } from "@/lib/r2";

/**
 * The Fegorson Studio installer: a stable, shareable link
 * (/d/fegorson/download) that hands the browser a one-hour link straight to
 * the file on R2, where the 369 MB download is fast and resumable. The page
 * at /d/fegorson explains the trial and how to buy a code.
 */
export const dynamic = "force-dynamic";

export const FEGORSON_VERSION = "0.32.0";
const KEY = `fegorson/Fegorson-Studio-Setup-${FEGORSON_VERSION}.exe`;

export async function GET() {
  try {
    const url = await r2SignedDownloadUrl("template-images", KEY, 3600, `Fegorson Studio Setup ${FEGORSON_VERSION}.exe`);
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[fegorson] download link failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The download is not available right now. Try again in a minute." }, { status: 503 });
  }
}
