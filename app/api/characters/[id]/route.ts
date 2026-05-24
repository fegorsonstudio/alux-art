import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { signBasePath } from "@/lib/base-lock";

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

  const [base] = await sql`SELECT id, user_id, status FROM character_bases WHERE id = ${baseId}`;

  if (!base || base.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!["AUTO_APPROVED", "USER_APPROVED"].includes(base.status as string)) {
    return NextResponse.json({ error: "Base must be approved before saving to library" }, { status: 400 });
  }

  await sql`UPDATE character_bases SET user_label = ${label || null}, updated_at = NOW() WHERE id = ${baseId}`;
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

  const [base] = await sql`SELECT id, user_id FROM character_bases WHERE id = ${baseId}`;
  if (!base || base.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await sql`UPDATE character_bases SET user_label = ${label || null}, updated_at = NOW() WHERE id = ${baseId}`;
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

  const [base] = await sql`SELECT id, user_id FROM character_bases WHERE id = ${baseId}`;
  if (!base || base.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await sql`UPDATE character_bases SET is_archived = true, updated_at = NOW() WHERE id = ${baseId}`;
  return NextResponse.json({ ok: true });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: baseId } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [base] = await sql`SELECT * FROM character_bases WHERE id = ${baseId}`;

  if (!base || (base.user_id !== user.id && user.email !== process.env.ADMIN_EMAIL)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const storagePath = (base.base_4k_storage_path ?? base.base_storage_path) as string | null;
  let baseUrl: string | null = null;
  if (storagePath) {
    baseUrl = await signBasePath(null as never, storagePath, 3600).catch(() => null);
  }

  return NextResponse.json({ character: { ...base, base_url: baseUrl } });
}
