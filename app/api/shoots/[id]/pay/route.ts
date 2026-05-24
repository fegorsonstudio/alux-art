import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { normalizePackageSize, packagePrice } from "@/lib/types";
import sql from "@/lib/db";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [shoot] = await sql`SELECT * FROM shoots WHERE id = ${id} AND user_id = ${user.id}`;
  if (!shoot) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (shoot.status !== "PENDING_PAYMENT") {
    return NextResponse.json({ error: "This shoot has already been paid or is not payable" }, { status: 409 });
  }

  const isAdmin = user.email === process.env.ADMIN_EMAIL;
  const packageSize = normalizePackageSize(shoot.package_size);

  // Admin bypass
  if (isAdmin) {
    await sql`
      UPDATE shoots SET status = 'QUEUED', updated_at = NOW()
      WHERE id = ${id} AND status = 'PENDING_PAYMENT'
    `;
    const origin = new URL(request.url).origin;
    fetch(`${origin}/api/shoots/${id}/start`, {
      method: "POST",
      headers: process.env.INTERNAL_API_SECRET ? { "x-internal-secret": process.env.INTERNAL_API_SECRET } : {},
      cache: "no-store",
    }).catch(console.error);
    return NextResponse.json({ bypass: true });
  }

  // Get pricing
  const [pricing] = await sql`
    SELECT ngn, usd FROM pricing_configs ORDER BY updated_at DESC LIMIT 1
  `;

  const basePrice = shoot.currency === "USD" ? (pricing?.usd ?? 10) : (pricing?.ngn ?? 15000);
  const price = packagePrice(basePrice, packageSize) * 100;

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

  await sql`
    INSERT INTO payments (id, shoot_id, user_id, status, currency, amount, provider, provider_reference, created_at)
    VALUES (
      ${crypto.randomUUID()}, ${id}, ${user.id}, 'pending',
      ${shoot.currency}, ${price}, 'paystack',
      ${paystackData.data.reference}, NOW()
    )
  `;

  return NextResponse.json({
    authorization_url: paystackData.data.authorization_url,
    reference: paystackData.data.reference,
  });
}
