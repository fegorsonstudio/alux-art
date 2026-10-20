import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { isAdminEmail } from "@/lib/auth";
import { INTERNAL_BASE_URL } from "@/lib/site-url";
import { shortfallRefunded } from "@/lib/shortfall";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = isAdminEmail(user.email);

  const [shoot] = await sql`
    SELECT s.id, s.user_id, s.status, s.regeneration_status, s.character_base_id, t.category
    FROM shoots s LEFT JOIN templates t ON t.id = COALESCE(s.template_showcase_id, s.template_id)
    WHERE s.id = ${id}
  `;
  if (!shoot) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (shoot.user_id !== user.id && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (shoot.regeneration_status !== "eligible") {
    const message =
      shoot.regeneration_status === "completed"
        ? "Complimentary regeneration has already been used for this shoot."
        : "This shoot is not eligible for regeneration.";
    return NextResponse.json({ error: message }, { status: 409 });
  }

  // One remedy per missing photo: an order already refunded for them is not
  // also regenerated (the buyer keeps the refund and can book again).
  if (!isAdmin) {
    const refunded = await shortfallRefunded(id);
    if (refunded > 0) {
      return NextResponse.json({
        error: `You were refunded ₦${refunded.toLocaleString("en-NG")} for the photos that did not generate. It is in your wallet: use it to book again.`,
      }, { status: 409 });
    }
  }

  // The buyer's own photos are deleted 48 hours after a shoot for privacy.
  // Without them the regeneration fails at once and, worse, used to wipe the
  // photos they already had. Say so instead.
  const needsIdentity = shoot.category !== "gif_loop" && shoot.category !== "ar_experience" && !shoot.character_base_id;
  if (needsIdentity) {
    const [{ n } = { n: 0 }] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM shoot_references WHERE shoot_id = ${id} AND purpose = 'identity'`;
    if (n === 0) {
      return NextResponse.json({
        error: "Your photos were removed 48 hours after the shoot to protect your privacy, so this order can't be regenerated. Please book a new shoot.",
      }, { status: 409 });
    }
  }

  // Atomic transaction:
  // 1. Reset only the slots that did not come out back to QUEUED. Finished
  //    photos are kept: regenerating used to overwrite them, and if the run
  //    then failed the buyer lost photos they already had.
  // 2. Mark regeneration_status consumed and shoot status QUEUED.
  //    Using WHERE regeneration_status = 'eligible' as an optimistic lock —
  //    if a concurrent request already flipped it, the UPDATE returns 0 rows
  //    and we throw to rollback, preventing double-regeneration.
  try {
    await sql.begin(async (trx) => {
      await trx`
        UPDATE shoot_images
        SET status = 'QUEUED', updated_at = NOW()
        WHERE shoot_id = ${id} AND status <> 'COMPLETE'
      `;

      const [claimed] = await trx`
        UPDATE shoots
        SET regeneration_status = 'completed',
            status = 'QUEUED',
            updated_at = NOW()
        WHERE id = ${id} AND regeneration_status = 'eligible'
        RETURNING id
      `;

      if (!claimed) {
        throw new Error("regeneration_already_consumed");
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "regeneration_already_consumed") {
      return NextResponse.json(
        { error: "Complimentary regeneration has already been used for this shoot." },
        { status: 409 }
      );
    }
    console.error("[regenerate] transaction failed:", msg);
    return NextResponse.json({ error: "Could not start regeneration — please try again." }, { status: 500 });
  }

  // Fire the generation worker. The shoot is now QUEUED with all slots reset.
  fetch(`${INTERNAL_BASE_URL}/api/shoots/${id}/start`, {
    method: "POST",
    headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "" },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
