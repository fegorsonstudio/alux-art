import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { signBasePath } from "@/lib/base-lock";
import sql from "@/lib/db";
import { isAdminEmail } from "@/lib/auth";
import { SITE_URL } from "@/lib/site-url";

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
    return NextResponse.json({ error: "No character base attached to this shoot" }, { status: 400 });
  }

  await sql`
    UPDATE character_bases SET status = 'USER_APPROVED', updated_at = ${ts()}
    WHERE id = ${shoot.character_base_id}
  `;
  await sql`
    UPDATE shoots SET
      status = 'QUEUED', base_lock_status = 'USER_APPROVED',
      base_lock_completed_at = ${ts()}, updated_at = ${ts()}
    WHERE id = ${shootId}
  `;
  await sql`
    INSERT INTO generation_events (id, shoot_id, user_id, type, payload, created_at)
    VALUES (
      ${crypto.randomUUID()}, ${shootId}, ${shoot.user_id},
      'base_approved',
      ${JSON.stringify({ base_id: shoot.character_base_id, approved_by: "user" })},
      ${ts()}
    )
  `;

  const origin = SITE_URL;
  fetch(`${origin}/api/shoots/${shootId}/start`, {
    method: "POST",
    headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "" },
  }).catch(() => {});

  const [base] = await sql`
    SELECT base_4k_storage_path, base_storage_path FROM character_bases
    WHERE id = ${shoot.character_base_id}
  `;

  let baseUrl: string | null = null;
  if (base?.base_4k_storage_path ?? base?.base_storage_path) {
    baseUrl = await signBasePath(null as never, (base.base_4k_storage_path ?? base.base_storage_path)!).catch(() => null);
  }

  return NextResponse.json({ ok: true, baseUrl });
}
