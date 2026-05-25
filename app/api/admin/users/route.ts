import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId, banned } = await request.json();
  const [profile] = await sql`
    UPDATE profiles SET banned = ${banned}, updated_at = NOW()
    WHERE id = ${userId}
    RETURNING *
  `;
  return NextResponse.json({ user: profile });
}
