import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { isAdminEmail } from "@/lib/auth";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const email = user.email ?? "";
  const displayName = typeof user.user_metadata?.full_name === "string"
    ? user.user_metadata.full_name
    : email;

  const [profile] = await sql`
    INSERT INTO profiles (id, email, display_name, updated_at)
    VALUES (${user.id}, ${email}, ${displayName}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      display_name = EXCLUDED.display_name,
      updated_at = NOW()
    RETURNING *
  `;

  const isAdmin = isAdminEmail(user.email);

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: profile?.display_name ?? displayName,
      role: isAdmin ? "admin" : "user",
      currency: profile?.currency ?? "NGN",
      banned: profile?.banned ?? false,
    },
  });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const currency = body.currency === "USD" ? "USD" : "NGN";
  await sql`
    INSERT INTO profiles (id, email, currency, updated_at)
    VALUES (${user.id}, ${user.email ?? ""}, ${currency}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      currency = EXCLUDED.currency,
      updated_at = NOW()
  `;

  return NextResponse.json({ ok: true });
}
