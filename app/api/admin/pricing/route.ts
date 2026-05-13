import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { ngn, usd } = await request.json();
  const nextNgn = Number(ngn);
  const nextUsd = Number(usd);
  if (!Number.isFinite(nextNgn) || nextNgn <= 0 || !Number.isFinite(nextUsd) || nextUsd <= 0) {
    return NextResponse.json({ error: "Enter valid positive prices" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("pricing_configs")
    .upsert({
      id: true,
      ngn: nextNgn,
      usd: nextUsd,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" })
    .select("ngn, usd, updated_at")
    .single();

  if (error) {
    console.error("[admin/pricing] save failed", error);
    return NextResponse.json({ error: "Unable to save pricing" }, { status: 500 });
  }

  return NextResponse.json({ pricing: data });
}
