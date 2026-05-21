import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const category = searchParams.get("category");
  const search = searchParams.get("q");
  const cursor = searchParams.get("cursor");
  const limit = Math.min(Number(searchParams.get("limit") ?? 24), 48);

  const service = createServiceClient();

  let q = service
    .from("templates")
    .select("id, creator_id, title, description, category, tags, price_ngn, shoot_mode, aspect_ratio, package_size, purchase_count, cover_storage_path, cover_bucket, created_at, creators(id, display_name, avatar_storage_path, avatar_bucket)")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (category && category !== "all") q = q.eq("category", category);
  if (search) q = q.ilike("title", `%${search}%`);
  if (cursor) q = q.lt("created_at", cursor);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: "Failed to load templates" }, { status: 500 });

  // Attempt to fetch ratings separately (graceful no-op if migration 015 not yet applied)
  const templateIds = (data ?? []).map(t => t.id);
  let ratingsMap: Record<string, { avg: number | null; count: number }> = {};
  if (templateIds.length > 0) {
    const { data: ratingRows } = await service
      .from("templates")
      .select("id, avg_rating, rating_count")
      .in("id", templateIds);
    if (ratingRows) {
      for (const r of ratingRows) {
        ratingsMap[r.id] = {
          avg: (r as Record<string, unknown>).avg_rating as number | null ?? null,
          count: (r as Record<string, unknown>).rating_count as number ?? 0,
        };
      }
    }
  }

  const hasMore = (data?.length ?? 0) > limit;
  const rows = (data ?? []).slice(0, limit);

  const templates = await Promise.all(rows.map(async (t) => {
    let coverUrl: string | null = null;
    if (t.cover_storage_path) {
      const { data: s } = await service.storage
        .from(t.cover_bucket ?? "template-images")
        .createSignedUrl(t.cover_storage_path, 3600);
      coverUrl = s?.signedUrl ?? null;
    }

    const creator = (Array.isArray(t.creators) ? t.creators[0] : t.creators) as { id: string; display_name: string; avatar_storage_path?: string; avatar_bucket?: string } | null;
    let avatarUrl: string | null = null;
    if (creator?.avatar_storage_path) {
      const { data: s } = await service.storage
        .from(creator.avatar_bucket ?? "template-images")
        .createSignedUrl(creator.avatar_storage_path, 3600);
      avatarUrl = s?.signedUrl ?? null;
    }

    return {
      id: t.id,
      creatorId: t.creator_id,
      creator: creator ? { id: creator.id, displayName: creator.display_name, avatarUrl } : null,
      title: t.title,
      description: t.description,
      category: t.category,
      tags: t.tags ?? [],
      priceNgn: t.price_ngn,
      shootMode: t.shoot_mode,
      aspectRatio: t.aspect_ratio,
      packageSize: t.package_size,
      purchaseCount: t.purchase_count,
      avgRating: ratingsMap[t.id]?.avg ?? null,
      ratingCount: ratingsMap[t.id]?.count ?? 0,
      coverUrl,
      createdAt: t.created_at,
    };
  }));

  const nextCursor = hasMore ? rows[rows.length - 1]?.created_at : null;
  return NextResponse.json({ templates, nextCursor });
}
