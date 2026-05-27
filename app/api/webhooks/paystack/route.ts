import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import sql from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature") ?? "";
  const secret = process.env.PAYSTACK_SECRET_KEY;

  if (!secret) {
    console.error("[paystack webhook] PAYSTACK_SECRET_KEY is not set — rejecting all events");
    return NextResponse.json({ error: "Webhook misconfigured" }, { status: 500 });
  }

  const hash = createHmac("sha512", secret).update(rawBody).digest("hex");
  const sigOk = signature.length === hash.length &&
    timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  if (!sigOk) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(rawBody);
  if (event.event !== "charge.success") {
    return NextResponse.json({ ok: true });
  }

  const { metadata, reference, amount, currency } = event.data;
  const now = new Date().toISOString();

  // ── Creator showcase generation ─────────────────────────────────────────
  if (metadata?.type === "creator_showcase") {
    const { shoot_id: showcaseShootId, user_id } = metadata as Record<string, string>;
    if (!showcaseShootId) return NextResponse.json({ ok: true });

    const activated = await sql`
      UPDATE shoots SET status = 'QUEUED', updated_at = ${now}
      WHERE id = ${showcaseShootId} AND status = 'PENDING_PAYMENT'
      RETURNING id
    `;
    if (!activated.length) return NextResponse.json({ ok: true, duplicate: true });

    await sql`
      INSERT INTO payments (id, user_id, shoot_id, provider, provider_reference, amount_ngn, status, paid_at, metadata, created_at)
      VALUES (
        ${crypto.randomUUID()}, ${user_id}, ${showcaseShootId}, 'paystack',
        ${reference}, ${Math.round(amount / 100)}, 'success', ${now}, ${JSON.stringify(event.data)}, ${now}
      )
    `;

    fetch(`${SITE_URL}/api/shoots/${showcaseShootId}/start`, {
      method: "POST",
      headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "" },
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  }

  // ── Template purchase fulfillment ────────────────────────────────────────
  if (metadata?.type === "template_purchase") {
    const { purchase_id, template_id, shoot_id: existingShootId, user_id, coupon_id } = metadata as Record<string, string>;
    if (!purchase_id) return NextResponse.json({ ok: true });

    // New booking flow: shoot already created with refs — just queue it
    if (existingShootId) {
      const locked = await sql`
        UPDATE template_purchases SET status = 'success', shoot_id = ${existingShootId}
        WHERE id = ${purchase_id} AND status != 'success'
        RETURNING id
      `;
      if (!locked.length) return NextResponse.json({ ok: true, duplicate: true });

      await sql`
        UPDATE shoots SET status = 'QUEUED', updated_at = ${now}
        WHERE id = ${existingShootId} AND status = 'PENDING_PAYMENT'
      `;
      await sql`UPDATE templates SET purchase_count = purchase_count + 1 WHERE id = ${template_id}`;
      if (coupon_id) {
        await sql`UPDATE coupons SET use_count = use_count + 1 WHERE id = ${coupon_id}`;
      }

      fetch(`${SITE_URL}/api/shoots/${existingShootId}/start`, {
        method: "POST",
        headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "" },
      }).catch(() => {});

      return NextResponse.json({ ok: true });
    }

    // Legacy flow: check dedup
    const [existingPurchase] = await sql`
      SELECT id, status FROM template_purchases WHERE id = ${purchase_id}
    `;
    if (existingPurchase?.status === "success") {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    const [template] = await sql`SELECT * FROM templates WHERE id = ${template_id}`;
    if (!template) {
      await sql`UPDATE template_purchases SET status = 'failed' WHERE id = ${purchase_id}`;
      return NextResponse.json({ ok: true });
    }

    const templateImages = await sql`
      SELECT storage_path, storage_bucket, purpose, tag FROM template_images WHERE template_id = ${template_id}
    `;

    // Get owner email from profiles
    const [ownerProfile] = await sql`SELECT email FROM profiles WHERE id = ${user_id}`;
    const ownerEmail = ownerProfile?.email ?? "";

    const shootId = crypto.randomUUID();
    const packageSize = template.package_size ?? 10;

    await sql`
      INSERT INTO shoots (id, user_id, owner_email, mode, aspect_ratio, currency, package_size, status, progress, quote, identity_profile, created_at, updated_at)
      VALUES (
        ${shootId}, ${user_id}, ${ownerEmail},
        ${template.shoot_mode ?? "advanced"}, ${template.aspect_ratio ?? "4:5"},
        'NGN', ${packageSize}, 'QUEUED', 0, '{"text":"","attribution":""}',
        '', ${now}, ${now}
      )
    `;

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
    if (slots.length > 0) {
      await sql`INSERT INTO shoot_images ${sql(slots)}`;
    }

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
      await sql`INSERT INTO shoot_references ${sql(refs)}`;
    }

    await sql`
      UPDATE template_purchases SET status = 'success', shoot_id = ${shootId}
      WHERE id = ${purchase_id}
    `;
    await sql`UPDATE templates SET purchase_count = purchase_count + 1 WHERE id = ${template_id}`;
    if (coupon_id) {
      await sql`UPDATE coupons SET use_count = use_count + 1 WHERE id = ${coupon_id}`;
    }

    fetch(`${SITE_URL}/api/shoots/${shootId}/start`, {
      method: "POST",
      headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "" },
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  }

  // ── Standard shoot payment ─────────────────────────────────────────────
  const { shoot_id, user_id } = metadata ?? {};
  if (!shoot_id) return NextResponse.json({ ok: true });

  const [existingPayment] = await sql`
    SELECT id, status, user_id, shoot_id FROM payments
    WHERE provider_reference = ${reference}
  `;
  if (existingPayment?.status === "success") {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const [shoot] = await sql`SELECT id, user_id FROM shoots WHERE id = ${shoot_id}`;
  const ownerId = shoot?.user_id ?? user_id;

  await sql`
    UPDATE payments SET status = 'success', paid_at = ${now}, metadata = ${JSON.stringify(event.data)}
    WHERE provider_reference = ${reference}
  `;
  await sql`
    UPDATE shoots SET status = 'QUEUED', updated_at = ${now}
    WHERE id = ${shoot_id} AND status = 'PENDING_PAYMENT'
  `;
  await sql`
    INSERT INTO generation_events (id, shoot_id, user_id, type, payload, created_at)
    VALUES (
      ${crypto.randomUUID()}, ${shoot_id}, ${ownerId},
      'payment_confirmed', ${JSON.stringify({ reference, amount, currency })}, ${now}
    )
  `;

  fetch(`${SITE_URL}/api/shoots/${shoot_id}/start`, {
    method: "POST",
    headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "" },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
