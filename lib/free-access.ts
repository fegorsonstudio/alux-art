import "server-only";
import sql from "@/lib/db";

/**
 * free-access.ts — the single place that answers "does this shoot need paying for?"
 *
 * Three ways a booking can be free:
 *   admin      — the booker is an Alux Art admin (pre-existing behaviour)
 *   sponsored  — a brand paid for the template, so it is free for everyone,
 *                bounded by one shoot per person AND a hard total cap
 *   grant      — an admin comped this email address N images
 *
 * Precedence is admin → sponsored → grant, so a sponsored template never burns
 * someone's personal credit.
 *
 * Claiming is atomic: each branch consumes its allowance in a single statement
 * (or relies on a unique index), so two simultaneous bookings can never both
 * take the last remaining slot. If the booking later fails, the caller MUST
 * call releaseFreeBooking so the credit is not silently lost.
 */

export type FreeSource = "admin" | "grant" | "sponsored";

export interface FreeClaim {
  source: FreeSource;
  grantId?: string;
  /** Images left on the grant after this claim — shown back to the buyer. */
  remaining?: number;
}

export interface SponsorFields {
  id: string;
  is_sponsored?: boolean | null;
  sponsor_package_size?: number | null;
  sponsor_total_limit?: number | null;
  sponsor_used_count?: number | null;
  sponsor_expires_at?: string | Date | null;
}

/** Is this template currently offering free bookings at this package size? */
export function sponsorshipCovers(
  template: SponsorFields | null | undefined,
  packageSize: number
): boolean {
  if (!template?.is_sponsored) return false;
  if (template.sponsor_expires_at && new Date(template.sponsor_expires_at) <= new Date()) return false;
  // A sponsor funds a specific package size; anything larger is paid for normally.
  const covered = template.sponsor_package_size ?? 0;
  if (covered <= 0 || packageSize > covered) return false;
  const limit = template.sponsor_total_limit;
  if (limit != null && (template.sponsor_used_count ?? 0) >= limit) return false;
  return true;
}

/** Images still available to this email across all their live grants. */
export async function grantBalance(email: string | null | undefined): Promise<number> {
  if (!email) return 0;
  const [row] = await sql<{ remaining: number }[]>`
    SELECT COALESCE(SUM(images_granted - images_used), 0)::int AS remaining
    FROM free_grants
    WHERE lower(email) = ${email.toLowerCase()}
      AND is_active
      AND (expires_at IS NULL OR expires_at > NOW())
  `;
  return row?.remaining ?? 0;
}

interface ClaimOpts {
  userId: string;
  email: string | null | undefined;
  isAdmin: boolean;
  packageSize: number;
  /** Marketplace bookings only — omit for direct studio shoots. */
  template?: SponsorFields | null;
}

/**
 * Atomically consume a free allowance. Returns null when the booking must be paid for.
 * Nothing is written to free_bookings here — call recordFreeBooking once the shoot row exists.
 */
export async function claimFreeBooking(opts: ClaimOpts): Promise<FreeClaim | null> {
  const { userId, email, isAdmin, packageSize, template } = opts;

  // 1. Admins have always booked free; nothing to consume.
  if (isAdmin) return { source: "admin" };

  // 2. Sponsored template. The total cap is claimed atomically here; the
  //    one-per-person rule is enforced by the free_bookings partial unique
  //    index, so check it first to avoid burning a slot we cannot use.
  if (template && sponsorshipCovers(template, packageSize)) {
    const [already] = await sql<{ id: string }[]>`
      SELECT id FROM free_bookings
      WHERE template_id = ${template.id} AND user_id = ${userId} AND source = 'sponsored'
      LIMIT 1
    `;
    if (!already) {
      const claimed = await sql<{ sponsor_used_count: number }[]>`
        UPDATE templates
        SET sponsor_used_count = sponsor_used_count + 1
        WHERE id = ${template.id}
          AND is_sponsored
          AND (sponsor_expires_at IS NULL OR sponsor_expires_at > NOW())
          AND (sponsor_total_limit IS NULL OR sponsor_used_count < sponsor_total_limit)
        RETURNING sponsor_used_count
      `;
      if (claimed.length > 0) return { source: "sponsored" };
      // Cap was exhausted between the read and the write — fall through to paying.
    }
  }

  // 3. Personal grant. Consume the oldest live grant that still has room, so a
  //    soon-to-expire grant is spent before a fresh one.
  if (email) {
    const consumed = await sql<{ id: string; remaining: number }[]>`
      UPDATE free_grants
      SET images_used = images_used + ${packageSize}, updated_at = NOW()
      WHERE id = (
        SELECT id FROM free_grants
        WHERE lower(email) = ${email.toLowerCase()}
          AND is_active
          AND (expires_at IS NULL OR expires_at > NOW())
          AND images_granted - images_used >= ${packageSize}
        ORDER BY expires_at NULLS LAST, created_at
        LIMIT 1
      )
      RETURNING id, (images_granted - images_used)::int AS remaining
    `;
    if (consumed.length > 0) {
      return { source: "grant", grantId: consumed[0].id, remaining: consumed[0].remaining };
    }
  }

  return null;
}

/**
 * Hand the allowance back. Call this whenever a booking is rolled back after a
 * successful claim — otherwise the buyer silently loses images they never used.
 */
export async function releaseFreeBooking(
  claim: FreeClaim | null,
  opts: { packageSize: number; templateId?: string | null }
): Promise<void> {
  if (!claim) return;
  try {
    if (claim.source === "grant" && claim.grantId) {
      await sql`
        UPDATE free_grants
        SET images_used = GREATEST(0, images_used - ${opts.packageSize}), updated_at = NOW()
        WHERE id = ${claim.grantId}
      `;
    } else if (claim.source === "sponsored" && opts.templateId) {
      await sql`
        UPDATE templates
        SET sponsor_used_count = GREATEST(0, sponsor_used_count - 1)
        WHERE id = ${opts.templateId}
      `;
    }
  } catch (err) {
    // Never let a release failure mask the original error the caller is handling.
    console.error("[free-access] release failed:", err);
  }
}

/**
 * Record the free booking in the ledger. creatorPayoutNgn is what the platform
 * owes the template's creator — free bookings skip the gateway, so no Paystack
 * split happens and this is settled by hand from the admin dashboard.
 */
export async function recordFreeBooking(opts: {
  claim: FreeClaim;
  shootId: string;
  userId: string;
  email: string | null | undefined;
  templateId?: string | null;
  packageSize: number;
  creatorPayoutNgn?: number;
}): Promise<void> {
  const { claim, shootId, userId, email, templateId, packageSize, creatorPayoutNgn = 0 } = opts;
  try {
    await sql`
      INSERT INTO free_bookings
        (shoot_id, user_id, email, template_id, package_size, source, grant_id, creator_payout_ngn)
      VALUES (
        ${shootId}, ${userId}, ${email ?? null}, ${templateId ?? null}, ${packageSize},
        ${claim.source}, ${claim.grantId ?? null}, ${creatorPayoutNgn}
      )
    `;
  } catch (err) {
    // The shoot is already queued at this point; a ledger write failure must not
    // fail the buyer's booking. Log loudly so the payout can be reconciled.
    console.error("[free-access] ledger insert failed:", { shootId, source: claim.source, err });
  }
}
