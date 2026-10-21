import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";

/**
 * GET /d/go/<code> → the brand's product page. The button a viewer gets after
 * commenting a brand's word on an episode points here, so each tap is counted
 * for the brand's report (lib/drama/brands.ts). Nothing about the viewer is kept.
 * Under /d/ so the site's sign-in middleware never stands in the way.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const home = `${SITE_URL.replace(/\/$/, "")}/d/drama`;
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(code)) return NextResponse.redirect(home, 302);
  const [p] = await sql<{ product_url: string | null }[]>`
    UPDATE drama_placements SET taps = taps + 1 WHERE link_code = ${code} AND product_url IS NOT NULL AND status IN ('approved', 'placed')
    RETURNING product_url`;
  return NextResponse.redirect(p?.product_url ?? home, 302);
}
