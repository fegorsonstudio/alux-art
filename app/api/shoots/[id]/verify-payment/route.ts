import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";

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
    return NextResponse.json({ error: "This shoot is not awaiting payment." }, { status: 409 });
  }

  // Find the payment reference for this shoot
  const [payment] = await sql`
    SELECT provider_reference FROM payments
    WHERE shoot_id = ${id} AND provider = 'paystack'
    ORDER BY created_at DESC LIMIT 1
  `;

  if (!payment?.provider_reference) {
    return NextResponse.json({
      error: "No payment reference found for this shoot. If you were charged, please contact support with your shoot ID.",
    }, { status: 404 });
  }

  // Verify with Paystack
  let paystackData: Record<string, unknown>;
  try {
    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${payment.provider_reference}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );
    paystackData = await res.json();
  } catch (err) {
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

  await sql`
    UPDATE payments SET status = 'success', paid_at = ${now}
    WHERE shoot_id = ${id} AND provider_reference = ${payment.provider_reference}
  `;

  // Start generation
  const origin = new URL(request.url).origin;
  fetch(`${origin}/api/shoots/${id}/start`, {
    method: "POST",
    headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "" },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
