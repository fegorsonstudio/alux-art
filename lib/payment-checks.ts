import { tellAdmin } from "@/lib/telegram";

/**
 * Does a confirmed charge cover what we asked for?
 *
 * Every path that turns a payment into work (the Paystack webhook, the buyer's
 * "verify payment" button, the reconciler) used to accept ANY successful charge
 * whose metadata named an order. The licence shop already checked amount and
 * currency (lib/fegorson-licence.ts); everything else now does the same.
 *
 * Amounts are in major units (naira or dollars). A missing currency means NGN,
 * which is what every row written before currencies were recorded used.
 */
export function paidEnough(
  paidMajor: number,
  paidCurrency: string | null | undefined,
  expectedMajor: number,
  expectedCurrency: string | null | undefined,
): boolean {
  const pc = String(paidCurrency || "NGN").toUpperCase();
  const ec = String(expectedCurrency || "NGN").toUpperCase();
  if (pc !== ec) return false;
  const paid = Number(paidMajor), expected = Number(expectedMajor);
  if (!Number.isFinite(paid) || !Number.isFinite(expected)) return false;
  // One kobo / cent of rounding slack.
  return paid + 0.01 >= expected;
}

/** Tells the owner a payment was refused because it did not match the order. Never throws. */
export async function reportPaymentMismatch(opts: {
  where: string;
  reference: string;
  paidMajor: number;
  paidCurrency: string | null | undefined;
  expectedMajor: number | null;
  expectedCurrency: string | null | undefined;
  order: string;
}): Promise<void> {
  const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] as string);
  const paid = `${opts.paidMajor} ${String(opts.paidCurrency || "NGN").toUpperCase()}`;
  const want = opts.expectedMajor == null ? "no matching order" : `${opts.expectedMajor} ${String(opts.expectedCurrency || "NGN").toUpperCase()}`;
  console.warn(`[payments] ${opts.where}: ${opts.reference} paid ${paid}, order wants ${want} — not fulfilled`);
  await tellAdmin(
    `⚠️ <b>Payment did not match its order — nothing was released</b>\n` +
    `Where: ${esc(opts.where)}\nOrder: ${esc(opts.order)}\nReference: <code>${esc(opts.reference)}</code>\n` +
    `Paid: ${esc(paid)}\nExpected: ${esc(want)}\n\nCheck it in the Paystack dashboard before releasing anything by hand.`,
  ).catch(() => false);
}
