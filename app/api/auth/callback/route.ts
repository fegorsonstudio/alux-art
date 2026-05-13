import { createClient, createServiceClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  let next = searchParams.get("next") ?? "/";
  if (!next.startsWith("/")) next = "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const service = createServiceClient();
        const displayName = typeof user.user_metadata?.full_name === "string"
          ? user.user_metadata.full_name
          : user.email ?? "";

        const { error: profileError } = await service.from("profiles").upsert({
          id: user.id,
          display_name: displayName,
          updated_at: new Date().toISOString(),
        }, { onConflict: "id" });
        if (profileError) console.error("[auth callback] profile upsert failed:", profileError.message);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("[auth callback] code exchange failed:", error.message);
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
