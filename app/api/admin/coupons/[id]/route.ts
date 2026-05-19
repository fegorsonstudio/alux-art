import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user || user.email !== process.env.ADMIN_EMAIL) return null;
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

  const service = createServiceClient();
  const { data, error } = await service
    .from("coupons")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error || !data) return NextResponse.json({ error: "Update failed" }, { status: 500 });
  return NextResponse.json({ coupon: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const service = createServiceClient();
  const { error } = await service.from("coupons").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
