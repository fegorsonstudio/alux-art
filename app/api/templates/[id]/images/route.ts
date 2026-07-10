import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { r2Delete } from "@/lib/r2";

const ALLOWED_PURPOSES = new Set(["inspiration", "tagged", "sample"]);
const ALLOWED_TAGS = new Set(["OUTFIT", "HAIRSTYLE", "MAKEUP", "NAIL_DESIGN", "BACKGROUND", "LIGHTING", "ACCESSORY", "COLOR_GRADE", "WIG", "GOWN", "COLLAR_MALE", "COLLAR_FEMALE", "FLAG_SCENE", "MUGSHOT_BOARD", "BOWL_PROP"]);

// Assets can be reused across templates (asset library): the same storage_path may back
// options on several templates. Only delete the R2 object when NOTHING else references it —
// another template_images row, or any template's option_groups/background_options/
// flag_shot/trend_slots JSONB.
async function isStoragePathShared(storagePath: string, excludeImageId?: string): Promise<boolean> {
  const [row] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM template_images
        WHERE storage_path = ${storagePath}
        ${excludeImageId ? sql`AND id != ${excludeImageId}` : sql``}) AS img_refs,
      (SELECT COUNT(*)::int FROM templates
        WHERE option_groups::text LIKE ${"%" + storagePath + "%"}
           OR background_options::text LIKE ${"%" + storagePath + "%"}
           OR flag_shot::text LIKE ${"%" + storagePath + "%"}
           OR trend_slots::text LIKE ${"%" + storagePath + "%"}) AS jsonb_refs
  `.catch(() => [{ img_refs: 1, jsonb_refs: 1 }]); // on error, assume shared (never delete blindly)
  return ((row?.img_refs as number) ?? 1) > 0 || ((row?.jsonb_refs as number) ?? 1) > 0;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [creator] = await sql`SELECT id FROM creators WHERE user_id = ${user.id}`;
  if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });

  const [template] = await sql`SELECT id FROM templates WHERE id = ${id} AND creator_id = ${creator.id}`;
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const body = await request.json() as Record<string, unknown>;
  const { storagePath, displayOrder, purpose, tag, note, customName, noteHidden } = body;

  if (typeof storagePath !== "string" || !storagePath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "Invalid storage path" }, { status: 400 });
  }
  if (typeof purpose !== "string" || !ALLOWED_PURPOSES.has(purpose)) {
    return NextResponse.json({ error: "Invalid purpose" }, { status: 400 });
  }
  if (purpose === "tagged" && (typeof tag !== "string" || !ALLOWED_TAGS.has(tag))) {
    return NextResponse.json({ error: "Invalid tag for tagged image" }, { status: 400 });
  }

  const isSample = purpose === "sample";
  const [{ count }] = await sql`
    SELECT COUNT(*)::int AS count FROM template_images
    WHERE template_id = ${id}
      ${isSample ? sql`AND purpose = 'sample'` : sql`AND purpose != 'sample'`}
  `;
  const maxAllowed = isSample ? 10 : 20;
  if ((count as number) >= maxAllowed) {
    return NextResponse.json({ error: `Maximum ${maxAllowed} ${isSample ? "sample" : "workflow"} images per template` }, { status: 400 });
  }

  const noteVal = (typeof note === "string" && note.trim()) ? note.trim() : null;
  const customNameVal = (typeof customName === "string" && customName.trim()) ? customName.trim() : null;

  const insertRow: Record<string, unknown> = {
    template_id: id,
    storage_path: storagePath,
    storage_bucket: "template-images",
    display_order: Number(displayOrder) || 0,
    purpose,
    tag: purpose === "tagged" ? tag : null,
    created_at: new Date(),
  };
  if (noteVal !== null) insertRow.note = noteVal;
  if (customNameVal !== null) insertRow.custom_name = customNameVal;
  if (noteHidden === true) insertRow.note_hidden = true;

  const [image] = await sql`INSERT INTO template_images ${sql(insertRow)} RETURNING *`
    .catch(async (err) => {
      if (insertRow.note_hidden !== undefined) {
        const { note_hidden: _nh, ...core } = insertRow;
        return sql`INSERT INTO template_images ${sql(core)} RETURNING *`.catch(() => [null]);
      }
      console.error("[template images POST]", err);
      return [null];
    });

  if (!image) return NextResponse.json({ error: "Failed to add image" }, { status: 500 });
  return NextResponse.json({ image }, { status: 201 });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [creator] = await sql`SELECT id FROM creators WHERE user_id = ${user.id}`;
  if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });

  const body = await request.json() as Record<string, unknown>;
  const { imageId, tag, note, customName, noteHidden, storagePath } = body;

  if (typeof imageId !== "string") return NextResponse.json({ error: "imageId required" }, { status: 400 });
  if (tag !== undefined && (typeof tag !== "string" || !ALLOWED_TAGS.has(tag as string))) {
    return NextResponse.json({ error: "Invalid tag" }, { status: 400 });
  }
  if (storagePath !== undefined && (typeof storagePath !== "string" || !storagePath.startsWith(`${user.id}/`))) {
    return NextResponse.json({ error: "Invalid storage path" }, { status: 400 });
  }

  const [img] = await sql`SELECT id, template_id, storage_path FROM template_images WHERE id = ${imageId} AND template_id = ${id}`;
  if (!img) return NextResponse.json({ error: "Image not found" }, { status: 404 });

  const [tmpl] = await sql`SELECT id FROM templates WHERE id = ${img.template_id} AND creator_id = ${creator.id}`;
  if (!tmpl) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const updates: Record<string, unknown> = {};
  if (tag !== undefined) updates.tag = tag;
  if (note !== undefined) updates.note = (typeof note === "string" && note.trim()) ? note.trim() : null;
  if (customName !== undefined) updates.custom_name = (typeof customName === "string" && customName.trim()) ? customName.trim() : null;
  if (noteHidden !== undefined) updates.note_hidden = noteHidden === true;
  if (storagePath !== undefined) {
    if (img.storage_path && !(await isStoragePathShared(img.storage_path as string, imageId))) {
      await r2Delete("template-images", [img.storage_path as string]).catch(() => {});
    }
    updates.storage_path = storagePath;
  }

  if (Object.keys(updates).length === 0) return NextResponse.json({ ok: true });

  await sql`UPDATE template_images SET ${sql(updates)} WHERE id = ${imageId}`.catch(async (err) => {
    if (updates.note_hidden !== undefined) {
      const { note_hidden: _nh, ...core } = updates;
      if (Object.keys(core).length > 0) {
        await sql`UPDATE template_images SET ${sql(core)} WHERE id = ${imageId}`.catch(() => {});
      }
    } else {
      console.error("[template images PATCH]", err);
    }
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [creator] = await sql`SELECT id FROM creators WHERE user_id = ${user.id}`;
  if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });

  const body = await request.json() as { imageId?: string; clearAll?: boolean };

  if (body.clearAll === true) {
    const [tmpl] = await sql`SELECT id FROM templates WHERE id = ${id} AND creator_id = ${creator.id}`;
    if (!tmpl) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const allRefs = await sql`
      SELECT id, storage_path FROM template_images
      WHERE template_id = ${id} AND purpose = ANY(${["tagged", "inspiration"]})
    `;

    if (allRefs.length > 0) {
      // Delete DB rows first so the shared-check sees the post-delete state,
      // then only remove R2 objects nothing else references.
      const ids = allRefs.map((r) => r.id as string);
      await sql`DELETE FROM template_images WHERE id = ANY(${ids})`;
      const paths = allRefs.map((r) => r.storage_path as string).filter(Boolean);
      const deletable: string[] = [];
      for (const p of paths) {
        if (!(await isStoragePathShared(p))) deletable.push(p);
      }
      if (deletable.length > 0) await r2Delete("template-images", deletable).catch(() => {});
    }
    return NextResponse.json({ ok: true, deleted: allRefs.length });
  }

  if (typeof body.imageId !== "string") return NextResponse.json({ error: "imageId required" }, { status: 400 });

  const [img] = await sql`SELECT id, storage_path, template_id FROM template_images WHERE id = ${body.imageId} AND template_id = ${id}`;
  if (!img) return NextResponse.json({ error: "Image not found" }, { status: 404 });

  const [tmpl] = await sql`SELECT id FROM templates WHERE id = ${img.template_id} AND creator_id = ${creator.id}`;
  if (!tmpl) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await sql`DELETE FROM template_images WHERE id = ${body.imageId}`;
  if (img.storage_path && !(await isStoragePathShared(img.storage_path as string))) {
    await r2Delete("template-images", [img.storage_path as string]).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
