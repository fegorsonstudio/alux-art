import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import { normalizePackageSize, packagePrice } from "@/lib/types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: shoot } = await service.from("shoots").select("*").eq("id", id).eq("user_id", user.id).single();
  if (!shoot) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isAdmin = user.email === process.env.ADMIN_EMAIL;
  const packageSize = normalizePackageSize(shoot.package_size);

  // Admin bypass — no payment needed
  if (isAdmin) {
    await service.from("shoots").update({
      status: "QUEUED",
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    const origin = new URL(request.url).origin;
    fetch(`${origin}/api/shoots/${id}/start`, {
      method: "POST",
      headers: process.env.INTERNAL_API_SECRET ? { "x-internal-secret": process.env.INTERNAL_API_SECRET } : {},
      cache: "no-store",
    }).catch(console.error);
    return NextResponse.json({ bypass: true });
  }

  // Get pricing
  const { data: pricing } = await service
    .from("pricing_configs")
    .select("ngn, usd")
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  const basePrice = shoot.currency === "USD" ? (pricing?.usd ?? 10) : (pricing?.ngn ?? 15000);
  const price = packagePrice(basePrice, packageSize) * 100;

  // Initialize Paystack
  const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: user.email,
      amount: price,
      currency: shoot.currency,
      metadata: { shoot_id: id, user_id: user.id, package_size: packageSize },
      callback_url: `${process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin}/`,
    }),
  });

  const paystackData = await paystackRes.json();
  if (!paystackData.status) {
    return NextResponse.json({ error: paystackData.message }, { status: 500 });
  }

  // Record payment attempt
  await service.from("payments").insert({
    id: crypto.randomUUID(),
    shoot_id: id,
    user_id: user.id,
    status: "pending",
    currency: shoot.currency,
    amount: price,
    provider: "paystack",
    provider_reference: paystackData.data.reference,
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({
    authorization_url: paystackData.data.authorization_url,
    reference: paystackData.data.reference,
  });
}
