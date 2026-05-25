import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { r2ProxyUrl } from "@/lib/r2";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [creator] = await sql`SELECT * FROM creators WHERE id = ${id} AND is_active = true`;
  if (!creator) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const avatarUrl = creator.avatar_storage_path
    ? r2ProxyUrl(creator.avatar_bucket ?? "template-images", creator.avatar_storage_path as string)
    : null;

  const templates = await sql`
    SELECT id, title, category, price_ngn, purchase_count, cover_storage_path, cover_bucket, created_at
    FROM templates WHERE creator_id = ${id} AND status = 'published' ORDER BY created_at DESC
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
