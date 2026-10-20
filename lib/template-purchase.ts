import sql from "@/lib/db";
import { notifyCreatorOfSale } from "@/lib/creator-sale-email";

/**
 * Turns a confirmed marketplace payment into a queued shoot, with everything
 * that goes with a sale: the template's purchase count, the coupon's use count
 * and the creator's sale email.
 *
 * The webhook and the buyer's "verify payment" button both confirm payments.
 * Verify used to mark the purchase 'success' on its own, so when the webhook
 * arrived afterwards it saw the purchase already paid and skipped the counts
 * and the email — which also let a coupon be used past its limit. Both paths
 * now come through here, and only the first one to flip the purchase does the
 * extras.
 *
 * Returns whether this call was the one that confirmed the purchase, and
 * whether it moved the shoot out of PENDING_PAYMENT (only then should a worker
 * be started).
 */
export async function fulfilTemplatePurchase(opts: {
  purchaseId: string;
  shootId: string;
  /** Recorded when the payment came through a gateway other than the one the purchase names (Flutterwave fallback). */
  provider?: string;
  providerReference?: string;
}): Promise<{ newlyPaid: boolean; queued: boolean }> {
  const [row] = await sql<{ template_id: string | null; coupon_id: string | null }[]>`
    UPDATE template_purchases SET status = 'success', shoot_id = ${opts.shootId},
      payment_provider = COALESCE(${opts.provider ?? null}::text, payment_provider),
      provider_reference = COALESCE(${opts.providerReference ?? null}::text, provider_reference)
    WHERE id = ${opts.purchaseId} AND status <> 'success'
    RETURNING template_id, coupon_id`;

  const queued = await sql`
    UPDATE shoots SET status = 'QUEUED', updated_at = NOW()
    WHERE id = ${opts.shootId} AND status = 'PENDING_PAYMENT'
    RETURNING id`;

  if (!row) return { newlyPaid: false, queued: queued.length > 0 };

  if (row.template_id) {
    await sql`UPDATE templates SET purchase_count = purchase_count + 1 WHERE id = ${row.template_id}`;
  }
  if (row.coupon_id) {
    await sql`UPDATE coupons SET use_count = use_count + 1 WHERE id = ${row.coupon_id}`;
  }
  // Deliberately not awaited: a slow mail provider must never delay a paid booking.
  void notifyCreatorOfSale(opts.purchaseId);

  return { newlyPaid: true, queued: queued.length > 0 };
}
