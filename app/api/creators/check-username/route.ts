import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

const RESERVED = new Set([
  "api", "admin", "login", "logout", "signup", "register", "marketplace",
  "creators", "dashboard", "creator-dashboard", "support", "legal", "pricing",
  "about", "contact", "terms", "privacy", "help", "studio", "workspace",
  "alux", "aluxart", "fal", "supabase",
]);

const USERNAME_RE = /^[a-z0-9][a-z0-9_-]{2,29}$/;

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get("q")?.toLowerCase().trim();

  if (!username) return NextResponse.json({ error: "Missing q" }, { status: 400 });

  if (!USERNAME_RE.test(username)) {
    return NextResponse.json({
      available: false,
      reason: "3–30 characters, lowercase letters, numbers, hyphens and underscores only. Must start with a letter or number.",
    });
  }

  if (RESERVED.has(username)) {
    return NextResponse.json({ available: false, reason: "This username is reserved." });
  }

  const [row] = await sql`SELECT id FROM creators WHERE LOWER(username) = ${username}`;
  return NextResponse.json({ available: !row });
}
