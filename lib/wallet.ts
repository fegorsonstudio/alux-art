import "server-only";
import sql from "@/lib/db";

/**
 * The naira wallet.
 *
 * Append-only. Balance is the sum of the ledger, never a stored number that
 * could drift from the movements that made it — this holds customer money, and
 * when somebody asks where their ₦4,000 went the answer has to be readable.
 *
 * Naira rather than image credits because prices are not uniform: a relight
 * image is ₦1,000 and a portrait image ₦3,500. A credit counted in images would
 * let a buyer purchase at the cheap rate and spend at the dear one. `free_grants`
 * in lib/free-access.ts still counts images, and correctly so — an admin comping
 * "five free images" means exactly that. The two coexist and never mix.
 *
 * Funds pay for shoots and cannot be withdrawn as cash. That rule is stated to
 * the buyer before every top-up, never discovered afterwards.
 */

export type WalletReason = "topup" | "shortfall" | "spend" | "refund" | "admin";

export type WalletEntry = {
  delta_ngn: number;
  reason: WalletReason;
  shoot_id: string | null;
  note: string | null;
  created_at: Date;
};

/** What this user can spend, in whole naira. Never negative. */
export async function walletBalance(userId: string | null | undefined): Promise<number> {
  if (!userId) return 0;
  const [row] = await sql<{ balance: number }[]>`
    SELECT COALESCE(SUM(delta_ngn), 0)::int AS balance
    FROM wallet_entries WHERE user_id = ${userId}`.catch(() => []);
  return Math.max(0, row?.balance ?? 0);
}

/** The last few movements, for a balance screen that can explain itself. */
export async function walletHistory(userId: string, limit = 10): Promise<WalletEntry[]> {
  return sql<WalletEntry[]>`
    SELECT delta_ngn, reason, shoot_id, note, created_at
    FROM wallet_entries WHERE user_id = ${userId}
    ORDER BY created_at DESC LIMIT ${limit}`.catch(() => []);
}

/**
 * Put money in.
 *
 * `reference` carries a unique index, so a replayed Paystack webhook credits
 * nothing the second time. A shortfall carries the shoot id under its own unique
 * index for the same reason: generation can re-run, and a customer must not be
 * refunded twice for one shoot.
 *
 * Returns false when the guard rejected it — which is a success, not an error:
 * it means the money was already credited.
 */
export async function creditWallet(opts: {
  userId: string;
  amountNgn: number;
  reason: WalletReason;
  shootId?: string | null;
  reference?: string | null;
  note?: string | null;
}): Promise<boolean> {
  const amount = Math.round(opts.amountNgn);
  if (!Number.isFinite(amount) || amount <= 0) return false;

  const rows = await sql<{ id: string }[]>`
    INSERT INTO wallet_entries (user_id, delta_ngn, reason, shoot_id, reference, note)
    VALUES (${opts.userId}, ${amount}, ${opts.reason},
            ${opts.shootId ?? null}, ${opts.reference ?? null}, ${opts.note ?? null})
    ON CONFLICT DO NOTHING
    RETURNING id`.catch((e) => {
      console.error("[wallet] credit failed:", e instanceof Error ? e.message : e);
      return [] as { id: string }[];
    });

  if (rows.length) {
    console.log(`[wallet] +₦${amount} to ${opts.userId} (${opts.reason})`);
    return true;
  }
  return false;
}

/**
 * Take money out, for a booking.
 *
 * The balance is re-read INSIDE the transaction and the spend is refused if it
 * would go negative. Two bookings started at the same moment must not both see
 * the same balance and both succeed — that is how a wallet goes overdrawn.
 *
 * Returns the new balance, or null when there was not enough. Null is an
 * ordinary outcome: the caller falls through to card payment.
 */
export async function spendWallet(opts: {
  userId: string;
  amountNgn: number;
  shootId?: string | null;
  note?: string | null;
}): Promise<number | null> {
  const amount = Math.round(opts.amountNgn);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  try {
    return await sql.begin(async (trx) => {
      // Lock the OWNER row, not the ledger. Postgres refuses FOR UPDATE
      // alongside an aggregate, and locking rows that already exist would not
      // stop a second transaction inserting a new spend anyway. Holding the
      // profile row serialises every spend for this one customer, which is
      // exactly the scope that matters — two bookings started in the same second
      // must not both read the same balance and both succeed.
      await trx`SELECT id FROM profiles WHERE id = ${opts.userId} FOR UPDATE`;

      const [row] = await trx<{ balance: number }[]>`
        SELECT COALESCE(SUM(delta_ngn), 0)::int AS balance
        FROM wallet_entries WHERE user_id = ${opts.userId}`;
      const balance = row?.balance ?? 0;
      if (balance < amount) throw new Error("insufficient");

      await trx`
        INSERT INTO wallet_entries (user_id, delta_ngn, reason, shoot_id, note)
        VALUES (${opts.userId}, ${-amount}, 'spend', ${opts.shootId ?? null}, ${opts.note ?? null})`;
      return balance - amount;
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg !== "insufficient") {
      console.error("[wallet] spend failed:", msg);
    }
    return null;
  }
}

/**
 * Hand money back after a spend that did not result in a shoot.
 *
 * The booking route claims payment before it finishes writing the shoot; if a
 * later step throws, the money has already left. This is the counterpart to
 * `releaseFreeBooking` in lib/free-access.ts and exists for the same reason.
 */
export async function refundWalletSpend(opts: {
  userId: string;
  amountNgn: number;
  shootId?: string | null;
  note?: string | null;
}): Promise<void> {
  await creditWallet({
    userId: opts.userId,
    amountNgn: opts.amountNgn,
    reason: "refund",
    shootId: opts.shootId ?? null,
    note: opts.note ?? "booking did not complete",
  });
}

/** Naira, with separators. One spelling of money across chat and the studio. */
export const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

/**
 * The rule, in the buyer's own language, stated before they pay rather than
 * discovered at refund time. Kept here so chat, checkout and the manual cannot
 * word it differently — a prepaid balance generates disputes when the terms
 * appear to change between where it was sold and where it was questioned.
 */
export const NO_CASH_OUT_EN =
  "Wallet funds pay for shoots only and cannot be withdrawn as cash. They do not expire.";
