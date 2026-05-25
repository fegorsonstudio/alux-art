import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { r2ProxyUrl } from "@/lib/r2";

export async function GET() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [creator] = await sql`SELECT * FROM creators WHERE user_id = ${user.id}`;
  if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });

  const rawTemplates = await sql`SELECT * FROM templates WHERE creator_id = ${creator.id} ORDER BY created_at DESC`;

  const templateIds = rawTemplates.map((t) => t.id as string);
  const allImages: Record<string, unknown>[] = templateIds.length
    ? await sql`
        SELECT id, template_id, display_order, purpose, tag, note, note_hidden, custom_name, storage_path, storage_bucket
        FROM template_images WHERE template_id = ANY(${templateIds})
      `
    : [];

  const imagesByTemplate: Record<string, Record<string, unknown>[]> = {};
  for (const img of allImages) {
    const tid = img.template_id as string;
    if (!imagesByTemplate[tid]) imagesByTemplate[tid] = [];
    imagesByTemplate[tid].push(img);
  }

  const templates = rawTemplates.map((t) => {
    const cover_url = t.cover_storage_path
      ? r2ProxyUrl((t.cover_bucket ?? "template-images") as string, t.cover_storage_path as string)
      : null;

    const rawImages = imagesByTemplate[t.id as string] ?? [];
    const template_images = rawImages.map((img) => ({
      ...img,
      signed_url: img.storage_path
        ? r2ProxyUrl((img.storage_bucket ?? "template-images") as string, img.storage_path as string)
        : null,
    }));

    return { ...t, cover_url, template_images };
  });

  const purchases = templateIds.length
    ? await sql`
        SELECT creator_payout_ngn, template_id FROM template_purchases
        WHERE status = 'success' AND template_id = ANY(${templateIds})
      `
    : [];

  const totalEarned = purchases.reduce((sum, p) => sum + ((p.creator_payout_ngn as number) ?? 0), 0);
  const totalSales = purchases.length;

  return NextResponse.json({
    creator,
    templates,
    stats: {
      totalTemplates: templates.length,
      publishedTemplates: templates.filter((t) => (t as Record<string, unknown>).status === "published").length,
      totalSales,
      totalEarnedNgn: totalEarned,
    },
  });
}
