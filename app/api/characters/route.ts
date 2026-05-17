import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import { signBasePath } from "@/lib/base-lock";

// GET /api/characters — list user's saved character bases
export async function GET() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data, error } = await service
    .from("character_bases")
    .select("*")
    .eq("user_id", user.id)
    .in("status", ["AUTO_APPROVED", "USER_APPROVED"])
    .eq("is_archived", false)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sign base URLs for thumbnails
  const characters = await Promise.all((data ?? []).map(async (base) => {
    const storagePath = base.base_4k_storage_path ?? base.base_storage_path;
    let baseUrl: string | null = null;
    if (storagePath) {
      baseUrl = await signBasePath(service, storagePath, 3600).catch(() => null);
    }
    return { ...base, base_url: baseUrl };
  }));

  return NextResponse.json({ characters });
}
