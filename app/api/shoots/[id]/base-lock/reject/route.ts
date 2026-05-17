import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: shootId } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const ts = () => new Date().toISOString();

  const { data: shoot } = await service
    .from("shoots")
    .select("id, user_id, status, character_base_id")
    .eq("id", shootId)
    .single();

  if (!shoot) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = shoot.user_id === user.id;
  const isAdmin = user.email === process.env.ADMIN_EMAIL;
  if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (shoot.status !== "BASE_REVIEW") {
    return NextResponse.json({ error: `Shoot is not in BASE_REVIEW state (current: ${shoot.status})` }, { status: 400 });
  }

  if (!shoot.character_base_id) {
    return NextResponse.json({ error: "No character base attached" }, { status: 400 });
  }

  // Mark current base as rejected
  await service.from("character_bases").update({
    status: "USER_REJECTED",
    updated_at: ts(),
  }).eq("id", shoot.character_base_id);

  // Count total attempts across all bases for this shoot
  const { count: totalAttempts } = await service
    .from("character_bases")
    .select("id", { count: "exact", head: true })
    .eq("origin_shoot_id", shootId)
    .neq("status", "GENERATING");

  const usedAttempts = totalAttempts ?? 0;

  if (usedAttempts >= 5) {
    // Terminal: user exhausted all attempts
    await service.from("shoots").update({
      status: "BASE_REJECTED",
      base_lock_status: "USER_REJECTED",
      updated_at: ts(),
    }).eq("id", shootId);

    await service.from("generation_events").insert({
      id: crypto.randomUUID(),
      shoot_id: shootId,
      user_id: shoot.user_id,
      type: "failed",
      payload: { reason: "Base lock rejected after maximum attempts. Please re-upload identity photos or contact support for a refund." },
      created_at: ts(),
    });

    return NextResponse.json({ ok: true, terminal: true, status: "BASE_REJECTED" });
  }

  // Trigger a fresh re-roll (new base_id so previous attempt is preserved)
  await service.from("shoots").update({
    status: "BASE_LOCKING",
    base_lock_status: "GENERATING",
    character_base_id: null,
    updated_at: ts(),
  }).eq("id", shootId);

  await service.from("generation_events").insert({
    id: crypto.randomUUID(),
    shoot_id: shootId,
    user_id: shoot.user_id,
    type: "base_rerolling",
    payload: { attempt: usedAttempts + 1, attempts_remaining: 5 - usedAttempts - 1 },
    created_at: ts(),
  });

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  fetch(`${origin}/api/shoots/${shootId}/base-lock`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
    },
    body: JSON.stringify({ attempt: 1 }),
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    terminal: false,
    status: "BASE_LOCKING",
    attemptsRemaining: 5 - usedAttempts - 1,
  });
}
