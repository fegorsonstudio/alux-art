import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

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

  const service = createServiceClient();

  // Verify creator owns this template
  const { data: creator } = await service
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });

  const { data: template } = await service
    .from("templates")
    .select("id, shoot_mode, aspect_ratio, package_size, template_images(*)")
    .eq("id", templateId)
    .eq("creator_id", creator.id)
    .single();

  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  // Validate identity refs belong to this user
  for (const ref of identityRefs) {
    if (typeof ref.storagePath !== "string" || !ref.storagePath.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: "Invalid identity image reference" }, { status: 400 });
    }
  }

  const now = new Date().toISOString();
  const shootId = crypto.randomUUID();
  const packageSize = imageCount as 1 | 5 | 10;
  const amountNgn = imageCount * PRICE_PER_IMAGE_NGN;

  // Create shoot in PENDING_PAYMENT
  const { error: shootErr } = await service.from("shoots").insert({
    id: shootId,
    user_id: user.id,
    owner_email: user.email,
    mode: template.shoot_mode ?? "advanced",
    aspect_ratio: template.aspect_ratio ?? "4:5",
    currency: "NGN",
    package_size: packageSize,
    status: "PENDING_PAYMENT",
    progress: 0,
    quote: { text: "", attribution: "" },
    identity_profile: shotType ? JSON.stringify({ shot_type: shotType }) : "",
    template_showcase_id: templateId,
    created_at: now,
    updated_at: now,
  });

  if (shootErr) return NextResponse.json({ error: shootErr.message }, { status: 500 });

  // Insert image slots
  const slots = Array.from({ length: imageCount }, (_, i) => ({
    id: crypto.randomUUID(),
    shoot_id: shootId,
    user_id: user.id,
    slot: i + 1,
    kind: "portrait",
    status: "PENDING",
    created_at: now,
    updated_at: now,
  }));
  await service.from("shoot_images").insert(slots);

  // Insert identity refs
  const identityRows = identityRefs.map((ref, i) => ({
    id: crypto.randomUUID(),
    shoot_id: shootId,
    user_id: user.id,
    purpose: "identity",
    tag: null,
    custom_name: null,
    note: null,
    name: ref.name ?? `identity-${i + 1}`,
    type: ref.type ?? "image/jpeg",
    size: ref.size ?? 1,
    storage_bucket: ref.storageBucket,
    storage_path: ref.storagePath,
    created_at: now,
  }));

  // Insert template tagged/inspiration refs
  const templateImages = (template.template_images ?? []) as Array<{
    storage_path: string;
    storage_bucket: string;
    purpose: string;
    tag?: string;
  }>;

  const templateRows = templateImages.map((img, i) => ({
    id: crypto.randomUUID(),
    shoot_id: shootId,
    user_id: user.id,
    purpose: img.purpose,
    tag: img.tag ?? null,
    custom_name: null,
    note: null,
    name: `template-ref-${i + 1}`,
    type: "image/jpeg",
    size: 1,
    storage_bucket: img.storage_bucket,
    storage_path: img.storage_path,
    created_at: now,
  }));

  await service.from("shoot_references").insert([...identityRows, ...templateRows]);

  // Initiate Paystack charge
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
    await service.from("shoot_references").delete().eq("shoot_id", shootId);
    await service.from("shoot_images").delete().eq("shoot_id", shootId);
    await service.from("shoots").delete().eq("id", shootId);
    return NextResponse.json({ error: "Payment initialization failed" }, { status: 502 });
  }

  await service.from("shoots").update({
    updated_at: now,
  }).eq("id", shootId);

  return NextResponse.json({
    authorizationUrl: paystackData.data.authorization_url,
    shootId,
    amountNgn,
  });
}
