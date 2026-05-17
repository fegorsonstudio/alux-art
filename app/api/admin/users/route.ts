import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId, banned } = await request.json();
  const service = createServiceClient();
  const { data } = await service
    .from("profiles")
    .update({ banned, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select()
    .single();
  return NextResponse.json({ user: data });
}
