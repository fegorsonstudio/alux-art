import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();

  // Deduplicated by storage_path, most recent first, up to 20
  const { data: refs } = await service
    .from("shoot_references")
    .select("id, name, storage_path, storage_bucket, created_at")
    .eq("user_id", user.id)
    .eq("purpose", "identity")
    .order("created_at", { ascending: false })
    .limit(60);

  if (!refs || refs.length === 0) return NextResponse.json({ refs: [] });

  // Deduplicate by storage_path (keep most recent)
  const seen = new Set<string>();
  const deduped = refs.filter(r => {
    if (seen.has(r.storage_path)) return false;
    seen.add(r.storage_path);
    return true;
  }).slice(0, 20);

  // Sign URLs
  const signed = await Promise.all(
    deduped.map(async (ref) => {
      const { data } = await service.storage
        .from(ref.storage_bucket)
        .createSignedUrl(ref.storage_path, 3600);
      return {
        id: ref.id,
        name: ref.name,
        storagePath: ref.storage_path,
        storageBucket: ref.storage_bucket,
        url: data?.signedUrl ?? null,
      };
    })
  );

  return NextResponse.json({ refs: signed.filter(r => r.url !== null) });
}
