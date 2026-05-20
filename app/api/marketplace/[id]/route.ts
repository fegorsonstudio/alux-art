import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const service = createServiceClient();

  const { data: template, error } = await service
    .from("templates")
    .select("*, creators(*), template_images(*)")
    .eq("id", id)
    .eq("status", "published")
    .single();

  if (error || !template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let coverUrl: string | null = null;
  if (template.cover_storage_path) {
    const { data: s } = await service.storage
      .from(template.cover_bucket ?? "template-images")
      .createSignedUrl(template.cover_storage_path, 3600);
    coverUrl = s?.signedUrl ?? null;
  }

  const cr = template.creators as Record<string, string> | null;
  let avatarUrl: string | null = null;
  if (cr?.avatar_storage_path) {
    const { data: s } = await service.storage
      .from(cr.avatar_bucket ?? "template-images")
      .createSignedUrl(cr.avatar_storage_path, 3600);
    avatarUrl = s?.signedUrl ?? null;
  }

  const rawImages = (template.template_images ?? []) as Array<{
    id: string; storage_path: string; storage_bucket: string;
    display_order: number; purpose: string; tag?: string; created_at: string;
  }>;

  const images = await Promise.all(
    rawImages
      .sort((a, b) => a.display_order - b.display_order)
      .map(async (img) => {
        const { data: s } = await service.storage
          .from(img.storage_bucket ?? "template-images")
          .createSignedUrl(img.storage_path, 3600);
        return {
          id: img.id,
          templateId: id,
          storagePath: img.storage_path,
          storageBucket: img.storage_bucket,
          displayOrder: img.display_order,
          purpose: img.purpose,
          tag: img.tag ?? null,
          url: s?.signedUrl ?? null,
          createdAt: img.created_at,
        };
      })
  );

  const { count: templateCount } = await service
    .from("templates")
    .select("id", { count: "exact", head: true })
    .eq("creator_id", template.creator_id)
    .eq("status", "published");

  return NextResponse.json({
    template: {
      id: template.id,
      creatorId: template.creator_id,
      creator: cr ? {
        id: cr.id,
        displayName: cr.display_name,
        bio: cr.bio ?? null,
        instagramUrl: cr.instagram_url ?? null,
        websiteUrl: cr.website_url ?? null,
        avatarUrl,
        templateCount: templateCount ?? 0,
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
      coverUrl,
      images,
      createdAt: template.created_at,
      updatedAt: template.updated_at,
    },
  });
}
