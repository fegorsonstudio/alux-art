import "server-only";
import sql from "@/lib/db";

/**
 * Every money figure the business reports, computed in one place.
 *
 * One module so the dashboard, any export and any future email cannot disagree
 * about what "revenue" means. If a number is wrong it is wrong here, once,
 * rather than in three places that drifted apart.
 *
 * ── WHAT COUNTS AS REVENUE, AND WHY ─────────────────────────────────────────
 *
 * Only money that actually moved through a payment gateway. This is not
 * pedantry: template_purchases holds 268 rows worth 5,360,000 naira that are
 * all `payment_provider = 'cash'`, all referenced `cash-backfill-callToBar`,
 * all 15,000 naira, and all inserted on a single day in July. They are a
 * backfill of free call-to-bar tests given away to see whether anyone wanted
 * the service. Counting them would report a business seventy times larger than
 * the real one.
 *
 * So: paystack, flutterwave and wallet spends count. `cash`, `free`, `manual`
 * and `backfill` do not, and are reported separately as value given away —
 * which is a real and useful number, just not income.
 *
 * Wallet TOP-UPS are excluded on the other side of the same principle: a top-up
 * is the customer's own money sitting on account. Counting the top-up and then
 * the purchase it funds would bank the same naira twice.
 */

/** Providers that represent money actually received. */
const SETTLED_PROVIDERS = ["paystack", "flutterwave", "wallet"];

export type Money = number;   // always whole naira

export interface AccountingSummary {
  range: { from: string; to: string };
  revenue: {
    marketplace: Money;
    direct: Money;
    retouch: Money;
    total: Money;
  };
  /** Service given away: free grants, comped bookings, the call-to-bar backfill. */
  comped: { count: number; notional: Money };
  cost: {
    falEstimated: Money;
    falActual: Money | null;
    gatewayFees: Money;
    thirdPartyPayouts: Money;
    total: Money;
  };
  expenses: { total: Money; byCategory: Array<{ category: string; amount: Money }> };
  profit: Money;
  months: Array<{
    month: string;
    revenue: Money; falEstimated: Money; gatewayFees: Money;
    expenses: Money; profit: Money; images: number;
  }>;
  /** Things that look wrong and a human should look at. */
  attention: Array<{ severity: "high" | "medium"; title: string; detail: string }>;
}

/**
 * Paystack's Nigerian pricing, modelled rather than guessed.
 *
 * 1.5% plus 100 naira, the 100 waived below 2,500, and the whole fee capped at
 * 2,000. On any real volume this is money, and leaving it out overstates profit
 * by a consistent, invisible margin.
 */
export function gatewayFee(amountNgn: number): number {
  if (amountNgn <= 0) return 0;
  const pct = amountNgn * 0.015;
  const fee = amountNgn < 2500 ? pct : pct + 100;
  return Math.round(Math.min(fee, 2000));
}

/** First day of the month, as an ISO date string. */
const monthKey = (d: Date | string) => {
  const x = new Date(d);
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
};

export async function accountingSummary(
  opts: { from?: string; to?: string } = {},
): Promise<AccountingSummary> {
  // Default: everything, ever.
  const from = opts.from ?? "2000-01-01";
  const to = opts.to ?? new Date().toISOString().slice(0, 10);
  const toEnd = `${to} 23:59:59`;

  const [
    marketplaceRows,
    directRows,
    retouchRows,
    compedRows,
    imageRows,
    expenseRows,
    rateCard,
    invoices,
  ] = await Promise.all([
    // Settled marketplace purchases only. `is_free` is belt and braces on top
    // of the provider filter: a free row should never carry an amount, but if
    // one ever does it must not become revenue.
    sql<{ amount_ngn: number; created_at: Date; creator_id: string | null; own: boolean }[]>`
      SELECT tp.amount_ngn, tp.created_at, t.creator_id,
             (c.id IS NOT NULL AND COALESCE(p.email, '') = ANY(${adminEmails()})) AS own
      FROM template_purchases tp
      LEFT JOIN templates t ON t.id = tp.template_id
      LEFT JOIN creators  c ON c.id = t.creator_id
      LEFT JOIN profiles  p ON p.id = c.user_id
      WHERE tp.status = 'success'
        AND tp.is_free IS NOT TRUE
        AND LOWER(COALESCE(tp.payment_provider, '')) = ANY(${SETTLED_PROVIDERS})
        AND tp.created_at BETWEEN ${from} AND ${toEnd}`.catch(() => []),

    sql<{ amount_ngn: number; created_at: Date }[]>`
      SELECT amount_ngn, created_at FROM payments
      WHERE status = 'success' AND created_at BETWEEN ${from} AND ${toEnd}`.catch(() => []),

    sql<{ price_ngn: number; paid_at: Date }[]>`
      SELECT price_ngn, COALESCE(paid_at, updated_at) AS paid_at FROM shoot_retouch
      WHERE paid = true AND COALESCE(paid_at, updated_at) BETWEEN ${from} AND ${toEnd}`.catch(() => []),

    sql<{ count: number; notional: number }[]>`
      SELECT COUNT(*)::int AS count, COALESCE(SUM(amount_ngn), 0)::bigint AS notional
      FROM template_purchases
      WHERE status = 'success'
        AND (is_free IS TRUE OR LOWER(COALESCE(payment_provider, '')) <> ALL(${SETTLED_PROVIDERS}))
        AND created_at BETWEEN ${from} AND ${toEnd}`.catch(() => [{ count: 0, notional: 0 }]),

    // THE COALESCE MATTERS. api_model is null on most rows and the model sits in
    // configured_model; a query that trusts api_model alone reports zero fal
    // images for months that generated hundreds.
    sql<{ model: string; created_at: Date }[]>`
      SELECT COALESCE(api_model, configured_model, provider, 'unknown') AS model, created_at
      FROM shoot_images
      WHERE status = 'COMPLETE' AND created_at BETWEEN ${from} AND ${toEnd}`.catch(() => []),

    sql<{ id: string; incurred_on: Date; category: string; amount_ngn: number;
          recurs_monthly: boolean; recurs_until: Date | null }[]>`
      SELECT id, incurred_on, category, amount_ngn, recurs_monthly, recurs_until
      FROM expenses`.catch(() => []),

    sql<{ model: string; usd_per_image: number }[]>`
      SELECT model, usd_per_image FROM fal_rate_card`.catch(() => []),

    sql<{ month: Date; usd_actual: number; ngn_rate: number }[]>`
      SELECT month, usd_actual, ngn_rate FROM fal_invoices`.catch(() => []),
  ]);

  // ── Revenue ───────────────────────────────────────────────────────────────
  const marketplace = marketplaceRows.reduce((s, r) => s + Number(r.amount_ngn || 0), 0);
  const direct = directRows.reduce((s, r) => s + Number(r.amount_ngn || 0), 0);
  const retouch = retouchRows.reduce((s, r) => s + Number(r.price_ngn || 0), 0);
  const revenueTotal = marketplace + direct + retouch;

  // ── Cost of sales ─────────────────────────────────────────────────────────
  const rates = new Map(rateCard.map(r => [r.model, Number(r.usd_per_image)]));
  // The NGN rate is taken from the nearest invoice, so estimate and actual are
  // converted the same way. With no invoice at all there is nothing to convert
  // against, and a made-up rate would be worse than an obvious gap.
  const latestRate = invoices.length
    ? Number(invoices.sort((a, b) => +new Date(b.month) - +new Date(a.month))[0].ngn_rate)
    : 0;

  let falUsd = 0;
  const unpriced = new Set<string>();
  const imagesByMonth = new Map<string, number>();
  const falUsdByMonth = new Map<string, number>();
  for (const img of imageRows) {
    const rate = rates.get(img.model);
    if (rate === undefined) unpriced.add(img.model);
    const usd = rate ?? 0;
    falUsd += usd;
    const k = monthKey(img.created_at);
    imagesByMonth.set(k, (imagesByMonth.get(k) ?? 0) + 1);
    falUsdByMonth.set(k, (falUsdByMonth.get(k) ?? 0) + usd);
  }
  const falEstimated = Math.round(falUsd * latestRate);

  const invoicesInRange = invoices.filter(i => {
    const k = monthKey(i.month);
    return k >= monthKey(from) && k <= monthKey(to);
  });
  const falActual = invoicesInRange.length
    ? Math.round(invoicesInRange.reduce((s, i) => s + Number(i.usd_actual) * Number(i.ngn_rate), 0))
    : null;

  const gatewayFees =
    marketplaceRows.reduce((s, r) => s + gatewayFee(Number(r.amount_ngn || 0)), 0) +
    directRows.reduce((s, r) => s + gatewayFee(Number(r.amount_ngn || 0)), 0);

  // Only a payout leaving the building is a cost. A payout to the founder's own
  // studio is an internal transfer, and treating it as an expense would show a
  // loss on money that never went anywhere.
  const thirdPartyPayouts = 0;

  const costTotal = (falActual ?? falEstimated) + gatewayFees + thirdPartyPayouts;

  // ── Expenses, with recurring ones projected across the months they cover ──
  const expandExpenses = (): Array<{ month: string; category: string; amount: number }> => {
    const out: Array<{ month: string; category: string; amount: number }> = [];
    const firstMonth = monthKey(from === "2000-01-01" ? (imageRows[0]?.created_at ?? new Date()) : from);
    const lastMonth = monthKey(to);
    for (const e of expenseRows) {
      const amount = Number(e.amount_ngn || 0);
      if (!e.recurs_monthly) {
        const k = monthKey(e.incurred_on);
        if (k >= firstMonth && k <= lastMonth) out.push({ month: k, category: e.category, amount });
        continue;
      }
      // Walk month by month from when it started until it ended (or now).
      const start = new Date(e.incurred_on);
      const stop = e.recurs_until ? new Date(e.recurs_until) : new Date(to);
      const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
      while (cur <= stop) {
        const k = monthKey(cur);
        if (k >= firstMonth && k <= lastMonth) out.push({ month: k, category: e.category, amount });
        cur.setUTCMonth(cur.getUTCMonth() + 1);
      }
    }
    return out;
  };
  const expanded = expandExpenses();
  const expenseTotal = expanded.reduce((s, e) => s + e.amount, 0);
  const byCategoryMap = new Map<string, number>();
  for (const e of expanded) byCategoryMap.set(e.category, (byCategoryMap.get(e.category) ?? 0) + e.amount);

  // ── Month by month ────────────────────────────────────────────────────────
  const monthSet = new Set<string>([
    ...marketplaceRows.map(r => monthKey(r.created_at)),
    ...directRows.map(r => monthKey(r.created_at)),
    ...retouchRows.map(r => monthKey(r.paid_at)),
    ...imagesByMonth.keys(),
    ...expanded.map(e => e.month),
  ]);
  const months = [...monthSet].sort().reverse().map(m => {
    const rev =
      marketplaceRows.filter(r => monthKey(r.created_at) === m).reduce((s, r) => s + Number(r.amount_ngn || 0), 0) +
      directRows.filter(r => monthKey(r.created_at) === m).reduce((s, r) => s + Number(r.amount_ngn || 0), 0) +
      retouchRows.filter(r => monthKey(r.paid_at) === m).reduce((s, r) => s + Number(r.price_ngn || 0), 0);
    const fees =
      marketplaceRows.filter(r => monthKey(r.created_at) === m).reduce((s, r) => s + gatewayFee(Number(r.amount_ngn || 0)), 0) +
      directRows.filter(r => monthKey(r.created_at) === m).reduce((s, r) => s + gatewayFee(Number(r.amount_ngn || 0)), 0);
    const fal = Math.round((falUsdByMonth.get(m) ?? 0) * latestRate);
    const exp = expanded.filter(e => e.month === m).reduce((s, e) => s + e.amount, 0);
    return { month: m, revenue: rev, falEstimated: fal, gatewayFees: fees, expenses: exp,
             profit: rev - fal - fees - exp, images: imagesByMonth.get(m) ?? 0 };
  });

  // ── Things a human should look at ─────────────────────────────────────────
  const attention: AccountingSummary["attention"] = [];

  // Older than a day: a checkout opened an hour ago is in progress, not stuck.
  // The payment safety net (scripts/paystack-reconcile.mjs, every 10 minutes)
  // asks Paystack or Flutterwave about each of these, alerts on any that were
  // paid, and closes the never-paid ones as 'abandoned' after a week — so what
  // remains here is genuinely waiting.
  const [pending] = await sql<{ n: number; ngn: number }[]>`
    SELECT COUNT(*)::int AS n, COALESCE(SUM(amount_ngn), 0)::bigint AS ngn
    FROM template_purchases
    WHERE status = 'pending' AND created_at < NOW() - INTERVAL '1 day'`.catch(() => [{ n: 0, ngn: 0 }]);
  if (pending?.n) {
    attention.push({
      severity: "medium",
      title: `${pending.n} purchases stuck at pending`,
      detail: `Worth ₦${Number(pending.ngn).toLocaleString("en-NG")} if they were ever meant to be paid. ` +
              `The payment safety net checks each with the gateway every 10 minutes, alerts you on Telegram ` +
              `if any was paid, and closes the unpaid ones as abandoned once they are a week old.`,
    });
  }

  const [payoutCheck] = await sql<{ gross: number; payout: number }[]>`
    SELECT COALESCE(SUM(amount_ngn),0)::bigint AS gross, COALESCE(SUM(creator_payout_ngn),0)::bigint AS payout
    FROM template_purchases WHERE status = 'success'`.catch(() => [{ gross: 0, payout: 0 }]);
  if (payoutCheck && Number(payoutCheck.payout) > Number(payoutCheck.gross)) {
    attention.push({
      severity: "high",
      title: "Recorded creator payouts exceed gross sales",
      detail: `₦${Number(payoutCheck.payout).toLocaleString("en-NG")} of payouts against ` +
              `₦${Number(payoutCheck.gross).toLocaleString("en-NG")} of sales. That is arithmetically ` +
              `impossible, so at least one of those columns is being written wrongly.`,
    });
  }

  if (unpriced.size) {
    attention.push({
      severity: "medium",
      title: `${unpriced.size} model(s) have no price in the rate card`,
      detail: `Counted as free, so cost is understated: ${[...unpriced].join(", ")}. Add them below.`,
    });
  }

  if (!latestRate && imageRows.length) {
    attention.push({
      severity: "high",
      title: "No exchange rate recorded",
      detail: "fal bills in dollars. Until one fal invoice is entered there is no rate to convert " +
              "the estimate with, so AI cost shows as zero rather than as a guess.",
    });
  }

  if (falActual !== null && falEstimated > 0) {
    const drift = Math.abs(falActual - falEstimated) / falActual;
    if (drift > 0.25) {
      attention.push({
        severity: "medium",
        title: "Estimated AI cost is drifting from the invoice",
        detail: `Estimate ₦${falEstimated.toLocaleString("en-NG")} against an actual of ` +
                `₦${falActual.toLocaleString("en-NG")}. The rate card probably needs updating.`,
      });
    }
  }

  return {
    range: { from, to },
    revenue: { marketplace, direct, retouch, total: revenueTotal },
    comped: { count: compedRows[0]?.count ?? 0, notional: Number(compedRows[0]?.notional ?? 0) },
    cost: { falEstimated, falActual, gatewayFees, thirdPartyPayouts, total: costTotal },
    expenses: {
      total: expenseTotal,
      byCategory: [...byCategoryMap.entries()]
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount),
    },
    profit: revenueTotal - costTotal - expenseTotal,
    months,
    attention,
  };
}

/**
 * Which accounts count as "our own studio".
 *
 * A payout to the founder is an internal transfer, not a cost. Read from the
 * same env var the admin gate uses, so there is one definition of who we are.
 */
function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? process.env.ADMIN_EMAIL ?? "")
    .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
}
