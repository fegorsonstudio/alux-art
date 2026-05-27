import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { isAdminEmail } from "@/lib/auth";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return null;
  return user;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await request.json() as Record<string, unknown>;

  const updates: Record<string, unknown> = {};

  if (typeof body.isActive === "boolean") updates.is_active = body.isActive;
  if (typeof body.description === "string") updates.description = body.description;
  if (Number.isInteger(body.maxUses)) updates.max_uses = (body.maxUses as number) > 0 ? body.maxUses : null;
  if (typeof body.expiresAt === "string") updates.expires_at = body.expiresAt || null;

  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  updates.updated_at = new Date();

  const [coupon] = await sql`
    UPDATE coupons SET ${sql(updates)} WHERE id = ${id} RETURNING *
  `.catch(() => [null]);

  if (!coupon) return NextResponse.json({ error: "Update failed" }, { status: 500 });
  return NextResponse.json({ coupon });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await sql`DELETE FROM coupons WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
