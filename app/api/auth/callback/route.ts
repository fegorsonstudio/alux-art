import { createClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  let next = searchParams.get("next") ?? "/studio";
  if (!next.startsWith("/")) next = "/studio";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const displayName = typeof user.user_metadata?.full_name === "string"
          ? user.user_metadata.full_name
          : user.email ?? "";

        await sql`
          INSERT INTO profiles (id, email, display_name, updated_at)
          VALUES (${user.id}, ${user.email ?? ""}, ${displayName}, NOW())
          ON CONFLICT (id) DO UPDATE SET
            email = EXCLUDED.email,
            display_name = CASE WHEN profiles.display_name IS NULL OR profiles.display_name = ''
              THEN EXCLUDED.display_name ELSE profiles.display_name END,
            updated_at = NOW()
        `.catch((err) => console.error("[auth callback] profile upsert failed:", err));
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("[auth callback] code exchange failed:", error.message);
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
