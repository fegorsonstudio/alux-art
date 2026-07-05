import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { isAdminEmail } from "@/lib/auth";
import { SITE_URL } from "@/lib/site-url";

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
    SELECT id, user_id, status, regeneration_status FROM shoots
    WHERE id = ${id}
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

  // Atomic transaction:
  // 1. Reset every slot (including already-complete ones) back to QUEUED.
  // 2. Mark regeneration_status consumed and shoot status QUEUED.
  //    Using WHERE regeneration_status = 'eligible' as an optimistic lock —
  //    if a concurrent request already flipped it, the UPDATE returns 0 rows
  //    and we throw to rollback, preventing double-regeneration.
  try {
    await sql.begin(async (trx) => {
      await trx`
        UPDATE shoot_images
        SET status = 'QUEUED', updated_at = NOW()
        WHERE shoot_id = ${id}
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
  fetch(`${SITE_URL}/api/shoots/${id}/start`, {
    method: "POST",
    headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "" },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
