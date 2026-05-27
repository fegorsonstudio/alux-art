import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { isAdminEmail } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: shootId } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ts = () => new Date().toISOString();

  const [shoot] = await sql`
    SELECT id, user_id, status, character_base_id FROM shoots WHERE id = ${shootId}
  `;
  if (!shoot) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = shoot.user_id === user.id;
  const isAdmin = isAdminEmail(user.email);
  if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (shoot.status !== "BASE_REVIEW") {
    return NextResponse.json({ error: `Shoot is not in BASE_REVIEW state (current: ${shoot.status})` }, { status: 400 });
  }
  if (!shoot.character_base_id) {
    return NextResponse.json({ error: "No character base attached" }, { status: 400 });
  }

  await sql`
    UPDATE character_bases SET status = 'USER_REJECTED', updated_at = ${ts()}
    WHERE id = ${shoot.character_base_id}
  `;

  const [{ count }] = await sql`
    SELECT COUNT(*)::int AS count FROM character_bases
    WHERE origin_shoot_id = ${shootId} AND status != 'GENERATING'
  `;
  const usedAttempts = count ?? 0;

  if (usedAttempts >= 5) {
    await sql`
      UPDATE shoots SET status = 'BASE_REJECTED', base_lock_status = 'USER_REJECTED', updated_at = ${ts()}
      WHERE id = ${shootId}
    `;
    await sql`
      INSERT INTO generation_events (id, shoot_id, user_id, type, payload, created_at)
      VALUES (
        ${crypto.randomUUID()}, ${shootId}, ${shoot.user_id},
        'failed',
        ${JSON.stringify({ reason: "Base lock rejected after maximum attempts. Please re-upload identity photos or contact support for a refund." })},
        ${ts()}
      )
    `;
    return NextResponse.json({ ok: true, terminal: true, status: "BASE_REJECTED" });
  }

  await sql`
    UPDATE shoots SET
      status = 'BASE_LOCKING', base_lock_status = 'GENERATING',
      character_base_id = null, updated_at = ${ts()}
    WHERE id = ${shootId}
  `;
  await sql`
    INSERT INTO generation_events (id, shoot_id, user_id, type, payload, created_at)
    VALUES (
      ${crypto.randomUUID()}, ${shootId}, ${shoot.user_id},
      'base_rerolling',
      ${JSON.stringify({ attempt: usedAttempts + 1, attempts_remaining: 5 - usedAttempts - 1 })},
      ${ts()}
    )
  `;

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  fetch(`${origin}/api/shoots/${shootId}/base-lock`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "" },
    body: JSON.stringify({ attempt: 1 }),
  }).catch(() => {});

  return NextResponse.json({
    ok: true, terminal: false, status: "BASE_LOCKING",
    attemptsRemaining: 5 - usedAttempts - 1,
  });
}
