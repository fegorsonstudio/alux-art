import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { r2ProxyUrl } from "@/lib/r2";

export async function GET() {
  const rows = await sql`
    SELECT id, display_name, bio, avatar_storage_path, avatar_bucket, instagram_url, website_url, created_at
    FROM creators WHERE is_active = true ORDER BY created_at DESC
  `;

  const creators = rows.map((c) => {
    const avatarUrl = c.avatar_storage_path
      ? r2ProxyUrl((c.avatar_bucket ?? "template-images") as string, c.avatar_storage_path as string)
      : null;
    return { id: c.id, displayName: c.display_name, bio: c.bio, avatarUrl, instagramUrl: c.instagram_url, websiteUrl: c.website_url, createdAt: c.created_at };
  });

  return NextResponse.json({ creators });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [existing] = await sql`SELECT id FROM creators WHERE user_id = ${user.id}`;
  if (existing) return NextResponse.json({ error: "Creator profile already exists" }, { status: 409 });

  const body = await request.json() as Record<string, unknown>;
  const { displayName, bio, avatarStoragePath, instagramUrl, websiteUrl, bankName, accountNumber, accountName } = body;

  if (typeof displayName !== "string" || displayName.trim().length < 2) {
    return NextResponse.json({ error: "Display name is required (min 2 characters)" }, { status: 400 });
  }

  const [creator] = await sql`
    INSERT INTO creators
      (user_id, display_name, bio, avatar_storage_path, instagram_url, website_url,
       bank_name, account_number, account_name, is_active, status, created_at, updated_at)
    VALUES (
      ${user.id}, ${displayName.trim()},
      ${typeof bio === "string" ? bio.trim() : null},
      ${typeof avatarStoragePath === "string" ? avatarStoragePath : null},
      ${typeof instagramUrl === "string" ? instagramUrl.trim() : null},
      ${typeof websiteUrl === "string" ? websiteUrl.trim() : null},
      ${typeof bankName === "string" ? bankName.trim() : null},
      ${typeof accountNumber === "string" ? accountNumber.trim() : null},
      ${typeof accountName === "string" ? accountName.trim() : null},
      false, 'pending', NOW(), NOW()
    )
    RETURNING *
  `.catch((err) => { console.error("[creators POST]", err); return [null]; });

  if (!creator) return NextResponse.json({ error: "Failed to create creator profile" }, { status: 500 });
  return NextResponse.json({ creator }, { status: 201 });
}
