import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { isAdminEmail } from "@/lib/auth";
import { INTERNAL_BASE_URL } from "@/lib/site-url";
import { paidEnough, reportPaymentMismatch } from "@/lib/payment-checks";
import { fulfilTemplatePurchase } from "@/lib/template-purchase";
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
    SELECT id, status, user_id, currency FROM shoots
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
  // What this order was priced at, to check the confirmed charge against.
  let expectedMajor: number | null = null;
  let expectedCurrency: string = (shoot.currency as string) ?? "NGN";
  let purchaseId: string | null = null;

  const [directPayment] = await sql`
    SELECT provider, provider_reference, amount_ngn FROM payments
    WHERE shoot_id = ${id}
    ORDER BY created_at DESC LIMIT 1
  `;
  if (directPayment?.provider_reference) {
    provider = (directPayment.provider as PaymentProvider) ?? "paystack";
    providerReference = directPayment.provider_reference as string;
    expectedMajor = Number(directPayment.amount_ngn);
  }

  if (!providerReference) {
    // Marketplace flow — read from template_purchases
    const [purchase] = await sql`
      SELECT id, payment_provider, provider_reference, paystack_reference, amount_ngn, amount_usd, currency
      FROM template_purchases
      WHERE shoot_id = ${id}
      ORDER BY created_at DESC LIMIT 1
    `;
    if (purchase) {
      provider = (purchase.payment_provider as PaymentProvider) ?? "paystack";
      providerReference = (purchase.provider_reference ?? purchase.paystack_reference) as string | null;
      purchaseId = purchase.id as string;
      expectedCurrency = String(purchase.currency || "NGN").toUpperCase();
      expectedMajor = expectedCurrency === "USD" ? Number(purchase.amount_usd ?? 0) : Number(purchase.amount_ngn ?? 0);
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

  // A successful charge is not enough: it must cover this order's price.
  if (expectedMajor == null || !paidEnough(verified.amountNgn, verified.currency, expectedMajor, expectedCurrency)) {
    await reportPaymentMismatch({ where: "verify-payment button", reference: providerReference, paidMajor: verified.amountNgn,
      paidCurrency: verified.currency, expectedMajor, expectedCurrency, order: `shoot ${id}` });
    return NextResponse.json({
      error: "This payment does not match the order's price, so it could not be applied. The studio has been told and will sort it out.",
    }, { status: 409 });
  }

  let queuedNow = false;
  if (purchaseId) {
    // Marketplace: the same fulfilment the webhook uses, so the sale counts,
    // the coupon's use and the creator's email happen whichever arrives first.
    const { queued } = await fulfilTemplatePurchase({ purchaseId, shootId: id });
    queuedNow = queued;
  } else {
    // Optimistic lock: only transition if still PENDING_PAYMENT to prevent double-activation
    const [queued] = await sql`
      UPDATE shoots SET status = 'QUEUED', updated_at = ${now}
      WHERE id = ${id} AND status = 'PENDING_PAYMENT'
      RETURNING id
    `;
    queuedNow = !!queued;
    if (queued) {
      await sql`
        UPDATE payments
        SET status = 'success', paid_at = ${now}
        WHERE shoot_id = ${id} AND provider_reference = ${providerReference}
      `;
    }
  }

  if (!queuedNow) {
    return NextResponse.json({ ok: true, status: "already_activated" });
  }

  // Fire generation worker
  fetch(`${INTERNAL_BASE_URL}/api/shoots/${id}/start`, {
    method: "POST",
    headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "" },
  }).catch(() => {});

  return NextResponse.json({ ok: true, provider: verified.provider });
}
