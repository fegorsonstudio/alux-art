import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createClient } from "@/lib/supabase-server";

const RESERVED = new Set([
  "api", "admin", "login", "logout", "signup", "register", "marketplace",
  "creators", "dashboard", "creator-dashboard", "support", "legal", "pricing",
  "about", "contact", "terms", "privacy", "help", "studio", "workspace",
  "alux", "aluxart", "fal", "supabase",
]);

const USERNAME_RE = /^[a-z0-9][a-z0-9_-]{2,29}$/;

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [creator] = await sql`SELECT id FROM creators WHERE user_id = ${user.id} AND is_active = true`;
  if (!creator) return NextResponse.json({ error: "No creator profile" }, { status: 403 });

  const { username } = await req.json();
  const clean = username?.toLowerCase().trim();

  if (!clean || !USERNAME_RE.test(clean)) {
    return NextResponse.json({
      error: "3–30 characters, lowercase letters, numbers, hyphens and underscores only.",
    }, { status: 400 });
  }

  if (RESERVED.has(clean)) {
    return NextResponse.json({ error: "This username is reserved." }, { status: 400 });
  }

  const [conflict] = await sql`
    SELECT id FROM creators WHERE LOWER(username) = ${clean} AND id != ${creator.id}
  `;
  if (conflict) return NextResponse.json({ error: "Username already taken." }, { status: 409 });

  await sql`UPDATE creators SET username = ${clean} WHERE id = ${creator.id}`;

  return NextResponse.json({ username: clean });
}
