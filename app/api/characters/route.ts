import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { signBasePath } from "@/lib/base-lock";

export async function GET() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await sql`
    SELECT * FROM character_bases
    WHERE user_id = ${user.id}
      AND status = ANY(${["AUTO_APPROVED", "USER_APPROVED"]})
      AND is_archived = false
    ORDER BY created_at DESC LIMIT 50
  `;

  const characters = await Promise.all(data.map(async (base) => {
    const storagePath = (base.base_4k_storage_path ?? base.base_storage_path) as string | null;
    let baseUrl: string | null = null;
    if (storagePath) {
      baseUrl = await signBasePath(null as never, storagePath, 3600).catch(() => null);
    }
    return { ...base, base_url: baseUrl };
  }));

  return NextResponse.json({ characters });
}
