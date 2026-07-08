import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = (
    process.env.SITE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://aluxartandframes.shop"
  ).replace(/\/$/, "");
  const code = searchParams.get("code");
  let next = searchParams.get("next") ?? "/studio";
  if (!next.startsWith("/")) next = "/studio";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // Build the redirect response up front and write the session cookies directly onto it.
  // Setting cookies via next/headers and returning a separate redirect is unreliable on
  // Safari/iOS (session sometimes doesn't stick → "sign in twice"). Writing them onto the
  // exact response we return guarantees the Set-Cookie rides the redirect.
  const response = NextResponse.redirect(`${origin}${next}`);
  response.headers.set("Cache-Control", "no-store");

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("[auth callback] code exchange failed:", error.message);
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

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

  return response;
}
