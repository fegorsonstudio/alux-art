import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { r2SignedDownloadUrl } from "@/lib/r2";

async function getAdminSession() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user || user.email !== process.env.ADMIN_EMAIL) return null;
  return user;
}

export async function GET() {
  const user = await getAdminSession();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const slots = await sql`
    SELECT DISTINCT shoot_id FROM shoot_images
    WHERE provider = 'prompt-only' AND status = 'COMPLETE'
  `;

  const shootIds = slots.map((s) => s.shoot_id as string);
  if (shootIds.length === 0) return NextResponse.json({ shoots: [] });

  const shoots = await sql`
    SELECT id, created_at, mode, aspect_ratio, package_size
    FROM shoots WHERE id = ANY(${shootIds}) ORDER BY created_at DESC
  `;

  const images = await sql`
    SELECT id, shoot_id, slot, prompt, provider, status
    FROM shoot_images WHERE shoot_id = ANY(${shootIds})
  `;

  const imagesByShoot: Record<string, Record<string, unknown>[]> = {};
  for (const img of images) {
    if (!imagesByShoot[img.shoot_id]) imagesByShoot[img.shoot_id] = [];
    imagesByShoot[img.shoot_id].push(img);
  }

  const result = await Promise.all(shoots.map(async (shoot) => {
    const refs = await sql`
      SELECT id, purpose, tag, storage_bucket, storage_path
      FROM shoot_references WHERE shoot_id = ${shoot.id} AND purpose != 'identity'
    `;

    const signedRefs = await Promise.all(refs.map(async (ref) => {
      const signedUrl = await r2SignedDownloadUrl(ref.storage_bucket as string, ref.storage_path as string, 3600);
      return { id: ref.id, purpose: ref.purpose, tag: ref.tag, signedUrl };
    }));

    return { ...shoot, shoot_images: imagesByShoot[shoot.id] ?? [], refs: signedRefs };
  }));

  return NextResponse.json({ shoots: result });
}
