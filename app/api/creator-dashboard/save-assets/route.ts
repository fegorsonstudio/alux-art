import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { r2Copy } from "@/lib/r2";
import { assetKindById } from "@/lib/asset-extractor";

/**
 * Move finished Asset Extractor images into a template as tagged references.
 *
 * Extraction writes its results to the generated-4k bucket like any shoot, but a
 * template asset must live in template-images under its creator's own prefix —
 * that is what sanitizeOptionGroups and the template_images routes enforce. So
 * each asset is COPIED rather than referenced: pointing a template at a shoot's
 * output would break the moment the 48-hour shoot cleanup ran.
 *
 * The tag comes from the asset kind, so an extracted gown arrives already
 * tagged GOWN and shows up in the right picker.
 */

interface Body {
  shootId?: string;
  templateId?: string;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { shootId, templateId } = (await request.json()) as Body;
  if (!shootId || !templateId) {
    return NextResponse.json({ error: "shootId and templateId are required" }, { status: 400 });
  }

  // The shoot must be this user's, and must be an extraction.
  const [shoot] = await sql<{ id: string; user_id: string; category: string | null; enhance: unknown }[]>`
    SELECT s.id, s.user_id, t.category, s.enhance
    FROM shoots s
    LEFT JOIN templates t ON t.id = COALESCE(s.template_showcase_id, s.template_id)
    WHERE s.id = ${shootId} AND s.user_id = ${user.id}
  `;
  if (!shoot) return NextResponse.json({ error: "Shoot not found" }, { status: 404 });
  if (shoot.category !== "asset_extract") {
    return NextResponse.json({ error: "That shoot is not an asset extraction" }, { status: 400 });
  }

  // The destination template must belong to this user too, or one creator could
  // write assets into another's template.
  const [template] = await sql<{ id: string }[]>`
    SELECT t.id FROM templates t
    JOIN creators c ON c.id = t.creator_id
    WHERE t.id = ${templateId} AND c.user_id = ${user.id}
  `;
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const plan = (shoot.enhance as { plan?: Array<{ kindId: string; angleId: string }> } | null)?.plan ?? [];

  const images = await sql<{ slot: number; download_storage_bucket: string; download_storage_path: string }[]>`
    SELECT slot, download_storage_bucket, download_storage_path
    FROM shoot_images
    WHERE shoot_id = ${shootId} AND status = 'COMPLETE' AND download_storage_path IS NOT NULL
    ORDER BY slot
  `;
  if (images.length === 0) {
    return NextResponse.json({ error: "This extraction has no finished assets yet." }, { status: 400 });
  }

  const [{ count }] = await sql<{ count: string }[]>`
    SELECT COUNT(*) AS count FROM template_images WHERE template_id = ${templateId} AND purpose = 'tagged'
  `;
  let displayOrder = Number(count) || 0;

  const saved: Array<{ slot: number; tag: string; name: string }> = [];
  const failed: Array<{ slot: number; why: string }> = [];

  for (const img of images) {
    // Slot N is plan[N-1] — the same positional mapping generation used.
    const step = plan[img.slot - 1];
    const kind = step ? assetKindById(step.kindId) : undefined;
    if (!kind) { failed.push({ slot: img.slot, why: "no plan entry" }); continue; }

    const name = kind.angles.length > 1
      ? `${kind.label} — ${kind.angles.find(a => a.id === step.angleId)?.label ?? step.angleId}`
      : kind.label;

    try {
      const dest = `${user.id}/${crypto.randomUUID()}-${kind.id}-${step.angleId}.png`;
      await r2Copy(img.download_storage_bucket, img.download_storage_path, "template-images", dest);
      await sql`INSERT INTO template_images ${sql({
        template_id: templateId,
        storage_path: dest,
        storage_bucket: "template-images",
        display_order: displayOrder++,
        purpose: "tagged",
        tag: kind.tag,
        custom_name: name.slice(0, 40),
        created_at: new Date(),
      })}`;
      saved.push({ slot: img.slot, tag: kind.tag, name });
    } catch (err) {
      console.error("[save-assets] slot", img.slot, err);
      failed.push({ slot: img.slot, why: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ saved: saved.length, failed: failed.length, assets: saved, errors: failed });
}
