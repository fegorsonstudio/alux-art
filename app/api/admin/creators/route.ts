import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user || user.email !== process.env.ADMIN_EMAIL) return null;
  return user;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const creators = await sql`
    SELECT id, user_id, display_name, bank_name, account_number, account_name,
           paystack_subaccount_code, is_active, created_at
    FROM creators ORDER BY created_at DESC
  `;

  const withCounts = await Promise.all(creators.map(async (c) => {
    const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM templates WHERE creator_id = ${c.id}`;
    return { ...c, templateCount: count ?? 0 };
  }));

  return NextResponse.json({ creators: withCounts });
}

export async function PATCH(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json() as { id?: string; isActive?: boolean };
  if (typeof body.id !== "string" || typeof body.isActive !== "boolean") {
    return NextResponse.json({ error: "id and isActive required" }, { status: 400 });
  }

  const [creator] = await sql`
    UPDATE creators SET is_active = ${body.isActive}, updated_at = NOW()
    WHERE id = ${body.id}
    RETURNING *
  `;

  if (!creator) return NextResponse.json({ error: "Update failed" }, { status: 500 });
  return NextResponse.json({ creator });
}
