import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { startGenerationWorker } from "@/lib/generate";
import { notifyGenerationStarted, notifyShootComplete } from "@/lib/n8n";
import { isLockedBaseEnabled } from "@/lib/base-lock";
import sql from "@/lib/db";

export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const resolution: string = typeof body.resolution === "string" ? body.resolution : "1K";
  const internalSecret = req.headers.get("x-internal-secret");
  const isInternal =
    internalSecret && internalSecret === process.env.INTERNAL_API_SECRET;

  if (!isInternal) {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [ownerCheck] = await sql`SELECT user_id, status FROM shoots WHERE id = ${id}`;
    const isOwner = ownerCheck?.user_id === user.id;
    const isAdmin = user.email === process.env.ADMIN_EMAIL;
    if (!isOwner && !isAdmin)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!isAdmin && ownerCheck?.status === "PENDING_PAYMENT")
      return NextResponse.json({ error: "Payment required" }, { status: 402 });
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
    await sql`
      INSERT INTO generation_events (id, shoot_id, user_id, type, payload, created_at)
      VALUES (
        ${crypto.randomUUID()}, ${id}, ${shoot.user_id},
        'base_locking', ${JSON.stringify({ stage: "Locking character base", progress: 5 })}, ${now}
      )
    `;

    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
    fetch(`${origin}/api/shoots/${id}/base-lock`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
      },
      body: JSON.stringify({ attempt: 1 }),
    }).catch((err) => console.error("[start] base-lock dispatch failed:", err));

    return NextResponse.json({ ok: true, status: "BASE_LOCKING" });
  }

  if (shoot.status !== "PROCESSING") {
    const claimed = await sql`
      UPDATE shoots SET
        status = 'PROCESSING', progress = 5,
        pipeline_stage = 'Starting generation', updated_at = ${now}
      WHERE id = ${id} AND status = ANY(${["QUEUED", "FAILED"]})
      RETURNING id
    `;

    if (!claimed.length)
      return NextResponse.json({ ok: true, queued: false, status: shoot.status });

    await sql`
      UPDATE shoot_images SET status = 'QUEUED', stage = 'Queued for generation', updated_at = ${now}
      WHERE shoot_id = ${id} AND status = ANY(${["PENDING", "FAILED"]})
    `;
    await sql`
      INSERT INTO generation_events (id, shoot_id, user_id, type, payload, created_at)
      VALUES (
        ${crypto.randomUUID()}, ${id}, ${shoot.user_id},
        'stage', ${JSON.stringify({ stage: "Starting generation", progress: 5 })}, ${now}
      )
    `;

    const ownerEmail = shoot.owner_email as string | undefined;
    if (ownerEmail) {
      notifyGenerationStarted(id, ownerEmail).catch(() => {});
    }
  }

  try {
    const result = await startGenerationWorker(id, { maxSlots: 1, resolution });

    if (!result.done) {
      const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
      fetch(`${origin}/api/shoots/${id}/start`, {
        method: "POST",
        headers: {
          "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ resolution }),
      }).catch((err) => console.error("[start] self-continuation failed:", err));
    } else {
      notifyShootComplete(id).catch(() => {});
    }

    return NextResponse.json({ ok: true, provider: "vercel-fal", ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[start] generation worker failed:", message);

    await sql`
      UPDATE shoots SET
        status = 'FAILED',
        pipeline_stage = ${`Generation failed: ${message}`},
        updated_at = NOW()
      WHERE id = ${id}
    `;

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
