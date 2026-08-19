import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { isAdminEmail } from "@/lib/auth";
import { SITE_URL } from "@/lib/site-url";
import { initializePayment } from "@/lib/payment-gateway";
import type { InitPaymentParams } from "@/lib/payment-types";

/**
 * Start payment for a delivered retouch.
 *
 * The buyer pays AFTER the work is done and they can see it — the tiles are
 * visible while locked, and this is what unlocks the files. Nothing here writes
 * `paid`; only the verified webhook does, so a buyer who closes the Paystack tab
 * or forges a callback gets nothing.
 *
 * Same dual-gateway failover as the shoot payment route: Paystack first,
 * Flutterwave if Paystack is down, because a payment that cannot start is a sale
 * lost outright.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [shoot] = await sql<{ user_id: string; currency: string }[]>`
    SELECT user_id, currency FROM shoots WHERE id = ${id}`;
  const isAdmin = isAdminEmail(user.email);
  if (!shoot || (!isAdmin && shoot.user_id !== user.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [order] = await sql<{
    status: string; price_ngn: number; image_count: number; paid: boolean; free: boolean;
  }[]>`SELECT status, price_ngn, image_count, paid, free FROM shoot_retouch WHERE shoot_id = ${id}`;
  if (!order) return NextResponse.json({ error: "No retouch on this shoot" }, { status: 404 });

  // Already open — charging again would take money for nothing.
  if (order.paid || order.free) {
    return NextResponse.json({ ok: true, alreadyUnlocked: true });
  }
  // Nothing to buy until the files exist.
  if (order.status !== "DELIVERED") {
    return NextResponse.json({ error: "Retouch is not ready yet" }, { status: 400 });
  }
  if (!order.price_ngn) {
    return NextResponse.json({ error: "This retouch has no price set" }, { status: 400 });
  }

  const gatewayParams: InitPaymentParams = {
    email: user.email,
    amountNgn: order.price_ngn,
    // Retouching is priced in naira only for now; the shoot's own currency does
    // not carry over because there is no dollar price to convert from.
    currency: "NGN",
    metadata: { type: "retouch_payment", shoot_id: id, user_id: user.id, image_count: order.image_count },
    callbackUrl: `${SITE_URL}/studio?shoot_id=${id}&retouch=paid`,
  };

  let paymentResult: Awaited<ReturnType<typeof initializePayment>>;
  try {
    paymentResult = await initializePayment("paystack", gatewayParams);
  } catch (err) {
    console.warn(`[retouch pay] Paystack failed for shoot ${id}:`, err instanceof Error ? err.message : String(err));
    try {
      paymentResult = await initializePayment("flutterwave", gatewayParams);
    } catch (err2) {
      console.error(`[retouch pay][both-gateways-failed] shoot=${id}`, err2 instanceof Error ? err2.message : String(err2));
      return NextResponse.json(
        { error: "Payment processing is temporarily unavailable. Please try again in a few minutes." },
        { status: 503 }
      );
    }
  }

  await sql`
    UPDATE shoot_retouch SET paystack_reference = ${paymentResult.reference}, updated_at = NOW()
    WHERE shoot_id = ${id}`.catch(() => {});

  await sql`
    INSERT INTO payments (id, shoot_id, user_id, status, amount_ngn, provider, provider_reference, created_at)
    VALUES (${crypto.randomUUID()}, ${id}, ${user.id}, 'pending', ${order.price_ngn},
            ${paymentResult.provider}, ${paymentResult.reference}, NOW())`.catch(() => {});

  return NextResponse.json({ authorizationUrl: paymentResult.authorizationUrl });
}
