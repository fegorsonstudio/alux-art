import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { r2SignedDownloadUrl } from "@/lib/r2";
import sql from "@/lib/db";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = user.email === process.env.ADMIN_EMAIL;
  const [shoot] = await sql`SELECT user_id FROM shoots WHERE id = ${id}`;
  if (!shoot) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (shoot.user_id !== user.id && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await sql`DELETE FROM generation_events WHERE shoot_id = ${id}`;
  await sql`DELETE FROM shoot_images WHERE shoot_id = ${id}`;
  await sql`DELETE FROM shoot_references WHERE shoot_id = ${id}`;
  await sql`DELETE FROM shoots WHERE id = ${id}`;

  return NextResponse.json({ ok: true });
}

async function withSignedPreviewUrls(shoot: Record<string, unknown> | null) {
  if (!shoot) return shoot;
  const images = await Promise.all(
    ((shoot.shoot_images as Record<string, unknown>[] | undefined) ?? []).map(async (img) => {
      if (img.status === "COMPLETE") {
        if (img.fal_url && img.kind !== "quote") {
          return { ...img, previewUrl: img.fal_url };
        }
        if (img.preview_storage_bucket && img.preview_storage_path) {
          const previewUrl = await r2SignedDownloadUrl(
            img.preview_storage_bucket as string,
            img.preview_storage_path as string,
            3600
          ).catch(() => null);
          return { ...img, previewUrl };
        }
      }
      return img;
    })
  );
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

  const isAdmin = user.email === process.env.ADMIN_EMAIL;

  const shootRows = isAdmin
    ? await sql`SELECT * FROM shoots WHERE id = ${id}`
    : await sql`SELECT * FROM shoots WHERE id = ${id} AND user_id = ${user.id}`;
  const shoot = shootRows[0] ?? null;

  if (!shoot) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const shoot_images = await sql`SELECT * FROM shoot_images WHERE shoot_id = ${id} ORDER BY slot`;
  const fullShoot = { ...shoot, shoot_images };

  const result = await withSignedPreviewUrls(fullShoot);
  return NextResponse.json({ shoot: result });
}
