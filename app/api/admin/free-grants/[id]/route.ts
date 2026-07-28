import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { isAdminEmail } from "@/lib/auth";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return null;
  return user;
}

// Revoke (deactivate) or re-activate a grant. Images already spent are never
// clawed back — those shoots have already been generated.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (typeof body.isActive !== "boolean") {
    return NextResponse.json({ error: "isActive (boolean) is required" }, { status: 400 });
  }

  const [grant] = await sql`
    UPDATE free_grants SET is_active = ${body.isActive}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING *, (images_granted - images_used) AS images_remaining
  `;
  if (!grant) return NextResponse.json({ error: "Grant not found" }, { status: 404 });
  return NextResponse.json({ grant });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  // Keep any grant that has already been used so the ledger stays readable;
  // deactivate it instead of deleting.
  const [used] = await sql`SELECT images_used FROM free_grants WHERE id = ${id}`;
  if (!used) return NextResponse.json({ error: "Grant not found" }, { status: 404 });

  if ((used.images_used as number) > 0) {
    await sql`UPDATE free_grants SET is_active = false, updated_at = NOW() WHERE id = ${id}`;
    return NextResponse.json({ ok: true, deactivated: true });
  }

  await sql`DELETE FROM free_grants WHERE id = ${id}`;
  return NextResponse.json({ ok: true, deleted: true });
}
