import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import { startGenerationWorker } from "@/lib/generate";
import { notifyGenerationStarted, notifyShootComplete } from "@/lib/n8n";
import { isLockedBaseEnabled } from "@/lib/base-lock";

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
  const service = createServiceClient();

  if (!isInternal) {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: ownerCheck } = await service
      .from("shoots")
      .select("user_id, status")
      .eq("id", id)
      .single();

    const isOwner = ownerCheck?.user_id === user.id;
    const isAdmin = user.email === process.env.ADMIN_EMAIL;
    if (!isOwner && !isAdmin)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!isAdmin && ownerCheck?.status === "PENDING_PAYMENT")
      return NextResponse.json({ error: "Payment required" }, { status: 402 });
  } else {
    const { data: ownerCheck } = await service
      .from("shoots")
      .select("status")
      .eq("id", id)
      .single();
    if (ownerCheck?.status === "PENDING_PAYMENT")
      return NextResponse.json({ error: "Payment required" }, { status: 402 });
  }

  const { data: shoot } = await service
    .from("shoots")
    .select("status, user_id, owner_email, character_base_id")
    .eq("id", id)
    .single();

  if (!shoot) return NextResponse.json({ error: "Shoot not found" }, { status: 404 });
  if (shoot.status === "COMPLETE")
    return NextResponse.json({ ok: true, queued: false, status: "COMPLETE" });

  // ── Base-lock terminal/waiting states — return early ────────────────────
  if (shoot.status === "BASE_REJECTED") {
    return NextResponse.json({ ok: false, status: "BASE_REJECTED" });
  }
  if (shoot.status === "BASE_LOCKING" || shoot.status === "BASE_REVIEW") {
    return NextResponse.json({ ok: true, status: shoot.status });
  }

  const now = new Date().toISOString();

  // Read rollout percent from app_config (overrides env var for no-code admin control)
  let rolloutPct: number | undefined;
  try {
    const { data: cfgRows } = await service.from("app_config").select("key,value").eq("key", "locked_base_rollout_percent");
    const row = cfgRows?.[0];
    if (row) rolloutPct = parseInt(row.value, 10);
  } catch { /* non-fatal — env var fallback applies */ }

  // ── Base-lock dispatch — QUEUED shoots that need a base ─────────────────
  if (
    shoot.status === "QUEUED" &&
    !shoot.character_base_id &&
    isLockedBaseEnabled(id, rolloutPct)
  ) {
    await service.from("shoots").update({
      status: "BASE_LOCKING",
      base_lock_status: "GENERATING",
      base_lock_started_at: now,
      updated_at: now,
    }).eq("id", id);

    await service.from("generation_events").insert({
      id: crypto.randomUUID(),
      shoot_id: id,
      user_id: shoot.user_id,
      type: "base_locking",
      payload: { stage: "Locking character base", progress: 5 },
      created_at: now,
    });

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

  // Claim the shoot only if it isn't already PROCESSING (continuation skips this)
  if (shoot.status !== "PROCESSING") {
    const { data: claimed, error: claimError } = await service
      .from("shoots")
      .update({
        status: "PROCESSING",
        progress: 5,
        pipeline_stage: "Starting generation",
        updated_at: now,
      })
      .eq("id", id)
      .in("status", ["QUEUED", "FAILED"])
      .select("id")
      .maybeSingle();

    if (claimError)
      return NextResponse.json({ error: claimError.message }, { status: 500 });
    if (!claimed)
      return NextResponse.json({ ok: true, queued: false, status: shoot.status });

    // Mark all pending/failed slots as QUEUED so the worker can pick them up
    await service
      .from("shoot_images")
      .update({ status: "QUEUED", stage: "Queued for generation", updated_at: now })
      .eq("shoot_id", id)
      .in("status", ["PENDING", "FAILED"]);

    await service.from("generation_events").insert({
      id: crypto.randomUUID(),
      shoot_id: id,
      user_id: shoot.user_id,
      type: "stage",
      payload: { stage: "Starting generation", progress: 5 },
      created_at: now,
    });

    // Notify user that generation has started (fire-and-forget)
    const ownerEmail = (shoot as unknown as Record<string, string>).owner_email;
    if (ownerEmail) {
      notifyGenerationStarted(id, ownerEmail).catch(() => {});
    }
  }

  try {
    const result = await startGenerationWorker(id, { maxSlots: 1, resolution });

    if (!result.done) {
      // Self-continuation: fire next slot in a new invocation (fire-and-forget)
      const origin =
        process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
      fetch(`${origin}/api/shoots/${id}/start`, {
        method: "POST",
        headers: {
          "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ resolution }),
      }).catch((err) =>
        console.error("[start] self-continuation failed:", err)
      );
    } else {
      // All slots done — notify n8n for email (fire-and-forget)
      notifyShootComplete(id).catch(() => {});
    }

    return NextResponse.json({ ok: true, provider: "vercel-fal", ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[start] generation worker failed:", message);

    await service
      .from("shoots")
      .update({
        status: "FAILED",
        pipeline_stage: `Generation failed: ${message}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
