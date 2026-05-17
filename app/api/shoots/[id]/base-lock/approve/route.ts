import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import { signBasePath } from "@/lib/base-lock";

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
    return NextResponse.json({ error: "No character base attached to this shoot" }, { status: 400 });
  }

  // Approve the base
  await service.from("character_bases").update({
    status: "USER_APPROVED",
    updated_at: ts(),
  }).eq("id", shoot.character_base_id);

  // Queue the shoot
  await service.from("shoots").update({
    status: "QUEUED",
    base_lock_status: "USER_APPROVED",
    base_lock_completed_at: ts(),
    updated_at: ts(),
  }).eq("id", shootId);

  await service.from("generation_events").insert({
    id: crypto.randomUUID(),
    shoot_id: shootId,
    user_id: shoot.user_id,
    type: "base_approved",
    payload: { base_id: shoot.character_base_id, approved_by: "user" },
    created_at: ts(),
  });

  // Fire start to resume slot generation
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  fetch(`${origin}/api/shoots/${shootId}/start`, {
    method: "POST",
    headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "" },
  }).catch(() => {});

  // Return the signed base URL so the UI can show it
  const { data: base } = await service
    .from("character_bases")
    .select("base_4k_storage_path, base_storage_path")
    .eq("id", shoot.character_base_id)
    .single();

  let baseUrl: string | null = null;
  if (base?.base_4k_storage_path ?? base?.base_storage_path) {
    baseUrl = await signBasePath(service, (base.base_4k_storage_path ?? base.base_storage_path)!).catch(() => null);
  }

  return NextResponse.json({ ok: true, baseUrl });
}
