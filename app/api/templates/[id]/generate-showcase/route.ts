import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";

const PRICE_PER_IMAGE_NGN = 1000;
const ALLOWED_COUNTS = new Set([1, 5, 10]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: templateId } = await params;
  const body = await request.json().catch(() => ({})) as {
    imageCount?: number;
    shotType?: string;
    identityRefs?: Array<{ name: string; type: string; size: number; storageBucket: string; storagePath: string }>;
  };

  const imageCount = Number(body.imageCount ?? 5);
  if (!ALLOWED_COUNTS.has(imageCount)) {
    return NextResponse.json({ error: "imageCount must be 1, 5, or 10" }, { status: 400 });
  }

  const VALID_SHOT_TYPES = new Set(["headshot", "close_up", "medium", "full_body"]);
  const shotType = imageCount === 1 ? (body.shotType ?? "headshot") : undefined;
  if (shotType && !VALID_SHOT_TYPES.has(shotType)) {
    return NextResponse.json({ error: "Invalid shot type" }, { status: 400 });
  }

  const identityRefs = body.identityRefs ?? [];
  if (!Array.isArray(identityRefs) || identityRefs.length === 0) {
    return NextResponse.json({ error: "At least 1 identity photo is required" }, { status: 400 });
  }

  const [creator] = await sql`SELECT id FROM creators WHERE user_id = ${user.id}`;
  if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });

  const [template] = await sql`
    SELECT id, shoot_mode, aspect_ratio, package_size FROM templates
    WHERE id = ${templateId} AND creator_id = ${creator.id}
  `;
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const templateImages = await sql`
    SELECT storage_path, storage_bucket, purpose, tag FROM template_images WHERE template_id = ${templateId}
  `;

  for (const ref of identityRefs) {
    if (typeof ref.storagePath !== "string" || !ref.storagePath.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: "Invalid identity image reference" }, { status: 400 });
    }
  }

  const now = new Date();
  const shootId = crypto.randomUUID();
  const packageSize = imageCount as 1 | 5 | 10;
  const amountNgn = imageCount * PRICE_PER_IMAGE_NGN;

  const [shootRow] = await sql`
    INSERT INTO shoots
      (id, user_id, owner_email, mode, aspect_ratio, currency, package_size, status,
       progress, quote, identity_profile, template_showcase_id, created_at, updated_at)
    VALUES (
      ${shootId}, ${user.id}, ${user.email ?? ''}, ${template.shoot_mode ?? "advanced"},
      ${template.aspect_ratio ?? "4:5"}, 'NGN', ${packageSize}, 'PENDING_PAYMENT',
      0, ${JSON.stringify({ text: "", attribution: "" })}::jsonb,
      ${shotType ? JSON.stringify({ shot_type: shotType }) : ""},
      ${templateId}, ${now}, ${now}
    )
    RETURNING id
  `.catch((err) => { console.error("[generate-showcase] shoot insert:", err); return [null]; });

  if (!shootRow) return NextResponse.json({ error: "Failed to create shoot" }, { status: 500 });

  const slots = Array.from({ length: imageCount }, (_, i) => ({
    id: crypto.randomUUID(), shoot_id: shootId, user_id: user.id,
    slot: i + 1, kind: "portrait", status: "PENDING", created_at: now, updated_at: now,
  }));
  await sql`INSERT INTO shoot_images ${sql(slots)}`;

  const allRefs = [
    ...identityRefs.map((ref, i) => ({
      id: crypto.randomUUID(), shoot_id: shootId, user_id: user.id, purpose: "identity",
      tag: null, custom_name: null, note: null, name: ref.name ?? `identity-${i + 1}`,
      type: ref.type ?? "image/jpeg", size: ref.size ?? 1,
      storage_bucket: ref.storageBucket, storage_path: ref.storagePath, created_at: now,
    })),
    ...templateImages.map((img, i) => ({
      id: crypto.randomUUID(), shoot_id: shootId, user_id: user.id, purpose: img.purpose,
      tag: img.tag ?? null, custom_name: null, note: null, name: `template-ref-${i + 1}`,
      type: "image/jpeg", size: 1, storage_bucket: img.storage_bucket,
      storage_path: img.storage_path, created_at: now,
    })),
  ];
  await sql`INSERT INTO shoot_references ${sql(allRefs)}`;

  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("host") ?? "";
  const callbackUrl = `${proto}://${host}/creator-dashboard?showcase_paid=1&shoot_id=${shootId}`;

  const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: user.email,
      amount: amountNgn * 100,
      callback_url: callbackUrl,
      metadata: {
        type: "creator_showcase",
        shoot_id: shootId,
        template_id: templateId,
        user_id: user.id,
        image_count: imageCount,
      },
    }),
  });

  const paystackData = await paystackRes.json();
  if (!paystackData.status) {
    await sql`DELETE FROM shoot_references WHERE shoot_id = ${shootId}`;
    await sql`DELETE FROM shoot_images WHERE shoot_id = ${shootId}`;
    await sql`DELETE FROM shoots WHERE id = ${shootId}`;
    return NextResponse.json({ error: "Payment initialization failed" }, { status: 502 });
  }

  return NextResponse.json({ authorizationUrl: paystackData.data.authorization_url, shootId, amountNgn });
}
