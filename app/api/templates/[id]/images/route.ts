import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { r2Delete } from "@/lib/r2";

const ALLOWED_PURPOSES = new Set(["inspiration", "tagged", "sample"]);
const ALLOWED_TAGS = new Set(["OUTFIT", "HAIRSTYLE", "MAKEUP", "NAIL_DESIGN", "BACKGROUND", "LIGHTING", "ACCESSORY", "COLOR_GRADE"]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
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
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [creator] = await sql`SELECT id FROM creators WHERE user_id = ${user.id}`;
  if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });

  const body = await request.json() as Record<string, unknown>;
  const { imageId, tag, note, customName, noteHidden } = body;

  if (typeof imageId !== "string") return NextResponse.json({ error: "imageId required" }, { status: 400 });
  if (tag !== undefined && (typeof tag !== "string" || !ALLOWED_TAGS.has(tag as string))) {
    return NextResponse.json({ error: "Invalid tag" }, { status: 400 });
  }

  const [img] = await sql`SELECT id, template_id FROM template_images WHERE id = ${imageId} AND template_id = ${id}`;
  if (!img) return NextResponse.json({ error: "Image not found" }, { status: 404 });

  const [tmpl] = await sql`SELECT id FROM templates WHERE id = ${img.template_id} AND creator_id = ${creator.id}`;
  if (!tmpl) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const updates: Record<string, unknown> = {};
  if (tag !== undefined) updates.tag = tag;
  if (note !== undefined) updates.note = (typeof note === "string" && note.trim()) ? note.trim() : null;
  if (customName !== undefined) updates.custom_name = (typeof customName === "string" && customName.trim()) ? customName.trim() : null;
  if (noteHidden !== undefined) updates.note_hidden = noteHidden === true;

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
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
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
      const paths = allRefs.map((r) => r.storage_path as string).filter(Boolean);
      if (paths.length > 0) await r2Delete("template-images", paths).catch(() => {});
      const ids = allRefs.map((r) => r.id as string);
      await sql`DELETE FROM template_images WHERE id = ANY(${ids})`;
    }
    return NextResponse.json({ ok: true, deleted: allRefs.length });
  }

  if (typeof body.imageId !== "string") return NextResponse.json({ error: "imageId required" }, { status: 400 });

  const [img] = await sql`SELECT id, storage_path, template_id FROM template_images WHERE id = ${body.imageId} AND template_id = ${id}`;
  if (!img) return NextResponse.json({ error: "Image not found" }, { status: 404 });

  const [tmpl] = await sql`SELECT id FROM templates WHERE id = ${img.template_id} AND creator_id = ${creator.id}`;
  if (!tmpl) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await r2Delete("template-images", [img.storage_path as string]).catch(() => {});
  await sql`DELETE FROM template_images WHERE id = ${body.imageId}`;

  return NextResponse.json({ ok: true });
}
