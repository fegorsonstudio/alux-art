import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

export async function GET() {
  const service = createServiceClient();
  const { data, error } = await service
    .from("creators")
    .select("id, display_name, bio, avatar_storage_path, avatar_bucket, instagram_url, website_url, created_at")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Failed to load creators" }, { status: 500 });

  const creators = await Promise.all((data ?? []).map(async (c) => {
    let avatarUrl: string | null = null;
    if (c.avatar_storage_path) {
      const { data: s } = await service.storage
        .from(c.avatar_bucket ?? "template-images")
        .createSignedUrl(c.avatar_storage_path, 3600);
      avatarUrl = s?.signedUrl ?? null;
    }
    return {
      id: c.id,
      displayName: c.display_name,
      bio: c.bio,
      avatarUrl,
      instagramUrl: c.instagram_url,
      websiteUrl: c.website_url,
      createdAt: c.created_at,
    };
  }));

  return NextResponse.json({ creators });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();

  const { data: existing } = await service
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (existing) return NextResponse.json({ error: "Creator profile already exists" }, { status: 409 });

  const body = await request.json() as Record<string, unknown>;
  const { displayName, bio, avatarStoragePath, instagramUrl, websiteUrl, bankName, accountNumber, accountName } = body;

  if (typeof displayName !== "string" || displayName.trim().length < 2) {
    return NextResponse.json({ error: "Display name is required (min 2 characters)" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data: creator, error } = await service.from("creators").insert({
    user_id: user.id,
    display_name: displayName.trim(),
    bio: typeof bio === "string" ? bio.trim() : null,
    avatar_storage_path: typeof avatarStoragePath === "string" ? avatarStoragePath : null,
    instagram_url: typeof instagramUrl === "string" ? instagramUrl.trim() : null,
    website_url: typeof websiteUrl === "string" ? websiteUrl.trim() : null,
    bank_name: typeof bankName === "string" ? bankName.trim() : null,
    account_number: typeof accountNumber === "string" ? accountNumber.trim() : null,
    account_name: typeof accountName === "string" ? accountName.trim() : null,
    created_at: now,
    updated_at: now,
  }).select().single();

  if (error) return NextResponse.json({ error: "Failed to create creator profile" }, { status: 500 });
  return NextResponse.json({ creator }, { status: 201 });
}
