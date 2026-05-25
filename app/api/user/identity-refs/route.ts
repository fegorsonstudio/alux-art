import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { r2SignedDownloadUrl, r2Delete } from "@/lib/r2";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const refs = await sql`
    SELECT id, name, storage_path, storage_bucket, created_at
    FROM shoot_references
    WHERE user_id = ${user.id} AND purpose = 'identity'
    ORDER BY created_at DESC LIMIT 60
  `;

  if (refs.length === 0) return NextResponse.json({ refs: [] });

  const seen = new Set<string>();
  const deduped = refs.filter((r) => {
    if (seen.has(r.storage_path as string)) return false;
    seen.add(r.storage_path as string);
    return true;
  }).slice(0, 20);

  const signed = await Promise.all(deduped.map(async (ref) => {
    const url = await r2SignedDownloadUrl(
      ref.storage_bucket as string,
      ref.storage_path as string,
      3600
    ).catch(() => null);
    return { id: ref.id, name: ref.name, storagePath: ref.storage_path, storageBucket: ref.storage_bucket, url };
  }));

  return NextResponse.json({ refs: signed.filter((r) => r.url !== null) });
}

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const refs = await sql`
    SELECT id, storage_path, storage_bucket FROM shoot_references
    WHERE user_id = ${user.id} AND purpose = 'identity'
  `;

  if (refs.length > 0) {
    const byBucket = new Map<string, string[]>();
    for (const ref of refs) {
      const bucket = ref.storage_bucket as string;
      if (!byBucket.has(bucket)) byBucket.set(bucket, []);
      byBucket.get(bucket)!.push(ref.storage_path as string);
    }
    for (const [bucket, paths] of byBucket) {
      await r2Delete(bucket, [...new Set(paths)]).catch(() => {});
    }

    await sql`DELETE FROM shoot_references WHERE user_id = ${user.id} AND purpose = 'identity'`;
  }

  return NextResponse.json({ deleted: refs.length });
}
