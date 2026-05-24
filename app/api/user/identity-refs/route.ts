import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import { r2SignedDownloadUrl, r2Delete } from "@/lib/r2";


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

  const signed = await Promise.all(
    deduped.map(async (ref) => {
      const url = await r2SignedDownloadUrl(ref.storage_bucket, ref.storage_path, 3600).catch(() => null);
      return {
        id: ref.id,
        name: ref.name,
        storagePath: ref.storage_path,
        storageBucket: ref.storage_bucket,
        url,
      };
    })
  );

  return NextResponse.json({ refs: signed.filter(r => r.url !== null) });
}

export async function DELETE() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();

  // Fetch all identity refs for this user to get unique storage paths
  const { data: refs } = await service
    .from("shoot_references")
    .select("id, storage_path, storage_bucket")
    .eq("user_id", user.id)
    .eq("purpose", "identity");

  if (refs && refs.length > 0) {
    // Delete storage objects grouped by bucket
    const byBucket = new Map<string, string[]>();
    for (const ref of refs) {
      if (!byBucket.has(ref.storage_bucket)) byBucket.set(ref.storage_bucket, []);
      byBucket.get(ref.storage_bucket)!.push(ref.storage_path);
    }
    for (const [bucket, paths] of byBucket) {
      const unique = [...new Set(paths)];
      await r2Delete(bucket, unique).catch(() => {});
    }

    // Delete all identity ref rows for this user
    await service
      .from("shoot_references")
      .delete()
      .eq("user_id", user.id)
      .eq("purpose", "identity");
  }

  return NextResponse.json({ deleted: refs?.length ?? 0 });
}
