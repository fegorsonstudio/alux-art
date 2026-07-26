import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { r2Delete } from "@/lib/r2";

// Manage backdrops (background_options photos) across ALL of a creator's templates
// from the asset-library popup:
//   action "delete"  — remove the backdrop from every template that uses it and
//                      permanently delete the stored image (only if it is not still
//                      referenced by some other asset type).
//   action "replace" — swap the backdrop's photo for a newly uploaded one across
//                      every template that uses it, keeping name/slot, and delete the
//                      old image if it is no longer referenced anywhere.
//
// Ownership is proven the same way every sanitizer in this app proves it: the storage
// path must live under the creator's own ${user.id}/ prefix, which only that creator
// could ever have gotten into a template config.

type BgOption = { id: string; name: string; kind: "photo" | "text"; description?: string; imagePath?: string; imageBucket?: string };

// True when `path` is still referenced by any of this creator's templates OUTSIDE of
// the field we just edited — a safety gate so we never delete a file another asset
// (a choice-group option, a pose, a custom-slot plate, or a cover) still points at.
async function stillReferenced(creatorId: string, path: string): Promise<boolean> {
  const like = `%${path}%`;
  const [row] = await sql`
    SELECT COUNT(*)::int AS n FROM templates
    WHERE creator_id = ${creatorId}
      AND (
        background_options::text LIKE ${like}
        OR option_groups::text LIKE ${like}
        OR pose_options::text LIKE ${like}
        OR flag_shot::text LIKE ${like}
        OR trend_slots::text LIKE ${like}
        OR cover_storage_path = ${path}
      )
  `;
  return (row?.n ?? 0) > 0;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [creator] = await sql`SELECT id FROM creators WHERE user_id = ${user.id}`;
  if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const action = body.action;
  const imagePath = typeof body.imagePath === "string" ? body.imagePath : "";
  const imageBucket = typeof body.imageBucket === "string" && body.imageBucket ? body.imageBucket : "template-images";
  if (!imagePath || !imagePath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "You can only manage your own assets" }, { status: 403 });
  }

  const rows = await sql`SELECT id, background_options FROM templates WHERE creator_id = ${creator.id}` as unknown as Array<{ id: string; background_options: BgOption[] | null }>;

  if (action === "delete") {
    let removedFrom = 0;
    for (const t of rows) {
      const bo = Array.isArray(t.background_options) ? t.background_options : [];
      if (!bo.some((o) => o.imagePath === imagePath)) continue;
      const next = bo.filter((o) => o.imagePath !== imagePath);
      await sql`UPDATE templates SET background_options = ${next.length ? sql.json(next as unknown as Parameters<typeof sql.json>[0]) : null}, updated_at = ${new Date()} WHERE id = ${t.id} AND creator_id = ${creator.id}`;
      removedFrom++;
    }
    // Drop the preview rows for this backdrop (creator's templates only).
    await sql`DELETE FROM template_images WHERE storage_path = ${imagePath} AND template_id IN (SELECT id FROM templates WHERE creator_id = ${creator.id})`;

    let fileDeleted = false;
    if (!(await stillReferenced(creator.id, imagePath))) {
      await r2Delete(imageBucket, [imagePath]).catch((err) => console.error("[library-assets delete] r2Delete failed:", err));
      fileDeleted = true;
    }
    return NextResponse.json({ ok: true, removedFrom, fileDeleted });
  }

  if (action === "replace") {
    const newImagePath = typeof body.newImagePath === "string" ? body.newImagePath : "";
    const newImageBucket = typeof body.newImageBucket === "string" && body.newImageBucket ? body.newImageBucket : "template-images";
    if (!newImagePath || !newImagePath.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: "Invalid replacement image" }, { status: 400 });
    }
    let replacedIn = 0;
    for (const t of rows) {
      const bo = Array.isArray(t.background_options) ? t.background_options : [];
      if (!bo.some((o) => o.imagePath === imagePath)) continue;
      const next = bo.map((o) => o.imagePath === imagePath ? { ...o, imagePath: newImagePath, imageBucket: newImageBucket } : o);
      await sql`UPDATE templates SET background_options = ${sql.json(next as unknown as Parameters<typeof sql.json>[0])}, updated_at = ${new Date()} WHERE id = ${t.id} AND creator_id = ${creator.id}`;
      replacedIn++;
    }
    // Point the existing preview rows at the new image so the library thumbnail follows.
    await sql`UPDATE template_images SET storage_path = ${newImagePath}, storage_bucket = ${newImageBucket} WHERE storage_path = ${imagePath} AND template_id IN (SELECT id FROM templates WHERE creator_id = ${creator.id})`;

    if (!(await stillReferenced(creator.id, imagePath))) {
      await r2Delete(imageBucket, [imagePath]).catch((err) => console.error("[library-assets replace] r2Delete failed:", err));
    }
    return NextResponse.json({ ok: true, replacedIn });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
