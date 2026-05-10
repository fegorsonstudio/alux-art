import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { ngn, usd } = await request.json();
  const service = createServiceClient();
  const { data } = await service.from("pricing_configs").insert({ ngn, usd, updated_at: new Date().toISOString() }).select().single();
  return NextResponse.json({ pricing: data });
}
