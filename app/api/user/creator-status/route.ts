import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ isCreator: false });

  const [creator] = await sql`SELECT id, status FROM creators WHERE user_id = ${user.id} LIMIT 1`;
  return NextResponse.json({ isCreator: Boolean(creator), status: creator?.status ?? null });
}
