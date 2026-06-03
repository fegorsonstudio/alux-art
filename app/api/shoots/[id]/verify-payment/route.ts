import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [shoot] = await sql`SELECT id, status, user_id FROM shoots WHERE id = ${id} AND user_id = ${user.id}`;
  if (!shoot) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (shoot.status !== "PENDING_PAYMENT") {
    return NextResponse.json({ error: "This shoot is not awaiting payment." }, { status: 409 });
  }

  // Check payments table first (direct studio flow), then template_purchases (marketplace flow)
  let providerReference: string | null = null;

  const [directPayment] = await sql`
    SELECT provider_reference FROM payments
    WHERE shoot_id = ${id} AND provider = 'paystack'
    ORDER BY created_at DESC LIMIT 1
  `;
  if (directPayment?.provider_reference) {
    providerReference = directPayment.provider_reference as string;
  }

  if (!providerReference) {
    const [purchase] = await sql`
      SELECT paystack_reference FROM template_purchases
      WHERE shoot_id = ${id}
      ORDER BY created_at DESC LIMIT 1
    `;
    if (purchase?.paystack_reference) {
      providerReference = purchase.paystack_reference as string;
    }
  }

  if (!providerReference) {
    return NextResponse.json({
      error: "No payment reference found for this shoot. If you were charged, please contact support with your shoot ID.",
    }, { status: 404 });
  }

  // Verify with Paystack
  let paystackData: Record<string, unknown>;
  try {
    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${providerReference}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );
    paystackData = await res.json();
  } catch {
    return NextResponse.json({ error: "Could not reach Paystack. Try again." }, { status: 502 });
  }

  const data = paystackData.data as Record<string, unknown> | null;
  if (!paystackData.status || data?.status !== "success") {
    return NextResponse.json({
      error: "Payment not confirmed yet. If you were charged, wait a minute and try again, or contact support.",
    }, { status: 402 });
  }

  const now = new Date().toISOString();

  // Activate the shoot
  const updated = await sql`
    UPDATE shoots SET status = 'QUEUED', updated_at = ${now}
    WHERE id = ${id} AND status = 'PENDING_PAYMENT'
    RETURNING id
  `;
  if (!updated.length) {
    return NextResponse.json({ error: "Shoot already activated." }, { status: 409 });
  }

  // Mark payment records as success
  await sql`
    UPDATE payments SET status = 'success', paid_at = ${now}
    WHERE shoot_id = ${id} AND provider_reference = ${providerReference}
  `;
  await sql`
    UPDATE template_purchases SET status = 'success'
    WHERE shoot_id = ${id} AND paystack_reference = ${providerReference} AND status != 'success'
  `;

  // Start generation
  fetch(`${SITE_URL}/api/shoots/${id}/start`, {
    method: "POST",
    headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "" },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
