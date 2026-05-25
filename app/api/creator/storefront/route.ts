import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { THEMES, FONTS } from "@/lib/storefront-themes";

const VALID_THEMES = THEMES.map((t) => t.value);
const VALID_FONTS = FONTS.map((f) => f.value);

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [creator] = await sql`SELECT id FROM creators WHERE user_id = ${user.id}`;
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 });

  const body = await req.json() as { theme?: string; fontFamily?: string };
  const updates: Record<string, string> = {};
  if (body.theme && VALID_THEMES.includes(body.theme)) updates.theme = body.theme;
  if (body.fontFamily && VALID_FONTS.includes(body.fontFamily)) updates.font_family = body.fontFamily;

  if (Object.keys(updates).length === 0) return NextResponse.json({ ok: true });

  await sql`UPDATE creators SET ${sql(updates)} WHERE id = ${creator.id}`;
  return NextResponse.json({ ok: true });
}
