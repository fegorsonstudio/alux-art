import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { r2SignedDownloadUrl } from "@/lib/r2";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  const [template] = await sql`
    SELECT t.*, c.id AS cr_id, c.display_name AS cr_display_name, c.bio AS cr_bio,
           c.instagram_url AS cr_instagram, c.website_url AS cr_website,
           c.avatar_storage_path AS cr_avatar_path, c.avatar_bucket AS cr_avatar_bucket,
           c.paystack_subaccount_code AS cr_subaccount, c.theme AS cr_theme,
           c.font_family AS cr_font_family
    FROM templates t
    LEFT JOIN creators c ON c.id = t.creator_id
    WHERE t.id = ${id} AND t.status = 'published'
  `;

  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let coverUrl: string | null = null;
  if (template.cover_storage_path) {
    coverUrl = await r2SignedDownloadUrl(
      (template.cover_bucket ?? "template-images") as string,
      template.cover_storage_path as string,
      3600
    ).catch(() => null);
  }

  let avatarUrl: string | null = null;
  if (template.cr_avatar_path) {
    avatarUrl = await r2SignedDownloadUrl(
      (template.cr_avatar_bucket ?? "template-images") as string,
      template.cr_avatar_path as string,
      3600
    ).catch(() => null);
  }

  const rawImages = await sql`
    SELECT id, storage_path, storage_bucket, display_order, purpose, tag,
           custom_name, note, note_hidden, created_at
    FROM template_images WHERE template_id = ${id}
    ORDER BY display_order ASC
  `;

  const images = await Promise.all(rawImages.map(async (img) => {
    const isWorkflowRef = img.purpose === "tagged" || img.purpose === "inspiration";
    let signedUrl: string | null = null;
    if (!isWorkflowRef) {
      signedUrl = await r2SignedDownloadUrl(
        (img.storage_bucket ?? "template-images") as string,
        img.storage_path as string,
        3600
      ).catch(() => null);
    }
    return {
      id: img.id,
      templateId: id,
      storagePath: img.storage_path,
      storageBucket: img.storage_bucket,
      displayOrder: img.display_order,
      purpose: img.purpose,
      tag: img.tag ?? null,
      customName: img.custom_name ?? null,
      note: img.note ?? null,
      noteHidden: img.note_hidden ?? false,
      url: signedUrl,
      createdAt: img.created_at,
    };
  }));

  const [{ count: templateCount }] = await sql`
    SELECT COUNT(*)::int AS count FROM templates
    WHERE creator_id = ${template.creator_id} AND status = 'published'
  `;

  let userRating: number | null = null;
  if (session?.user) {
    const [ratingRow] = await sql`
      SELECT rating FROM template_ratings
      WHERE template_id = ${id} AND user_id = ${session.user.id}
    `;
    userRating = ratingRow?.rating ?? null;
  }

  const seenImagePaths = new Set<string>();
  const deduplicatedImages = images.filter((img) => {
    if (img.purpose === "tagged") {
      if (seenImagePaths.has(img.storagePath as string)) return false;
      seenImagePaths.add(img.storagePath as string);
    }
    return true;
  });

  return NextResponse.json({
    template: {
      id: template.id,
      creatorId: template.creator_id,
      creator: template.cr_id ? {
        id: template.cr_id,
        displayName: template.cr_display_name,
        bio: template.cr_bio ?? null,
        instagramUrl: template.cr_instagram ?? null,
        websiteUrl: template.cr_website ?? null,
        avatarUrl,
        templateCount: templateCount ?? 0,
        theme: template.cr_theme ?? "alux",
        fontFamily: template.cr_font_family ?? "default",
      } : null,
      title: template.title,
      description: template.description ?? null,
      category: template.category,
      tags: template.tags ?? [],
      priceNgn: template.price_ngn,
      price1Ngn: template.price_1_ngn ?? null,
      price5Ngn: template.price_5_ngn ?? null,
      shootMode: template.shoot_mode,
      aspectRatio: template.aspect_ratio,
      packageSize: template.package_size,
      purchaseCount: template.purchase_count,
      avgRating: template.avg_rating ?? null,
      ratingCount: template.rating_count ?? 0,
      userRating,
      coverUrl,
      images: deduplicatedImages,
      createdAt: template.created_at,
      updatedAt: template.updated_at,
    },
  });
}
