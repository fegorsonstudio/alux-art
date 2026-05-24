import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { r2SignedDownloadUrl, r2Upload } from "@/lib/r2";
import sql from "@/lib/db";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: shootId } = await params;

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [creator] = await sql`SELECT id FROM creators WHERE user_id = ${user.id}`;
  if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });

  const [shoot] = await sql`
    SELECT * FROM shoots WHERE id = ${shootId} AND user_id = ${user.id}
  `;
  if (!shoot) return NextResponse.json({ error: "Shoot not found" }, { status: 404 });
  if (shoot.status !== "COMPLETE") {
    return NextResponse.json({ error: "Shoot must be complete before turning into a template" }, { status: 422 });
  }

  const refs = await sql`SELECT * FROM shoot_references WHERE shoot_id = ${shootId}`;

  const now = new Date().toISOString();

  const [template] = await sql`
    INSERT INTO templates (
      creator_id, title, description, category, tags, shoot_mode, aspect_ratio,
      package_size, price_ngn, status, cover_storage_path, cover_bucket, created_at, updated_at
    ) VALUES (
      ${creator.id}, 'Untitled Template', '', 'portrait', '[]',
      ${shoot.mode ?? "advanced"}, ${shoot.aspect_ratio ?? "4:5"},
      ${shoot.package_size ?? 10}, 0, 'draft',
      null, 'template-images', ${now}, ${now}
    ) RETURNING *
  `;

  if (!template) {
    return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
  }

  type RefRow = {
    purpose: string; tag: string | null; custom_name: string | null;
    note: string | null; type: string | null; storage_bucket: string; storage_path: string;
  };

  const nonIdentityRefs = (refs as unknown as RefRow[]).filter(r => r.purpose !== "identity");
  let firstInspirationPath: string | null = null;

  for (let i = 0; i < nonIdentityRefs.length; i++) {
    const ref = nonIdentityRefs[i];

    const signedUrl = await r2SignedDownloadUrl(ref.storage_bucket, ref.storage_path, 60).catch(() => null);
    if (!signedUrl) continue;

    const imgRes = await fetch(signedUrl);
    if (!imgRes.ok) continue;
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const contentType = ref.type ?? "image/jpeg";
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";

    const destPath = `${user.id}/${template.id}/${crypto.randomUUID()}.${ext}`;
    try {
      await r2Upload("template-images", destPath, buffer, contentType);
    } catch {
      continue;
    }

    await sql`
      INSERT INTO template_images (
        template_id, storage_path, storage_bucket, display_order,
        purpose, tag, custom_name, note, created_at
      ) VALUES (
        ${template.id}, ${destPath}, 'template-images', ${i},
        ${ref.purpose}, ${ref.purpose === "tagged" ? (ref.tag ?? null) : null},
        ${ref.custom_name ?? null}, ${ref.note ?? null}, ${now}
      )
    `.catch((err) => console.error("[to-template] template_images insert error:", err.message));

    if (i === 0 && ref.purpose === "inspiration" && !firstInspirationPath) {
      firstInspirationPath = destPath;
    }
  }

  if (firstInspirationPath) {
    await sql`
      UPDATE templates SET cover_storage_path = ${firstInspirationPath}, updated_at = ${now}
      WHERE id = ${template.id}
    `;
  }

  return NextResponse.json({ templateId: template.id }, { status: 201 });
}
