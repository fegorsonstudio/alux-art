import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { createHmac } from "crypto";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature") ?? "";
  const secret = process.env.PAYSTACK_SECRET_KEY ?? "";

  const hash = createHmac("sha512", secret).update(rawBody).digest("hex");
  if (hash !== signature) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(rawBody);
  if (event.event !== "charge.success") {
    return NextResponse.json({ ok: true });
  }

  const { metadata, reference, amount, currency } = event.data;
  const service = createServiceClient();
  const now = new Date().toISOString();

  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("host") ?? "";

  // ── Template purchase fulfillment ──────────────────────────────────────────
  if (metadata?.type === "template_purchase") {
    const { purchase_id, template_id, user_id, coupon_id } = metadata as Record<string, string>;
    if (!purchase_id) return NextResponse.json({ ok: true });

    // Dedup
    const { data: existingPurchase } = await service
      .from("template_purchases")
      .select("id, status")
      .eq("id", purchase_id)
      .single();

    if (existingPurchase?.status === "success") {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    // Fetch template for shoot config
    const { data: template } = await service
      .from("templates")
      .select("id, shoot_mode, aspect_ratio, package_size, title, template_images(*)")
      .eq("id", template_id)
      .single();

    if (!template) {
      await service.from("template_purchases").update({ status: "failed" }).eq("id", purchase_id);
      return NextResponse.json({ ok: true });
    }

    // Get user email
    const { data: { user } } = await service.auth.admin.getUserById(user_id);
    const ownerEmail = user?.email ?? "";

    // Create shoot
    const shootId = crypto.randomUUID();
    const packageSize = template.package_size ?? 10;

    await service.from("shoots").insert({
      id: shootId,
      user_id,
      owner_email: ownerEmail,
      mode: template.shoot_mode ?? "advanced",
      aspect_ratio: template.aspect_ratio ?? "4:5",
      currency: "NGN",
      package_size: packageSize,
      status: "QUEUED",
      progress: 0,
      quote: { text: "", attribution: "" },
      identity_profile: "",
      created_at: now,
      updated_at: now,
    });

    // Create image slots
    const slots = Array.from({ length: packageSize }, (_, i) => ({
      id: crypto.randomUUID(),
      shoot_id: shootId,
      user_id,
      slot: i + 1,
      kind: i < 8 ? "portrait" : i === 8 ? "mood" : "quote",
      status: "PENDING",
      created_at: now,
      updated_at: now,
    }));
    await service.from("shoot_images").insert(slots);

    // Copy template images → shoot_references
    const templateImages = (template.template_images ?? []) as Array<{
      storage_path: string;
      storage_bucket: string;
      purpose: string;
      tag?: string;
    }>;

    if (templateImages.length > 0) {
      const refs = templateImages.map((img, i) => ({
        id: crypto.randomUUID(),
        shoot_id: shootId,
        user_id,
        purpose: img.purpose,
        tag: img.tag ?? null,
        custom_name: null,
        note: null,
        name: `template-image-${i + 1}`,
        type: "image/jpeg",
        size: 1,
        storage_bucket: img.storage_bucket,
        storage_path: img.storage_path,
        created_at: now,
      }));
      await service.from("shoot_references").insert(refs);
    }

    // Mark purchase success
    await service.from("template_purchases").update({
      status: "success",
      shoot_id: shootId,
    }).eq("id", purchase_id);

    // Increment purchase_count
    const { data: tRow } = await service
      .from("templates").select("purchase_count").eq("id", template_id).single();
    if (tRow) {
      await service.from("templates")
        .update({ purchase_count: (tRow.purchase_count ?? 0) + 1 })
        .eq("id", template_id);
    }

    // Increment coupon use_count
    if (coupon_id) {
      const { data: c } = await service.from("coupons").select("use_count").eq("id", coupon_id).single();
      if (c) {
        await service.from("coupons").update({ use_count: c.use_count + 1 }).eq("id", coupon_id);
      }
    }

    // Fire shoot start
    fetch(`${proto}://${host}/api/shoots/${shootId}/start`, {
      method: "POST",
      headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "" },
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  }

  // ── Standard shoot payment ─────────────────────────────────────────────────
  const { shoot_id, user_id } = metadata ?? {};
  if (!shoot_id) return NextResponse.json({ ok: true });

  const { data: existingPayment } = await service
    .from("payments")
    .select("id, status, user_id, shoot_id")
    .eq("provider_reference", reference)
    .single();

  if (existingPayment?.status === "success") {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const { data: shoot } = await service
    .from("shoots")
    .select("id, user_id")
    .eq("id", shoot_id)
    .single();

  const ownerId = shoot?.user_id ?? user_id;

  await service.from("payments").update({
    status: "success",
    paid_at: now,
    metadata: event.data,
  }).eq("provider_reference", reference);

  await service.from("shoots").update({
    status: "QUEUED",
    updated_at: now,
  }).eq("id", shoot_id);

  await service.from("generation_events").insert({
    id: crypto.randomUUID(),
    shoot_id,
    user_id: ownerId,
    type: "payment_confirmed",
    payload: { reference, amount, currency },
    created_at: now,
  });

  fetch(`${proto}://${host}/api/shoots/${shoot_id}/start`, {
    method: "POST",
    headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "" },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
