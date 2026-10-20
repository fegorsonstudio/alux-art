import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { startGenerationWorker } from "@/lib/generate";
import { notifyGenerationStarted, notifyShootComplete } from "@/lib/n8n";
import { isLockedBaseEnabled } from "@/lib/base-lock";
import sql from "@/lib/db";
import { isAdminEmail } from "@/lib/auth";
import { INTERNAL_BASE_URL } from "@/lib/site-url";
import { isInternalSecret, safeResolution } from "@/lib/internal-auth";
import { withShootLock } from "@/lib/worker-lock";
import { settleShortfall } from "@/lib/shortfall";
import { tellAdmin } from "@/lib/telegram";

export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const resolution: string = safeResolution(body.resolution);
  const isInternal = isInternalSecret(req.headers.get("x-internal-secret"));
  let callerIsAdmin = false;

  if (!isInternal) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [ownerCheck] = await sql`SELECT user_id, status FROM shoots WHERE id = ${id}`;
    const isOwner = ownerCheck?.user_id === user.id;
    const isAdmin = isAdminEmail(user.email);
    callerIsAdmin = isAdmin;
    if (!isOwner && !isAdmin)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!isAdmin && ownerCheck?.status === "PENDING_PAYMENT")
      return NextResponse.json({ error: "Payment required" }, { status: 402 });
    // A finished-and-failed order is not restarted by the buyer: failed photos
    // were either refunded or are redone through retry / free regeneration, which
    // apply the refund rules. Restarting it here regenerated refunded images.
    if (!isAdmin && ownerCheck?.status === "FAILED")
      return NextResponse.json({ error: "This order has finished. Use retry on a failed photo instead." }, { status: 409 });
  } else {
    const [ownerCheck] = await sql`SELECT status FROM shoots WHERE id = ${id}`;
    if (ownerCheck?.status === "PENDING_PAYMENT")
      return NextResponse.json({ error: "Payment required" }, { status: 402 });
  }

  const [shoot] = await sql`
    SELECT status, user_id, owner_email, character_base_id FROM shoots WHERE id = ${id}
  `;
  if (!shoot) return NextResponse.json({ error: "Shoot not found" }, { status: 404 });
  if (shoot.status === "COMPLETE")
    return NextResponse.json({ ok: true, queued: false, status: "COMPLETE" });

  if (shoot.status === "BASE_REJECTED") {
    return NextResponse.json({ ok: false, status: "BASE_REJECTED" });
  }
  if (shoot.status === "BASE_LOCKING" || shoot.status === "BASE_REVIEW") {
    return NextResponse.json({ ok: true, status: shoot.status });
  }

  // Glow Retouch orders are not generated here. The retouch worker
  // (workers/retouch, cron on the server) picks up QUEUED photo_retouch shoots and
  // edits the customer's own pixels; sending one into lib/generate.ts would run
  // the relight model on it instead. Left exactly as the payment step set it.
  const [{ category: startCategory } = { category: null }] = await sql`
    SELECT t.category FROM templates t JOIN shoots s ON s.template_id = t.id WHERE s.id = ${id}`;
  if (startCategory === "photo_retouch") {
    return NextResponse.json({ ok: true, status: shoot.status, worker: "retouch" });
  }

  const now = new Date().toISOString();

  let rolloutPct: number | undefined;
  let dbLockedBaseEnabled: boolean | null = null;
  try {
    const cfgRows = await sql`
      SELECT key, value FROM app_config
      WHERE key = ANY(${["locked_base_rollout_percent", "locked_base_enabled"]})
    `;
    for (const row of cfgRows) {
      if (row.key === "locked_base_rollout_percent") rolloutPct = parseInt(row.value, 10);
      if (row.key === "locked_base_enabled") dbLockedBaseEnabled = row.value === "true";
    }
  } catch { /* non-fatal */ }

  if (
    shoot.status === "QUEUED" &&
    !shoot.character_base_id &&
    isLockedBaseEnabled(id, rolloutPct, dbLockedBaseEnabled)
  ) {
    await sql`
      UPDATE shoots SET
        status = 'BASE_LOCKING', base_lock_status = 'GENERATING',
        base_lock_started_at = ${now}, updated_at = ${now}
      WHERE id = ${id}
    `;
    sql`INSERT INTO generation_events (id, shoot_id, user_id, type, payload, created_at) VALUES (${crypto.randomUUID()}, ${id}, ${shoot.user_id}, 'base_locking', ${sql.json({ stage: "Locking character base", progress: 5 })}, ${now})`.catch(() => {});

    fetch(`${INTERNAL_BASE_URL}/api/shoots/${id}/base-lock`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
      },
      body: JSON.stringify({ attempt: 1 }),
    }).catch((err) => console.error("[start] base-lock dispatch failed:", err));

    return NextResponse.json({ ok: true, status: "BASE_LOCKING" });
  }

  // Guard: block generation if no identity references are attached.
  // This prevents wasting fal.ai credits on shoots that can never succeed.
  if (shoot.status !== "PROCESSING") {
    // The category rides along on the same round trip. A gif_loop booking is two
    // product photographs and a caption — there is no face anywhere in it — so
    // the identity guard would fail every one of them before it started.
    const [identityCheck] = await sql`
      SELECT COUNT(r.id)::int AS count,
             (SELECT t.category FROM templates t
                JOIN shoots s2 ON s2.template_id = t.id
               WHERE s2.id = ${id}) AS category
      FROM shoot_references r
      WHERE r.shoot_id = ${id} AND r.purpose = 'identity'
    `;
    if (identityCheck?.category !== "gif_loop"
        && !shoot.character_base_id && (identityCheck?.count ?? 0) === 0) {
      await sql`UPDATE shoots SET status = 'FAILED', pipeline_stage = 'No identity images — please start a new shoot and upload identity photos', updated_at = ${now} WHERE id = ${id}`;
      return NextResponse.json({ ok: false, error: "No identity images attached to this shoot. Start a new shoot and upload your identity photos first." }, { status: 400 });
    }
  }

  if (shoot.status !== "PROCESSING") {
    const claimed = await sql`
      UPDATE shoots SET
        status = 'PROCESSING', progress = 5,
        pipeline_stage = 'Starting generation', updated_at = ${now}
      WHERE id = ${id} AND status = ANY(${isInternal || callerIsAdmin ? ["QUEUED", "FAILED"] : ["QUEUED"]})
      RETURNING id
    `;

    if (!claimed.length)
      return NextResponse.json({ ok: true, queued: false, status: shoot.status });

    await sql`
      UPDATE shoot_images SET status = 'QUEUED', stage = 'Queued for generation', updated_at = ${now}
      WHERE shoot_id = ${id} AND status = ANY(${["PENDING", "FAILED"]})
    `;
    sql`INSERT INTO generation_events (id, shoot_id, user_id, type, payload, created_at) VALUES (${crypto.randomUUID()}, ${id}, ${shoot.user_id}, 'stage', ${sql.json({ stage: "Starting generation", progress: 5 })}, ${now})`.catch(() => {});

    const ownerEmail = shoot.owner_email as string | undefined;
    if (ownerEmail) {
      notifyGenerationStarted(id, ownerEmail).catch(() => {});
    }

  }

  // Reset slots stuck in GENERATING for > 10 minutes — Vercel timeout can orphan them
  // mid-save (fal.ai call succeeds but R2 upload times out), leaving no worker to continue.
  const stuckCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const stuckReset = await sql`
    UPDATE shoot_images
    SET status = 'QUEUED', stage = 'Reset: timed out during save', updated_at = ${now}
    WHERE shoot_id = ${id}
    AND status = 'GENERATING'
    AND updated_at < ${stuckCutoff}
    RETURNING slot
  `.catch(() => []);
  if ((stuckReset as { slot: number }[]).length > 0) {
    console.warn(`[start] reset ${(stuckReset as { slot: number }[]).length} stuck GENERATING slot(s):`,
      (stuckReset as { slot: number }[]).map((r) => r.slot));
  }

  try {
    // One worker per shoot. If another is already running it will reach any
    // queued slot itself, so this call has nothing to do.
    const run = await withShootLock(id, () => startGenerationWorker(id, { maxSlots: 1, resolution }));
    if (!run.locked) {
      return NextResponse.json({ ok: true, busy: true, status: "PROCESSING" });
    }
    const result = run.value;

    if (!result.done) {
      fetch(`${INTERNAL_BASE_URL}/api/shoots/${id}/start`, {
        method: "POST",
        headers: {
          "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ resolution }),
      }).then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          console.error("[start] self-continuation non-ok:", r.status, body);
        }
      }).catch((err) => console.error("[start] self-continuation failed:", err));
    } else {
      notifyShootComplete(id).catch(() => {});
    }

    return NextResponse.json({ ok: true, provider: "vercel-fal", ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[start] generation worker failed:", message);

    // The worker failed before or between photos (identity analysis, the brief,
    // a missing reference). Every slot not yet made is marked failed so the
    // order is settled like any other short shoot — refund for a paid booking,
    // free regeneration for a free one — and the studio is told. Before, the
    // slots stayed queued, the refund code never ran and nobody heard.
    await sql`
      UPDATE shoot_images SET status = 'FAILED',
        stage = ${`Failed before generation: ${message}`.slice(0, 200)},
        provider_error = ${message.slice(0, 1000)}, updated_at = NOW()
      WHERE shoot_id = ${id} AND status = ANY(${["QUEUED", "PENDING", "GENERATING"]})
    `.catch(() => {});
    const [{ done } = { done: 0 }] = await sql<{ done: number }[]>`
      SELECT count(*)::int AS done FROM shoot_images WHERE shoot_id = ${id} AND status = 'COMPLETE'`.catch(() => [{ done: 0 }]);

    await sql`
      UPDATE shoots SET
        status = ${done > 0 ? "COMPLETE" : "FAILED"},
        pipeline_stage = ${`Generation failed: ${message}`.slice(0, 300)},
        completed_at = COALESCE(completed_at, NOW()),
        updated_at = NOW()
      WHERE id = ${id}
    `;

    let settledNote = "";
    try {
      const settled = await settleShortfall(id);
      settledNote = settled.refundedNgn > 0
        ? `Refunded ₦${settled.refundedNgn.toLocaleString("en-NG")} to the buyer's wallet.`
        : settled.regenerationOffered ? "Free order: a free regeneration was offered." : "Nothing to refund.";
    } catch (e) {
      settledNote = `Settlement failed: ${e instanceof Error ? e.message : e}`;
    }
    const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] as string);
    tellAdmin(
      `⚠️ <b>Order ${id.slice(0, 8)} stopped</b> (${esc(shoot.owner_email ?? "unknown buyer")})\n` +
      `${done} photo(s) were made before it failed.\nReason: ${esc(message.slice(0, 300))}\n${esc(settledNote)}`,
    ).catch(() => {});

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
