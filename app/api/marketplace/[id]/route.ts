import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const service = createServiceClient();
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

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
    display_order: number; purpose: string; tag?: string | null;
    custom_name?: string | null; note?: string | null; note_hidden?: boolean | null; created_at: string;
  }>;

  const images = await Promise.all(
    rawImages
      .sort((a, b) => a.display_order - b.display_order)
      .map(async (img) => {
        // Workflow reference images (tagged + inspiration) are kept private until after
        // payment — return path/bucket for the book page but no signed URL.
        const isWorkflowRef = img.purpose === "tagged" || img.purpose === "inspiration";
        let signedUrl: string | null = null;
        if (!isWorkflowRef) {
          const { data: s } = await service.storage
            .from(img.storage_bucket ?? "template-images")
            .createSignedUrl(img.storage_path, 3600);
          signedUrl = s?.signedUrl ?? null;
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
      })
  );

  const { count: templateCount } = await service
    .from("templates")
    .select("id", { count: "exact", head: true })
    .eq("creator_id", template.creator_id)
    .eq("status", "published");

  let userRating: number | null = null;
  if (session?.user) {
    const { data: ratingRow } = await service
      .from("template_ratings")
      .select("rating")
      .eq("template_id", id)
      .eq("user_id", session.user.id)
      .single();
    userRating = ratingRow?.rating ?? null;
  }

  // Deduplicate tagged images by storagePath before exposing to buyer — duplicate DB
  // records from creator dashboard re-uploads should appear as a single ref.
  const seenImagePaths = new Set<string>();
  const deduplicatedImages = images.filter(img => {
    if (img.purpose === "tagged") {
      if (seenImagePaths.has(img.storagePath)) return false;
      seenImagePaths.add(img.storagePath);
    }
    return true;
  });

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
        theme: cr.theme ?? "alux",
        fontFamily: cr.font_family ?? "default",
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
      avgRating: (template as Record<string, unknown>).avg_rating as number | null ?? null,
      ratingCount: (template as Record<string, unknown>).rating_count as number ?? 0,
      userRating,
      coverUrl,
      images: deduplicatedImages,
      createdAt: template.created_at,
      updatedAt: template.updated_at,
    },
  });
}
