import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import { signBasePath } from "@/lib/base-lock";

// POST /api/characters/[id]/save — promote a shoot's base into the named library
// PATCH /api/characters/[id] — update label
// DELETE /api/characters/[id] — soft-archive

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: baseId } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const label: string = typeof body.label === "string" ? body.label.trim().slice(0, 80) : "";

  const service = createServiceClient();
  const { data: base } = await service
    .from("character_bases")
    .select("id, user_id, status")
    .eq("id", baseId)
    .single();

  if (!base || base.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!["AUTO_APPROVED", "USER_APPROVED"].includes(base.status)) {
    return NextResponse.json({ error: "Base must be approved before saving to library" }, { status: 400 });
  }

  await service.from("character_bases").update({
    user_label: label || null,
    updated_at: new Date().toISOString(),
  }).eq("id", baseId);

  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: baseId } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const label: string = typeof body.label === "string" ? body.label.trim().slice(0, 80) : "";

  const service = createServiceClient();
  const { data: base } = await service
    .from("character_bases")
    .select("id, user_id")
    .eq("id", baseId)
    .single();

  if (!base || base.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await service.from("character_bases").update({
    user_label: label || null,
    updated_at: new Date().toISOString(),
  }).eq("id", baseId);

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: baseId } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: base } = await service
    .from("character_bases")
    .select("id, user_id")
    .eq("id", baseId)
    .single();

  if (!base || base.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await service.from("character_bases").update({
    is_archived: true,
    updated_at: new Date().toISOString(),
  }).eq("id", baseId);

  return NextResponse.json({ ok: true });
}

// GET /api/characters/[id] — fetch single base with signed URL
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: baseId } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: base } = await service
    .from("character_bases")
    .select("*")
    .eq("id", baseId)
    .single();

  if (!base || (base.user_id !== user.id && user.email !== process.env.ADMIN_EMAIL)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const storagePath = base.base_4k_storage_path ?? base.base_storage_path;
  let baseUrl: string | null = null;
  if (storagePath) {
    baseUrl = await signBasePath(service, storagePath, 3600).catch(() => null);
  }

  return NextResponse.json({ character: { ...base, base_url: baseUrl } });
}
