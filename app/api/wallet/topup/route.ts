import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";
import { initializePayment } from "@/lib/payment-gateway";
import type { InitPaymentParams } from "@/lib/payment-types";
import { NO_CASH_OUT_EN } from "@/lib/wallet";

/**
 * Start a wallet top-up.
 *
 * Nothing here credits anything. The balance moves only when the verified
 * Paystack webhook fires, so an abandoned tab or a forged callback funds nobody.
 *
 * The no-cash-out rule travels with the payment description, which puts it on
 * the page where card details are typed and on the emailed receipt. A prepaid
 * balance generates disputes when the terms are discovered at refund time, and a
 * dispute costs more than the refund would have.
 *
 *   POST { amountNgn }   browser session, or x-internal-secret + x-act-as-user
 */

export const dynamic = "force-dynamic";

/** Small enough to be a mistake, large enough to be a liability. */
const MIN_NGN = 500;
const MAX_NGN = 500_000;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user: sessionUser } } = await supabase.auth.getUser();

  // The same internal door the booking and retouch routes use: a WhatsApp
  // customer is a phone number with no browser session. The email is read from
  // the database, never asserted by the caller.
  let user = sessionUser;
  if (!user) {
    const secret = process.env.INTERNAL_API_SECRET;
    const presented = request.headers.get("x-internal-secret");
    const actAs = request.headers.get("x-act-as-user");
    if (secret && presented === secret && actAs && /^[0-9a-f-]{36}$/i.test(actAs)) {
      const [row] = await sql<{ id: string; email: string | null; banned: boolean | null }[]>`
        SELECT id, email, banned FROM profiles WHERE id = ${actAs}`.catch(() => []);
      if (row && !row.banned) user = { id: row.id, email: row.email ?? undefined } as typeof sessionUser;
    }
  }
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { amountNgn?: number };
  const amountNgn = Math.round(Number(body.amountNgn));

  if (!Number.isFinite(amountNgn) || amountNgn < MIN_NGN) {
    return NextResponse.json(
      { error: `The smallest top-up is ₦${MIN_NGN.toLocaleString("en-NG")}.` }, { status: 400 });
  }
  if (amountNgn > MAX_NGN) {
    return NextResponse.json(
      { error: `The largest top-up is ₦${MAX_NGN.toLocaleString("en-NG")}.` }, { status: 400 });
  }

  const params: InitPaymentParams = {
    email: user.email,
    amountNgn,
    // Naira only. The wallet is a naira balance, and converting a top-up would
    // mean the rate at funding time silently decides what the money is worth.
    currency: "NGN",
    metadata: {
      type: "wallet_topup",
      user_id: user.id,
      // custom_fields is what Paystack actually renders on the checkout page and
      // repeats on the receipt — there is no `description` on InitPaymentParams,
      // and passing one silently did nothing. This is the mechanism the gift
      // flow already uses, and it is how the refund rule reaches the screen
      // where card details are typed rather than only the chat that led there.
      custom_fields: [
        { display_name: "Wallet top-up", variable_name: "wallet_terms", value: NO_CASH_OUT_EN },
      ],
    },
    callbackUrl: `${SITE_URL}/studio?wallet=topped-up`,
  };

  let result: Awaited<ReturnType<typeof initializePayment>>;
  try {
    result = await initializePayment("paystack", params);
  } catch (err) {
    console.warn("[wallet topup] paystack failed:", err instanceof Error ? err.message : String(err));
    try {
      result = await initializePayment("flutterwave", params);
    } catch (err2) {
      console.error("[wallet topup][both-gateways-failed]", err2 instanceof Error ? err2.message : String(err2));
      return NextResponse.json(
        { error: "Payment is temporarily unavailable. Please try again in a few minutes." },
        { status: 503 });
    }
  }

  return NextResponse.json({
    authorizationUrl: result.authorizationUrl,
    reference: result.reference,
    amountNgn,
    terms: NO_CASH_OUT_EN,
  });
}
