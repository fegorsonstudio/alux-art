import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { r2ProxyUrl } from "@/lib/r2";
import sql from "@/lib/db";
import { isAdminEmail } from "@/lib/auth";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = isAdminEmail(user.email);
  const [shoot] = await sql`SELECT user_id FROM shoots WHERE id = ${id}`;
  if (!shoot) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (shoot.user_id !== user.id && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await sql`DELETE FROM generation_events WHERE shoot_id = ${id}`;
  await sql`DELETE FROM shoot_images WHERE shoot_id = ${id}`;
  await sql`DELETE FROM shoot_references WHERE shoot_id = ${id}`;
  await sql`DELETE FROM shoots WHERE id = ${id}`;

  return NextResponse.json({ ok: true });
}

function withPreviewUrls(shoot: Record<string, unknown> | null) {
  if (!shoot) return shoot;
  const images = ((shoot.shoot_images as Record<string, unknown>[] | undefined) ?? []).map((img) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { fal_url, ...safeImg } = img as Record<string, unknown>;
    if (safeImg.status === "COMPLETE") {
      if (safeImg.preview_storage_bucket && safeImg.preview_storage_path) {
        return { ...safeImg, previewUrl: r2ProxyUrl(safeImg.preview_storage_bucket as string, safeImg.preview_storage_path as string) };
      }
    }
    return safeImg;
  });
  return { ...shoot, shoot_images: images };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = isAdminEmail(user.email);

  const shootRows = isAdmin
    ? await sql`SELECT * FROM shoots WHERE id = ${id}`
    : await sql`SELECT * FROM shoots WHERE id = ${id} AND user_id = ${user.id}`;
  const shoot = shootRows[0] ?? null;

  if (!shoot) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const shoot_images = await sql`SELECT * FROM shoot_images WHERE shoot_id = ${id} ORDER BY slot`;
  const fullShoot = { ...shoot, shoot_images };

  const result = withPreviewUrls(fullShoot);
  return NextResponse.json({ shoot: result });
}
