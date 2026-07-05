import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { isAdminEmail } from "@/lib/auth";
import { SITE_URL } from "@/lib/site-url";
import { verifyPayment } from "@/lib/payment-gateway";
import type { PaymentProvider } from "@/lib/payment-types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = isAdminEmail(user.email);

  const [shoot] = await sql`
    SELECT id, status, user_id FROM shoots
    WHERE id = ${id}
  `;
  if (!shoot) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (shoot.user_id !== user.id && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (shoot.status !== "PENDING_PAYMENT") {
    return NextResponse.json({ ok: true, status: shoot.status, alreadyPaid: true });
  }

  // ── Locate the payment record — check payments table first (studio flow),
  //    then template_purchases (marketplace flow). Read provider from the DB
  //    so we call the correct gateway rather than hardcoding Paystack.
  let provider: PaymentProvider = "paystack";
  let providerReference: string | null = null;

  const [directPayment] = await sql`
    SELECT provider, provider_reference FROM payments
    WHERE shoot_id = ${id}
    ORDER BY created_at DESC LIMIT 1
  `;
  if (directPayment?.provider_reference) {
    provider = (directPayment.provider as PaymentProvider) ?? "paystack";
    providerReference = directPayment.provider_reference as string;
  }

  if (!providerReference) {
    // Marketplace flow — read from template_purchases
    const [purchase] = await sql`
      SELECT payment_provider, provider_reference, paystack_reference
      FROM template_purchases
      WHERE shoot_id = ${id}
      ORDER BY created_at DESC LIMIT 1
    `;
    if (purchase) {
      provider = (purchase.payment_provider as PaymentProvider) ?? "paystack";
      providerReference = (purchase.provider_reference ?? purchase.paystack_reference) as string | null;
    }
  }

  if (!providerReference) {
    return NextResponse.json({
      error: "No payment reference found for this shoot. If you were charged, please contact support with your shoot ID.",
    }, { status: 404 });
  }

  // ── Verify with the correct gateway ─────────────────────────────────────
  let verified: Awaited<ReturnType<typeof verifyPayment>>;
  try {
    verified = await verifyPayment(provider, providerReference);
  } catch (err) {
    console.error("[verify-payment] gateway call failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({
      error: "Could not reach payment gateway — try again shortly.",
    }, { status: 502 });
  }

  if (!verified.success) {
    return NextResponse.json({
      error: "Payment not confirmed yet. If you were charged, wait a minute and try again, or contact support.",
      provider: verified.provider,
    }, { status: 402 });
  }

  const now = new Date().toISOString();

  // Optimistic lock: only transition if still PENDING_PAYMENT to prevent double-activation
  const [queued] = await sql`
    UPDATE shoots SET status = 'QUEUED', updated_at = ${now}
    WHERE id = ${id} AND status = 'PENDING_PAYMENT'
    RETURNING id
  `;

  if (!queued) {
    return NextResponse.json({ ok: true, status: "already_activated" });
  }

  // Update both payment record types that may reference this shoot
  await sql`
    UPDATE payments
    SET status = 'success', paid_at = ${now}
    WHERE shoot_id = ${id} AND provider_reference = ${providerReference}
  `;
  await sql`
    UPDATE template_purchases
    SET status = 'success'
    WHERE shoot_id = ${id}
      AND (provider_reference = ${providerReference} OR paystack_reference = ${providerReference})
      AND status != 'success'
  `;

  // Fire generation worker
  fetch(`${SITE_URL}/api/shoots/${id}/start`, {
    method: "POST",
    headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "" },
  }).catch(() => {});

  return NextResponse.json({ ok: true, provider: verified.provider });
}
