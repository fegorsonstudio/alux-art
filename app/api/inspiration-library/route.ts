import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { r2SignedDownloadUrl } from "@/lib/r2";

export async function GET() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await sql`
    SELECT * FROM inspiration_images WHERE user_id = ${user.id} ORDER BY last_used_at DESC
  `;

  const signedImages = await Promise.all(data.map(async (img) => {
    const url = await r2SignedDownloadUrl(
      img.storage_bucket as string,
      img.storage_path as string,
      3600
    ).catch(() => null);
    return url ? { ...img, url } : null;
  }));

  return NextResponse.json({ images: signedImages.filter(Boolean) });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const imageId = searchParams.get("id");

  if (imageId) {
    await sql`DELETE FROM inspiration_images WHERE id = ${imageId} AND user_id = ${user.id}`;
  } else {
    await sql`DELETE FROM inspiration_images WHERE user_id = ${user.id}`;
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contentType = request.headers.get("content-type") ?? "";
  let imageId: string | null = null;
  let tag: string | null | undefined;
  let note: string | null | undefined;
  let isMeta = false;

  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    imageId = body.id ?? null;
    tag = body.tag ?? null;
    note = body.note ?? null;
    isMeta = true;
  } else {
    const form = await request.formData();
    imageId = form.get("id") as string | null;
  }

  if (!imageId) return NextResponse.json({ error: "Missing image id" }, { status: 400 });

  const updates: Record<string, unknown> = { last_used_at: new Date() };
  if (isMeta) {
    updates.tag = tag ?? null;
    updates.note = note ?? null;
  }

  await sql`UPDATE inspiration_images SET ${sql(updates)} WHERE id = ${imageId} AND user_id = ${user.id}`;
  return NextResponse.json({ ok: true });
}
