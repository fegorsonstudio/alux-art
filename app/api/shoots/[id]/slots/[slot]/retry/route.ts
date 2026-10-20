import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { startGenerationWorker } from "@/lib/generate";
import sql from "@/lib/db";
import { isAdminEmail } from "@/lib/auth";
import { safeResolution } from "@/lib/internal-auth";
import { withShootLock } from "@/lib/worker-lock";
import { shortfallRefunded } from "@/lib/shortfall";
import { INTERNAL_BASE_URL } from "@/lib/site-url";

/** A photo can be retried this many times; after that a person looks at it. */
const MAX_RETRIES_PER_SLOT = 3;
/** A slot still "generating" this long after its last update is treated as stuck. */
const STUCK_AFTER_MS = 10 * 60 * 1000;

export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; slot: string }> }
) {
  const { id, slot: slotParam } = await params;
  const slotNum = parseInt(slotParam, 10);
  if (isNaN(slotNum) || slotNum < 1) {
    return NextResponse.json({ error: "Invalid slot" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date().toISOString();

  const [shoot] = await sql`SELECT user_id, status, expires_at FROM shoots WHERE id = ${id}`;
  if (!shoot) return NextResponse.json({ error: "Shoot not found" }, { status: 404 });

  const isAdmin = isAdminEmail(user.email);
  if (shoot.user_id !== user.id && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // A Glow Retouch photo is redone by the retouch worker, never by the relight
  // model in lib/generate.ts.
  const [{ category: retryCategory } = { category: null }] = await sql`
    SELECT t.category FROM templates t JOIN shoots s ON s.template_id = t.id WHERE s.id = ${id}`;
  if (retryCategory === "photo_retouch") {
    return NextResponse.json({ error: "Retouched photos are redone by the studio — send support in the chat." }, { status: 409 });
  }

  // The order's photos were removed after the retention period: nothing to redo from.
  if (shoot.expires_at && new Date(shoot.expires_at as string).getTime() <= Date.now()) {
    return NextResponse.json({ error: "This order has expired and its files were removed. Please book again." }, { status: 410 });
  }

  // One remedy per missing photo. If this order was already refunded for the
  // photos that did not come, retrying them would deliver them on top of the
  // refund. The buyer keeps the money and can book again; an admin can still retry.
  if (!isAdmin) {
    const refunded = await shortfallRefunded(id);
    if (refunded > 0) {
      return NextResponse.json({
        error: `You were refunded ₦${refunded.toLocaleString("en-NG")} for the photos that did not generate. It is in your wallet: use it to book again.`,
        refunded,
      }, { status: 409 });
    }
  }

  const [slotRow] = await sql`
    SELECT id, status, updated_at FROM shoot_images WHERE shoot_id = ${id} AND slot = ${slotNum}
  `;
  if (!slotRow) return NextResponse.json({ error: "Slot not found" }, { status: 404 });
  // A slot that is genuinely being made must not be started a second time (two
  // paid calls, last one wins). Only a stuck one, quiet for 10 minutes, qualifies.
  const stuck = slotRow.status === "GENERATING"
    && Date.now() - new Date(slotRow.updated_at as string).getTime() > STUCK_AFTER_MS;
  if (slotRow.status !== "FAILED" && !stuck) {
    return NextResponse.json({ error: slotRow.status === "GENERATING" ? "This photo is still being made." : "Slot is not in a retryable state", status: slotRow.status }, { status: 409 });
  }

  // Retries per photo are capped; each one is a paid generation.
  const [{ n: retries } = { n: 0 }] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM generation_events
    WHERE shoot_id = ${id} AND type = 'retry_requested' AND payload->>'slot' = ${String(slotNum)}`;
  if (!isAdmin && retries >= MAX_RETRIES_PER_SLOT) {
    return NextResponse.json({ error: "This photo has been retried the maximum number of times. Send us a message and a person will sort it out." }, { status: 429 });
  }
  await sql`
    INSERT INTO generation_events (id, shoot_id, user_id, type, payload, created_at)
    VALUES (${crypto.randomUUID()}, ${id}, ${shoot.user_id}, 'retry_requested', ${sql.json({ slot: String(slotNum), by: isAdmin ? "admin" : "buyer" })}, ${now})
  `.catch(() => {});

  await sql`
    UPDATE shoot_images SET
      status = 'QUEUED', stage = 'Queued for retry',
      provider_error = null, updated_at = ${now}
    WHERE id = ${slotRow.id}
  `;
  await sql`
    UPDATE shoots SET status = 'PROCESSING', updated_at = ${now}
    WHERE id = ${id}
  `;

  const body = await req.json().catch(() => ({}));
  const resolution = safeResolution(body.resolution);

  // One worker per shoot. If one is already running it picks this slot up on
  // its own; otherwise run it here and keep going while slots remain (before,
  // only one slot was ever processed, so a second queued photo waited forever).
  withShootLock(id, () => startGenerationWorker(id, { maxSlots: 1, resolution }))
    .then((run) => {
      if (run.locked && !run.value.done) {
        fetch(`${INTERNAL_BASE_URL}/api/shoots/${id}/start`, {
          method: "POST",
          headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "", "Content-Type": "application/json" },
          body: JSON.stringify({ resolution }),
        }).catch((err) => console.error("[retry] continuation failed:", err));
      }
    })
    .catch((err) => {
      console.error(`[retry] slot ${slotNum} worker error:`, err);
    });

  return NextResponse.json({ ok: true, slot: slotNum });
}
