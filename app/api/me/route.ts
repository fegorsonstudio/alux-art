import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const isAdmin = user.email === process.env.ADMIN_EMAIL;

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: profile?.display_name ?? user.user_metadata?.full_name ?? user.email,
      role: isAdmin ? "admin" : "user",
      currency: profile?.currency ?? "NGN",
      banned: profile?.banned ?? false,
    },
  });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const service = createServiceClient();
  await service.from("profiles").upsert({ id: user.id, currency: body.currency, updated_at: new Date().toISOString() });

  return NextResponse.json({ ok: true });
}
