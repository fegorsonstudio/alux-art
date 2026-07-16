import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { r2ProxyUrl } from "@/lib/r2";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const isUuid = UUID_RE.test(id);
  const [creator] = isUuid
    ? await sql`SELECT id, username, display_name, bio, avatar_storage_path, avatar_bucket, instagram_url, website_url, created_at, theme, font_family FROM creators WHERE id = ${id} AND is_active = true`
    : await sql`SELECT id, username, display_name, bio, avatar_storage_path, avatar_bucket, instagram_url, website_url, created_at, theme, font_family FROM creators WHERE LOWER(username) = LOWER(${id}) AND is_active = true`;

  if (!creator) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const avatarUrl = creator.avatar_storage_path
    ? r2ProxyUrl(creator.avatar_bucket ?? "template-images", creator.avatar_storage_path as string)
    : null;

  const templates = await sql`
    SELECT id, title, category, price_ngn, purchase_count, cover_storage_path, cover_bucket, created_at
    FROM templates WHERE creator_id = ${creator.id} AND status = 'published' AND is_private = false ORDER BY created_at DESC
  `;

  const templatesWithUrls = templates.map((t) => ({
    id: t.id, title: t.title, category: t.category, priceNgn: t.price_ngn,
    purchaseCount: t.purchase_count, createdAt: t.created_at,
    coverUrl: t.cover_storage_path
      ? r2ProxyUrl(t.cover_bucket ?? "template-images", t.cover_storage_path as string)
      : null,
  }));

  return NextResponse.json({
    creator: {
      id: creator.id,
      username: creator.username ?? null,
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
