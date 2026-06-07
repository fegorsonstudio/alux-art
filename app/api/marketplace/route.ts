import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { r2ProxyUrl } from "@/lib/r2";

const CACHE_TTL_MS = 60_000;
const marketplaceCache = (globalThis as any).__MARKETPLACE_CACHE ||= new Map();

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const category = searchParams.get("category");
  const search = searchParams.get("q");
  const cursor = searchParams.get("cursor");
  const limit = Math.min(Number(searchParams.get("limit") ?? 24), 48);
  const isStoryFilter = searchParams.get("isStory") === "true";
  const storyType = searchParams.get("storyType"); // solo | duo | group
  const cacheKey = `category:${category ?? "all"}|search:${search ?? ""}|cursor:${cursor ?? ""}|limit:${limit}|story:${isStoryFilter}|storyType:${storyType ?? ""}`;

  const cached = marketplaceCache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return NextResponse.json(cached.payload);
  }

  const rows = await sql`
    SELECT t.id, t.creator_id, t.title, t.description, t.category, t.tags,
           t.price_ngn, t.shoot_mode, t.aspect_ratio, t.package_size, t.purchase_count,
           t.cover_storage_path, t.cover_bucket, t.created_at,
           t.avg_rating, t.rating_count, t.is_story, t.story_type,
           c.id AS c_id, c.display_name AS c_display_name,
           c.avatar_storage_path AS c_avatar_path, c.avatar_bucket AS c_avatar_bucket
    FROM templates t
    LEFT JOIN creators c ON c.id = t.creator_id
    WHERE t.status = 'published'
      AND t.is_story = ${isStoryFilter}
      ${category && category !== "all" ? sql`AND t.category = ${category}` : sql``}
      ${search ? sql`AND t.title ILIKE ${"%" + search + "%"}` : sql``}
      ${storyType ? sql`AND t.story_type = ${storyType}` : sql``}
      ${cursor ? sql`AND t.created_at < ${cursor}` : sql``}
    ORDER BY t.created_at DESC
    LIMIT ${limit + 1}
  `;

  const hasMore = rows.length > limit;
  const slice = rows.slice(0, limit);

  const templates = await Promise.all(slice.map(async (t) => {
    const coverUrl = t.cover_storage_path
      ? r2ProxyUrl(t.cover_bucket ?? "template-images", t.cover_storage_path as string)
      : null;

    const avatarUrl = t.c_avatar_path
      ? r2ProxyUrl(t.c_avatar_bucket ?? "template-images", t.c_avatar_path as string)
      : null;

    return {
      id: t.id,
      creatorId: t.creator_id,
      creator: t.c_id ? { id: t.c_id, displayName: t.c_display_name, avatarUrl } : null,
      title: t.title,
      description: t.description,
      category: t.category,
      tags: t.tags ?? [],
      priceNgn: t.price_ngn,
      shootMode: t.shoot_mode,
      aspectRatio: t.aspect_ratio,
      packageSize: t.package_size,
      purchaseCount: t.purchase_count,
      avgRating: t.avg_rating ?? null,
      ratingCount: t.rating_count ?? 0,
      isStory: t.is_story ?? false,
      storyType: t.story_type ?? null,
      coverUrl,
      createdAt: t.created_at,
    };
  }));

  const nextCursor = hasMore ? slice[slice.length - 1]?.created_at : null;
  const payload = { templates, nextCursor };
  marketplaceCache.set(cacheKey, { payload, expiry: Date.now() + CACHE_TTL_MS });
  return NextResponse.json(payload);
}
