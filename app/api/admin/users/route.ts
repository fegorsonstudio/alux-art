import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { isAdminEmail } from "@/lib/auth";

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
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
