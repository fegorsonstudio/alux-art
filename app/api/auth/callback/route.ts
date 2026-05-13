import { createClient, createServiceClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const service = createServiceClient();
      const email = data.user.email ?? "";
      const displayName = typeof data.user.user_metadata?.full_name === "string"
        ? data.user.user_metadata.full_name
        : email;

      await service.from("profiles").upsert({
        id: data.user.id,
        email,
        display_name: displayName,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
