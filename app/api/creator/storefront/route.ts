import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import { THEMES, FONTS } from "@/lib/storefront-themes";

const VALID_THEMES = THEMES.map(t => t.value);
const VALID_FONTS = FONTS.map(f => f.value);

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: creator } = await service
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 });

  const body = await req.json() as { theme?: string; fontFamily?: string };
  const updates: Record<string, string> = {};
  if (body.theme && VALID_THEMES.includes(body.theme)) updates.theme = body.theme;
  if (body.fontFamily && VALID_FONTS.includes(body.fontFamily)) updates.font_family = body.fontFamily;

  if (Object.keys(updates).length === 0) return NextResponse.json({ ok: true });

  await service.from("creators").update(updates).eq("id", creator.id);
  return NextResponse.json({ ok: true });
}
