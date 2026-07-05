import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { normalizePackageSize } from "@/lib/types";
import sql from "@/lib/db";
import { isAdminEmail } from "@/lib/auth";
import { SITE_URL } from "@/lib/site-url";
import { initializePayment } from "@/lib/payment-gateway";
import type { InitPaymentParams } from "@/lib/payment-types";

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

  const [shoot] = await sql`SELECT id, status, currency, package_size, user_id FROM shoots WHERE id = ${id} AND user_id = ${user.id}`;
  if (!shoot) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (shoot.status !== "PENDING_PAYMENT") {
    return NextResponse.json({ error: "This shoot has already been paid or is not payable" }, { status: 409 });
  }

  const isAdmin = isAdminEmail(user.email);
  const packageSize = normalizePackageSize(shoot.package_size);

  // Admin bypass — no payment required
  if (isAdmin) {
    await sql`
      UPDATE shoots SET status = 'QUEUED', updated_at = NOW()
      WHERE id = ${id} AND status = 'PENDING_PAYMENT'
    `;
    fetch(`${SITE_URL}/api/shoots/${id}/start`, {
      method: "POST",
      headers: process.env.INTERNAL_API_SECRET ? { "x-internal-secret": process.env.INTERNAL_API_SECRET } : {},
      cache: "no-store",
    }).catch(console.error);
    return NextResponse.json({ bypass: true });
  }

  // Read prices from app_config
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

  // price is already in the shoot's currency (whole naira or whole dollars).
  // The gateway abstraction layer handles the ×100 conversion internally.
  const price = getPrice(packageSize, shoot.currency as string);

  const callbackUrl = `${SITE_URL}/studio?shoot_id=${id}&payment=complete`;

  const gatewayParams: InitPaymentParams = {
    email: user.email!,
    amountNgn: price,
    currency: shoot.currency as "NGN" | "USD",
    metadata: { shoot_id: id, user_id: user.id, package_size: packageSize },
    callbackUrl,
  };

  // ── Dual-gateway failover ─────────────────────────────────────────────────
  let paymentResult: Awaited<ReturnType<typeof initializePayment>>;
  let paystackError: unknown = null;
  let flutterwaveError: unknown = null;

  try {
    paymentResult = await initializePayment("paystack", gatewayParams);
  } catch (err) {
    paystackError = err;
    console.warn(`[pay] Paystack failed for shoot ${id}:`, err instanceof Error ? err.message : String(err));

    try {
      paymentResult = await initializePayment("flutterwave", gatewayParams);
    } catch (err2) {
      flutterwaveError = err2;
      console.error(`[pay][both-gateways-failed] shoot=${id} paystack=${paystackError instanceof Error ? paystackError.message : String(paystackError)} flutterwave=${err2 instanceof Error ? err2.message : String(err2)}`);
      return NextResponse.json(
        { error: "Payment processing is temporarily unavailable. Please try again in a few minutes." },
        { status: 503 }
      );
    }
  }

  // Record the payment with the winning provider before redirecting the user.
  // On failure here the user can retry — the shoot stays PENDING_PAYMENT.
  try {
    await sql`
      INSERT INTO payments (id, shoot_id, user_id, status, amount_ngn, provider, provider_reference, created_at)
      VALUES (
        ${crypto.randomUUID()}, ${id}, ${user.id}, 'pending',
        ${Math.round(price)}, ${paymentResult!.provider},
        ${paymentResult!.reference}, NOW()
      )
      ON CONFLICT (provider_reference) DO NOTHING
    `;
  } catch (err) {
    console.error("[pay] payments INSERT failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "Could not record payment — please try again." }, { status: 500 });
  }

  return NextResponse.json({
    authorization_url: paymentResult!.authorizationUrl,
    reference: paymentResult!.reference,
    provider: paymentResult!.provider,
  });
}
