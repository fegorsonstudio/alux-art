import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { r2SignedDownloadUrl } from "@/lib/r2";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const service = createServiceClient();

  const { data: creator, error } = await service
    .from("creators")
    .select("*")
    .eq("id", id)
    .eq("is_active", true)
    .single();

  if (error || !creator) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let avatarUrl: string | null = null;
  if (creator.avatar_storage_path) {
    avatarUrl = await r2SignedDownloadUrl(
      creator.avatar_bucket ?? "template-images",
      creator.avatar_storage_path,
      3600
    ).catch(() => null);
  }

  const { data: templates } = await service
    .from("templates")
    .select("id, title, category, price_ngn, purchase_count, cover_storage_path, cover_bucket, created_at")
    .eq("creator_id", id)
    .eq("status", "published")
    .order("created_at", { ascending: false });

  const templatesWithUrls = await Promise.all((templates ?? []).map(async (t) => {
    let coverUrl: string | null = null;
    if (t.cover_storage_path) {
      coverUrl = await r2SignedDownloadUrl(
        t.cover_bucket ?? "template-images",
        t.cover_storage_path,
        3600
      ).catch(() => null);
    }
    return {
      id: t.id,
      title: t.title,
      category: t.category,
      priceNgn: t.price_ngn,
      purchaseCount: t.purchase_count,
      coverUrl,
      createdAt: t.created_at,
    };
  }));

  return NextResponse.json({
    creator: {
      id: creator.id,
      displayName: creator.display_name,
      bio: creator.bio,
      avatarUrl,
      instagramUrl: creator.instagram_url,
      websiteUrl: creator.website_url,
      createdAt: creator.created_at,
      theme: creator.theme ?? "alux",
      fontFamily: creator.font_family ?? "default",
      templates: templatesWithUrls,
    },
  });
}
