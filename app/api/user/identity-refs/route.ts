import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { r2ProxyUrl, r2Delete, r2Exists } from "@/lib/r2";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const refs = await sql`
    SELECT id, name, storage_path, storage_bucket, created_at
    FROM shoot_references
    WHERE user_id = ${user.id} AND purpose = 'identity'
      AND storage_path LIKE ${user.id + "/%"}
    ORDER BY created_at DESC LIMIT 60
  `;

  if (refs.length === 0) return NextResponse.json({ refs: [] });

  const seen = new Set<string>();
  const deduped = refs.filter((r) => {
    if (seen.has(r.storage_path as string)) return false;
    seen.add(r.storage_path as string);
    return true;
  }).slice(0, 20);

  // These rows point at photographs from past shoots, and the 48-hour retention
  // cleanup deletes those files without deleting the rows. Four of eighteen were
  // already dead here: the picker rendered broken tiles, and — worse — a buyer
  // could select one and pay for a shoot whose source photograph no longer
  // exists. Drop anything that is no longer in storage.
  //
  // r2Exists reports false for any error, not just a missing object, so a
  // transient R2 hiccup can hide a good photo for one page load. That is the
  // better failure: a photo briefly absent from the picker beats a photo that
  // cannot generate after payment.
  const alive = await Promise.all(
    deduped.map(async (ref) =>
      (await r2Exists(ref.storage_bucket as string, ref.storage_path as string)) ? ref : null
    )
  );
  const present = alive.filter((r): r is NonNullable<typeof r> => r !== null);
  if (present.length !== deduped.length) {
    console.log(`[identity-refs] hid ${deduped.length - present.length} reference(s) whose files are gone`);
  }

  const signed = present.map((ref) => ({
    id: ref.id,
    name: ref.name,
    storagePath: ref.storage_path,
    storageBucket: ref.storage_bucket,
    url: r2ProxyUrl(ref.storage_bucket as string, ref.storage_path as string),
  }));

  return NextResponse.json({ refs: signed });
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
