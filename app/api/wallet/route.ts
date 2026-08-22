import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { walletBalance, walletHistory, naira, NO_CASH_OUT_EN } from "@/lib/wallet";

/**
 * What is in my wallet, and how it got there.
 *
 * Read-only and session-only: there is no internal door here, because nothing
 * about a balance needs to be readable by a server-to-server caller. The chat
 * bot reads `walletBalance()` directly.
 *
 * `terms` is returned rather than written into the page so that the refund rule
 * has exactly one wording across chat, checkout and the studio. A rule that is
 * phrased two ways reads as improvisation at precisely the moment a customer is
 * deciding whether to trust it.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [balanceNgn, history] = await Promise.all([
    walletBalance(user.id),
    walletHistory(user.id, 8),
  ]);

  return NextResponse.json({
    balanceNgn,
    balance: naira(balanceNgn),
    terms: NO_CASH_OUT_EN,
    history: history.map((h) => ({
      amount: `${h.delta_ngn > 0 ? "+" : "−"}${naira(Math.abs(h.delta_ngn))}`,
      credit: h.delta_ngn > 0,
      // The customer's words for it, not the ledger's. "spend" means nothing to
      // somebody looking at their own money.
      what:
        h.reason === "topup"     ? "Added to wallet"
        : h.reason === "spend"   ? "Paid for a shoot"
        : h.reason === "shortfall" ? "Refund for photos we couldn't make"
        : h.reason === "refund"  ? "Refunded"
        : h.note ?? "Adjustment",
      when: h.created_at,
    })),
  });
}
