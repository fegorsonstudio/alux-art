import sql from "@/lib/db";
import { creditWallet } from "@/lib/wallet";
import { normalizePackageSize } from "@/lib/types";

/**
 * Settles a shoot that finished without every image it was sold with.
 *
 * ONE remedy per missing image, never two:
 *  - a paid marketplace shoot gets the naira value of the missing images back
 *    in the buyer's wallet (automatically, without them having to ask);
 *  - a free or comped shoot, which has nothing to refund, gets the one-time
 *    free regeneration instead.
 * It used to grant both, and per-image retry ignored the refund too, so a buyer
 * could be credited for two missing photos and then retry them into existence
 * and keep the credit. Retry and regeneration now refuse once a refund exists
 * (app/api/shoots/[id]/slots/[slot]/retry, app/api/shoots/[id]/regenerate).
 *
 * Called at the end of every worker run (lib/generate.ts) and by /start when a
 * shoot fails before its first image, which used to leave a paying buyer with
 * no photos, no refund and no offer.
 *
 * Safe to call more than once: the wallet allows one shortfall credit per shoot
 * (idx_wallet_one_shortfall_per_shoot) and regeneration is only granted while
 * still 'none'.
 */
export async function settleShortfall(
  shootId: string,
  counts?: { total: number; completed: number },
): Promise<{ total: number; completed: number; refundedNgn: number; regenerationOffered: boolean }> {
  let total = counts?.total ?? 0;
  let completed = counts?.completed ?? 0;

  if (!counts) {
    const [s] = await sql<{ package_size: number | null; category: string | null }[]>`
      SELECT s.package_size, t.category FROM shoots s
      LEFT JOIN templates t ON t.id = COALESCE(s.template_showcase_id, s.template_id)
      WHERE s.id = ${shootId}`;
    if (!s) return { total: 0, completed: 0, refundedNgn: 0, regenerationOffered: false };
    // A photo kept by "Run again" ("earlier take of #N") is not a booked image.
    const [c] = await sql<{ rows: number; done: number }[]>`
      SELECT count(*) FILTER (WHERE kind NOT LIKE 'earlier take%')::int AS rows,
             count(*) FILTER (WHERE status = 'COMPLETE')::int AS done
      FROM shoot_images WHERE shoot_id = ${shootId}`;
    // Same rule as lib/generate.ts: per-image products are as many images as were booked.
    const perImageOrder = s.category === "photo_upgrade" || s.category === "asset_extract";
    total = perImageOrder && c.rows > 0 ? c.rows : normalizePackageSize(s.package_size);
    completed = c.done;
  }

  if (total <= 0 || completed >= total) {
    return { total, completed, refundedNgn: 0, regenerationOffered: false };
  }

  let refundedNgn = 0;
  try {
    const [paid] = await sql<{ amount_ngn: number; user_id: string }[]>`
      SELECT tp.amount_ngn, tp.user_id
      FROM template_purchases tp
      WHERE tp.shoot_id = ${shootId} AND tp.status = 'success' AND tp.amount_ngn > 0
      ORDER BY tp.created_at DESC LIMIT 1`;
    if (paid) {
      // Per booked image, from what was actually charged — never from the label.
      const perImage = Math.round(paid.amount_ngn / total);
      const owed = perImage * (total - completed);
      if (owed > 0) {
        const credited = await creditWallet({
          userId: paid.user_id,
          amountNgn: owed,
          reason: "shortfall",
          shootId,
          note: `${total - completed} of ${total} image(s) did not generate`,
        });
        if (credited) {
          refundedNgn = owed;
          console.log(`[shortfall] refunded ₦${owed} to ${paid.user_id} for ${shootId}`);
        }
      }
    }
  } catch (e) {
    // A refund that fails must never fail the shoot on top of it.
    console.error("[shortfall] refund failed:", e instanceof Error ? e.message : e);
  }

  // Free regeneration only when no money went back for this shoot, now or earlier.
  let regenerationOffered = false;
  const [refunded] = await sql`SELECT 1 FROM wallet_entries WHERE shoot_id = ${shootId} AND reason = 'shortfall' LIMIT 1`;
  if (!refunded) {
    const granted = await sql`
      UPDATE shoots SET regeneration_status = 'eligible', updated_at = NOW()
      WHERE id = ${shootId} AND regeneration_status = 'none'
      RETURNING id`;
    regenerationOffered = granted.length > 0;
  }

  return { total, completed, refundedNgn, regenerationOffered };
}

/** The shortfall refund already paid for a shoot, in naira, or 0. */
export async function shortfallRefunded(shootId: string): Promise<number> {
  const [row] = await sql<{ delta_ngn: number }[]>`
    SELECT delta_ngn FROM wallet_entries WHERE shoot_id = ${shootId} AND reason = 'shortfall' LIMIT 1`;
  return row ? Number(row.delta_ngn) : 0;
}
