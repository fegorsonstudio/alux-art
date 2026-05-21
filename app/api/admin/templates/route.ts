import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import { packagePrice } from "@/lib/types";

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user || user.email !== process.env.ADMIN_EMAIL) return null;
  return user;
}

export async function GET() {
  const supabase = await createClient();
  if (!await requireAdmin(supabase)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const service = createServiceClient();
  const { data: templates } = await service
    .from("templates")
    .select("id, title, status, price_ngn, price_1_ngn, price_5_ngn, creator_id, creators(display_name)")
    .order("created_at", { ascending: false });

  return NextResponse.json({ templates: templates ?? [] });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  if (!await requireAdmin(supabase)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const service = createServiceClient();
  const { data: feeRow } = await service.from("app_config").select("value").eq("key", "platform_fee_ngn").single();
  const platformFeeNgn = parseInt(feeRow?.value ?? "15000", 10);

  const body = await request.json() as { id: string; priceNgn?: number; price1Ngn?: number | null; price5Ngn?: number | null };
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.priceNgn != null && body.priceNgn > platformFeeNgn) updates.price_ngn = body.priceNgn;
  if (body.price1Ngn != null && body.price1Ngn > packagePrice(platformFeeNgn, 1)) updates.price_1_ngn = body.price1Ngn;
  if (body.price1Ngn === null) updates.price_1_ngn = null;
  if (body.price5Ngn != null && body.price5Ngn > packagePrice(platformFeeNgn, 5)) updates.price_5_ngn = body.price5Ngn;
  if (body.price5Ngn === null) updates.price_5_ngn = null;

  if (Object.keys(updates).length <= 1) return NextResponse.json({ ok: true });

  const { error } = await service.from("templates").update(updates).eq("id", body.id);
  if (error) return NextResponse.json({ error: "Update failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
