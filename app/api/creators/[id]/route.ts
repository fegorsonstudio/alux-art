import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { r2SignedDownloadUrl } from "@/lib/r2";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [creator] = await sql`SELECT * FROM creators WHERE id = ${id} AND is_active = true`;
  if (!creator) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let avatarUrl: string | null = null;
  if (creator.avatar_storage_path) {
    avatarUrl = await r2SignedDownloadUrl(
      (creator.avatar_bucket ?? "template-images") as string,
      creator.avatar_storage_path as string,
      3600
    ).catch(() => null);
  }

  const templates = await sql`
    SELECT id, title, category, price_ngn, purchase_count, cover_storage_path, cover_bucket, created_at
    FROM templates WHERE creator_id = ${id} AND status = 'published' ORDER BY created_at DESC
  `;

  const templatesWithUrls = await Promise.all(templates.map(async (t) => {
    let coverUrl: string | null = null;
    if (t.cover_storage_path) {
      coverUrl = await r2SignedDownloadUrl(
        (t.cover_bucket ?? "template-images") as string,
        t.cover_storage_path as string,
        3600
      ).catch(() => null);
    }
    return { id: t.id, title: t.title, category: t.category, priceNgn: t.price_ngn, purchaseCount: t.purchase_count, coverUrl, createdAt: t.created_at };
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
