import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to claim your gift" }, { status: 401 });

  const { token } = await params;

  const [gift] = await sql`
    SELECT g.id, g.template_id, g.package_size, g.payment_status,
           g.is_claimed, g.expires_at, g.sender_name,
           t.shoot_mode, t.aspect_ratio
    FROM gift_links g
    JOIN templates t ON t.id = g.template_id
    WHERE g.id = ${token}
  `;

  if (!gift) return NextResponse.json({ error: "Gift not found" }, { status: 404 });
  if (gift.payment_status !== "paid") return NextResponse.json({ error: "Gift payment not yet confirmed" }, { status: 409 });
  if (gift.is_claimed) return NextResponse.json({ error: "This gift has already been claimed" }, { status: 409 });
  if (new Date(gift.expires_at as string) < new Date()) {
    return NextResponse.json({ error: "This gift link has expired" }, { status: 410 });
  }

  // Check identity images
  const identityImages = await sql`
    SELECT id, name, type, size, storage_bucket, storage_path
    FROM identity_images
    WHERE user_id = ${user.id}
    ORDER BY created_at DESC
    LIMIT 10
  `;

  if (identityImages.length === 0) {
    return NextResponse.json({ needsIdentityImages: true });
  }

  // Fetch template images for shoot references
  const templateImages = await sql`
    SELECT storage_path, storage_bucket, tag, purpose, note, custom_name
    FROM template_images WHERE template_id = ${gift.template_id}
  `;

  const now = new Date();
  const shootId = crypto.randomUUID();
  const packageSize = gift.package_size as number;

  // Create shoot
  await sql`
    INSERT INTO shoots
      (id, user_id, owner_email, mode, aspect_ratio, currency, package_size, status,
       progress, quote, identity_profile, created_at, updated_at)
    VALUES (
      ${shootId}, ${user.id}, ${user.email ?? ""},
      ${gift.shoot_mode ?? "advanced"}, ${gift.aspect_ratio ?? "4:5"},
      'NGN', ${packageSize}, 'QUEUED', 0,
      ${JSON.stringify({ text: "", attribution: "" })}::jsonb,
      '', ${now}, ${now}
    )
  `;

  // Create image slots
  const slots = Array.from({ length: packageSize }, (_, i) => ({
    id: crypto.randomUUID(),
    shoot_id: shootId,
    user_id: user.id,
    slot: i + 1,
    kind: i < 8 ? "portrait" : i === 8 ? "mood" : "quote",
    status: "PENDING",
    created_at: now,
    updated_at: now,
  }));
  await sql`INSERT INTO shoot_images ${sql(slots)}`;

  // Create shoot references from identity images + template references
  const refs = [
    ...identityImages.map((img: Record<string, unknown>, i: number) => ({
      id: crypto.randomUUID(), shoot_id: shootId, user_id: user.id,
      purpose: "identity", tag: null, custom_name: null, note: null,
      name: (img.name as string) ?? `identity-${i + 1}`,
      type: (img.type as string) ?? "image/jpeg",
      size: (img.size as number) ?? 1,
      storage_bucket: img.storage_bucket as string,
      storage_path: img.storage_path as string,
      created_at: now,
    })),
    ...(templateImages as Record<string, unknown>[])
      .filter(img => img.purpose !== "showcase")
      .map((img, i) => ({
        id: crypto.randomUUID(), shoot_id: shootId, user_id: user.id,
        purpose: img.purpose as string, tag: img.tag as string | null,
        custom_name: img.custom_name as string | null, note: img.note as string | null,
        name: `template-ref-${i + 1}`, type: "image/jpeg", size: 1,
        storage_bucket: (img.storage_bucket as string) ?? "template-images",
        storage_path: img.storage_path as string,
        created_at: now,
      })),
  ];
  if (refs.length) await sql`INSERT INTO shoot_references ${sql(refs)}`;

  // Mark gift as claimed
  await sql`
    UPDATE gift_links SET
      is_claimed = true,
      claimed_by_user_id = ${user.id},
      claimed_at = ${now},
      shoot_id = ${shootId}
    WHERE id = ${token}
  `;

  // Trigger generation
  fetch(`${SITE_URL}/api/shoots/${shootId}/start`, {
    method: "POST",
    headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "" },
  }).catch(() => {});

  return NextResponse.json({ shootId, redirect: `/studio?shoot=${shootId}` });
}
