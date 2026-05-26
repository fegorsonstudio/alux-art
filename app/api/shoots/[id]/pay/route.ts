import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { normalizePackageSize } from "@/lib/types";
import sql from "@/lib/db";

const PRICE_KEYS = [
  "price_1_ngn", "price_5_ngn", "price_10_ngn",
  "price_1_usd", "price_5_usd", "price_10_usd",
  "platform_price_1_ngn", "platform_price_5_ngn", "platform_fee_ngn",
];

const NGN_DEFAULTS: Record<number, number> = { 1: 1500, 5: 7500, 10: 15000 };
const USD_DEFAULTS: Record<number, number> = { 1: 1, 5: 5, 10: 10 };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [shoot] = await sql`SELECT * FROM shoots WHERE id = ${id} AND user_id = ${user.id}`;
  if (!shoot) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (shoot.status !== "PENDING_PAYMENT") {
    return NextResponse.json({ error: "This shoot has already been paid or is not payable" }, { status: 409 });
  }

  const isAdmin = user.email === process.env.ADMIN_EMAIL;
  const packageSize = normalizePackageSize(shoot.package_size);

  // Admin bypass — no payment required
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

  // Read explicit package prices from app_config
  const rows = await sql`SELECT key, value FROM app_config WHERE key = ANY(${PRICE_KEYS})`;
  const map = Object.fromEntries(rows.map((r) => [r.key as string, r.value as string]));

  const getPrice = (pkg: number, currency: string): number => {
    const isUsd = currency === "USD";
    const newKey = `price_${pkg}_${isUsd ? "usd" : "ngn"}`;
    const legacyKey = pkg === 10 ? "platform_fee_ngn" : `platform_price_${pkg}_ngn`;
    const raw = map[newKey] ?? (!isUsd ? map[legacyKey] : undefined);
    const v = raw ? parseFloat(raw) : 0;
    const defaults = isUsd ? USD_DEFAULTS : NGN_DEFAULTS;
    return v > 0 ? v : (defaults[pkg] ?? defaults[10]);
  };

  const price = Math.round(getPrice(packageSize, shoot.currency as string) * 100);

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
    INSERT INTO payments (id, shoot_id, user_id, status, amount_ngn, provider, provider_reference, created_at)
    VALUES (
      ${crypto.randomUUID()}, ${id}, ${user.id}, 'pending',
      ${Math.round(price / 100)}, 'paystack',
      ${paystackData.data.reference}, NOW()
    )
  `;

  return NextResponse.json({
    authorization_url: paystackData.data.authorization_url,
    reference: paystackData.data.reference,
  });
}
