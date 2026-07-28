import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { packagePrice } from "@/lib/types";
import { isAdminEmail } from "@/lib/auth";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return null;
  return user;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const templates = await sql`
    SELECT t.id, t.title, t.status, t.price_ngn, t.price_1_ngn, t.price_5_ngn, t.creator_id,
           t.is_sponsored, t.sponsor_name, t.sponsor_package_size,
           t.sponsor_total_limit, t.sponsor_used_count, t.sponsor_expires_at,
           c.display_name AS creator_display_name
    FROM templates t
    LEFT JOIN creators c ON c.id = t.creator_id
    ORDER BY t.created_at DESC
  `;

  return NextResponse.json({
    templates: templates.map((t) => ({
      ...t,
      creators: t.creator_display_name ? { display_name: t.creator_display_name } : null,
    })),
  });
}

export async function PATCH(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [feeRow] = await sql`SELECT value FROM app_config WHERE key = 'platform_fee_ngn'`;
  const platformFeeNgn = parseInt(feeRow?.value ?? "15000", 10);

  const body = await request.json() as {
    id: string; priceNgn?: number; price1Ngn?: number | null; price5Ngn?: number | null;
    isSponsored?: boolean; sponsorName?: string | null; sponsorPackageSize?: number | null;
    sponsorTotalLimit?: number | null; sponsorExpiresAt?: string | null; resetSponsorCount?: boolean;
  };
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date() };
  if (body.priceNgn != null && body.priceNgn > platformFeeNgn) updates.price_ngn = body.priceNgn;
  if (body.price1Ngn != null && body.price1Ngn > packagePrice(platformFeeNgn, 1)) updates.price_1_ngn = body.price1Ngn;
  if (body.price1Ngn === null) updates.price_1_ngn = null;
  if (body.price5Ngn != null && body.price5Ngn > packagePrice(platformFeeNgn, 5)) updates.price_5_ngn = body.price5Ngn;
  if (body.price5Ngn === null) updates.price_5_ngn = null;

  // ── Sponsorship: a brand funds this template so buyers book it free ────────
  // Turning it on requires a package size AND a total cap, so a campaign can
  // never run up an unbounded generation bill.
  if (body.isSponsored === true) {
    const pkg = body.sponsorPackageSize;
    if (!([1, 5, 10] as const).includes(pkg as 1 | 5 | 10)) {
      return NextResponse.json({ error: "sponsorPackageSize must be 1, 5 or 10" }, { status: 400 });
    }
    if (!Number.isInteger(body.sponsorTotalLimit) || (body.sponsorTotalLimit as number) < 1) {
      return NextResponse.json(
        { error: "A total booking cap is required before a template can be sponsored" },
        { status: 400 }
      );
    }
    updates.is_sponsored = true;
    updates.sponsor_package_size = pkg;
    updates.sponsor_total_limit = body.sponsorTotalLimit;
    updates.sponsor_name = typeof body.sponsorName === "string" && body.sponsorName.trim()
      ? body.sponsorName.trim().slice(0, 60)
      : null;
    updates.sponsor_expires_at = typeof body.sponsorExpiresAt === "string" && body.sponsorExpiresAt
      ? body.sponsorExpiresAt
      : null;
  } else if (body.isSponsored === false) {
    updates.is_sponsored = false;
  }
  // Lets a campaign be re-run without editing the DB by hand.
  if (body.resetSponsorCount === true) updates.sponsor_used_count = 0;

  if (Object.keys(updates).length <= 1) return NextResponse.json({ ok: true });

  await sql`UPDATE templates SET ${sql(updates)} WHERE id = ${body.id}`;
  return NextResponse.json({ ok: true });
}
