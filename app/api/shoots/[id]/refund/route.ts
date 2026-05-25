import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = user.email === process.env.ADMIN_EMAIL;

  const [shoot] = await sql`SELECT id, user_id, status FROM shoots WHERE id = ${id}`;
  if (!shoot) return NextResponse.json({ error: "Shoot not found" }, { status: 404 });
  if (!isAdmin && shoot.user_id !== user.id) {
    return NextResponse.json({ error: "Shoot not found" }, { status: 404 });
  }

  // Check refund eligibility: shoot must be fully failed
  let eligible = shoot.status === "FAILED" || shoot.status === "REFUNDED";
  if (!eligible) {
    const images = await sql`SELECT status FROM shoot_images WHERE shoot_id = ${id}`;
    if (images.length > 0 && images.every(img => String(img.status) === "FAILED")) {
      eligible = true;
    }
  }
  if (!eligible) {
    return NextResponse.json(
      { error: "This shoot is not eligible for a refund. Some images may have completed — retry failed slots or contact support." },
      { status: 400 }
    );
  }

  // Already refunded
  if (shoot.status === "REFUNDED") {
    return NextResponse.json({ alreadyRefunded: true });
  }

  // Find the successful payment that hasn't been refunded yet
  const [payment] = await sql`
    SELECT id, provider_reference, amount, currency
    FROM payments
    WHERE shoot_id = ${id} AND status = 'success' AND refund_status = 'none'
    LIMIT 1
  `;
  if (!payment) {
    return NextResponse.json(
      { error: "No eligible payment found for this shoot. It may have already been refunded or was not paid." },
      { status: 404 }
    );
  }

  // Call Paystack refund API
  let paystackRes: Response;
  try {
    paystackRes = await fetch("https://api.paystack.co/refund", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ transaction: payment.provider_reference }),
    });
  } catch (err) {
    console.error("[refund] Paystack network error:", err);
    return NextResponse.json({ error: "Could not reach payment provider. Try again later." }, { status: 502 });
  }

  const data = await paystackRes.json().catch(() => ({}));

  if (!paystackRes.ok || !data.status) {
    const message = data.message ?? "Refund failed at payment provider";
    console.error("[refund] Paystack refund failed:", message, data);
    await sql`UPDATE payments SET refund_status = 'failed' WHERE id = ${payment.id}`;
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const refundReference = data.data?.transaction?.reference ?? data.data?.id ?? null;

  await sql`
    UPDATE payments
    SET refund_status = 'processed', refunded_at = NOW(), refund_reference = ${refundReference}
    WHERE id = ${payment.id}
  `;
  await sql`UPDATE shoots SET status = 'REFUNDED', updated_at = NOW() WHERE id = ${id}`;

  console.log(`[refund] Refund processed for shoot ${id}, payment ${payment.provider_reference}, refund ref ${refundReference}`);

  return NextResponse.json({ ok: true, refundReference });
}
