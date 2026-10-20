import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { r2ProxyUrl, r2Delete } from "@/lib/r2";
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
  const [shoot] = await sql`SELECT user_id, status, zip_storage_bucket, zip_storage_path FROM shoots WHERE id = ${id}`;
  if (!shoot) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (shoot.user_id !== user.id && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Deleting an order that is still being made would pull its rows out from
  // under the worker mid-generation.
  if (["PROCESSING", "QUEUED", "GENERATING", "BASE_LOCKING", "BASE_REVIEW"].includes(shoot.status as string)) {
    return NextResponse.json({ error: "This order is still being made. Delete it once it has finished." }, { status: 409 });
  }

  // The output files, read before the rows go (the 7-day clean-up works from
  // these rows, so files left behind here were never removed).
  const files = await sql<{ bucket: string; path: string }[]>`
    SELECT preview_storage_bucket AS bucket, preview_storage_path AS path FROM shoot_images WHERE shoot_id = ${id} AND preview_storage_path IS NOT NULL
    UNION SELECT download_storage_bucket, download_storage_path FROM shoot_images WHERE shoot_id = ${id} AND download_storage_path IS NOT NULL
    UNION SELECT instagram_storage_bucket, instagram_storage_path FROM shoot_images WHERE shoot_id = ${id} AND instagram_storage_path IS NOT NULL`;
  if (shoot.zip_storage_bucket && shoot.zip_storage_path) files.push({ bucket: shoot.zip_storage_bucket as string, path: shoot.zip_storage_path as string });

  // All-or-nothing. Images, references and events go with the shoot (the
  // foreign keys cascade); a paid purchase record blocks the delete, and then
  // nothing is removed — before, the photos vanished and the order stayed.
  try {
    await sql.begin(async (tx) => {
      await tx`DELETE FROM shoots WHERE id = ${id}`;
    });
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "23503") {
      return NextResponse.json({ error: "This order has a payment record, so it is kept. Its photos are removed automatically 7 days after it finished." }, { status: 409 });
    }
    throw e;
  }

  // Never touch a library bucket (template assets, the buyer's own photos).
  const LIBRARY = new Set(["template-images", "identity-images", "inspiration-images", "character-bases"]);
  const byBucket = new Map<string, string[]>();
  for (const f of files) {
    if (!f.bucket || !f.path || LIBRARY.has(f.bucket)) continue;
    byBucket.set(f.bucket, [...(byBucket.get(f.bucket) ?? []), f.path]);
  }
  await Promise.allSettled([...byBucket].map(([bucket, paths]) => r2Delete(bucket, paths)));

  return NextResponse.json({ ok: true });
}

function withPreviewUrls(shoot: Record<string, unknown> | null) {
  if (!shoot) return shoot;
  const images = ((shoot.shoot_images as Record<string, unknown>[] | undefined) ?? []).map((img) => {
    const { fal_url: _fal_url, ...safeImg } = img as Record<string, unknown>;
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
