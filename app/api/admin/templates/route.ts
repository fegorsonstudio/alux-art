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

  const body = await request.json() as { id: string; priceNgn?: number; price1Ngn?: number | null; price5Ngn?: number | null };
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date() };
  if (body.priceNgn != null && body.priceNgn > platformFeeNgn) updates.price_ngn = body.priceNgn;
  if (body.price1Ngn != null && body.price1Ngn > packagePrice(platformFeeNgn, 1)) updates.price_1_ngn = body.price1Ngn;
  if (body.price1Ngn === null) updates.price_1_ngn = null;
  if (body.price5Ngn != null && body.price5Ngn > packagePrice(platformFeeNgn, 5)) updates.price_5_ngn = body.price5Ngn;
  if (body.price5Ngn === null) updates.price_5_ngn = null;

  if (Object.keys(updates).length <= 1) return NextResponse.json({ ok: true });

  await sql`UPDATE templates SET ${sql(updates)} WHERE id = ${body.id}`;
  return NextResponse.json({ ok: true });
}
