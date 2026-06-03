import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual, createHash } from "crypto";
import sql from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";

/**
 * Compute a deterministic idempotency key from the webhook body.
 * Same webhook body → same key. Different retries with same body → same key.
 * This prevents duplicate processing at the database level (unique index).
 */
function computeIdempotencyKey(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature") ?? "";
  const secret = process.env.PAYSTACK_SECRET_KEY;

  if (!secret) {
    console.error("[paystack webhook] PAYSTACK_SECRET_KEY is not set — rejecting all events");
    return NextResponse.json({ error: "Webhook misconfigured" }, { status: 500 });
  }

  // ── 1. Verify signature ────────────────────────────────────────────────────
  const hash = createHmac("sha512", secret).update(rawBody).digest("hex");
  const sigOk = signature.length === hash.length &&
    timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  if (!sigOk) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(rawBody);
  const now = new Date().toISOString();

  // ── 2. Early exit if not a charge.success event ────────────────────────────
  if (event.event !== "charge.success") {
    return NextResponse.json({ ok: true });
  }

  // ── 3. Compute idempotency key from raw body ───────────────────────────────
  // If we see the same body again, we get the same key, and the unique index
  // prevents duplicate processing.
  const idempotencyKey = computeIdempotencyKey(rawBody);
  const reference = event.data?.reference ?? "";
  const eventType = event.event;

  // ── 4. Log the event immutably (append-only, never UPDATE) ────────────────
  // The ON CONFLICT DO NOTHING ensures idempotency: if we've already logged
  // this exact webhook (same body, same key), the INSERT is silently skipped.
  const [loggedEvent] = await sql`
    INSERT INTO payment_events (transaction_ref, event_type, raw_payload, idempotency_key, processed_by, created_at)
    VALUES (${reference}, ${eventType}, ${JSON.stringify(event)}, ${idempotencyKey}, 'paystack_webhook', ${now})
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id
  `;

  // ── 5. If the event was not inserted, it's a duplicate → return early ──────
  // This is our idempotency gate. No business logic runs.
  if (!loggedEvent) {
    console.log(`[paystack webhook] Duplicate event (idempotency_key: ${idempotencyKey.slice(0, 8)}...) — skipping business logic`);
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // ── 6. Event is NEW → proceed with business logic ──────────────────────────
  const { metadata, amount, currency } = event.data;

  // ── Creator showcase generation ─────────────────────────────────────────
  if (metadata?.type === "creator_showcase") {
    const { shoot_id: showcaseShootId, user_id } = metadata as Record<string, string>;
    if (!showcaseShootId) return NextResponse.json({ ok: true });

    // No need to check for duplicate here — we already did it via idempotency_key
    const activated = await sql`
      UPDATE shoots SET status = 'QUEUED', updated_at = ${now}
      WHERE id = ${showcaseShootId} AND status = 'PENDING_PAYMENT'
      RETURNING id
    `;
    if (!activated.length) {
      // Shoot was already QUEUED or in wrong state — still log successful payment
      console.log(`[paystack webhook] Shoot ${showcaseShootId} already processed or in wrong state`);
      return NextResponse.json({ ok: true });
    }

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

  // ── Gift purchase fulfillment ────────────────────────────────────────────
  if (metadata?.type === "gift_purchase") {
    const { gift_id } = metadata as Record<string, string>;
    if (!gift_id) return NextResponse.json({ ok: true });

    await sql`
      UPDATE gift_links
      SET payment_status = 'paid', paystack_reference = ${reference}
      WHERE id = ${gift_id} AND payment_status = 'pending'
    `;

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
      if (!locked.length) {
        console.log(`[paystack webhook] Template purchase ${purchase_id} already marked success`);
        return NextResponse.json({ ok: true });
      }

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

    // Legacy flow: create full shoot from template
    const [existingPurchase] = await sql`
      SELECT id, status FROM template_purchases WHERE id = ${purchase_id}
    `;
    if (existingPurchase?.status === "success") {
      console.log(`[paystack webhook] Template purchase ${purchase_id} already success in legacy flow`);
      return NextResponse.json({ ok: true });
    }

    const [template] = await sql`SELECT id, shoot_mode, aspect_ratio, package_size FROM templates WHERE id = ${template_id}`;
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

  // ── Standard shoot payment ────────────────────────────────────────────────
  // At this point, we've already checked idempotency via payment_events.
  // Business logic only runs if this is a brand-new webhook.
  const { shoot_id, user_id } = metadata ?? {};
  if (!shoot_id) return NextResponse.json({ ok: true });

  const [shoot] = await sql`SELECT id, user_id FROM shoots WHERE id = ${shoot_id}`;
  const ownerId = shoot?.user_id ?? user_id;

  // Update payment record with final status
  await sql`
    UPDATE payments SET status = 'success', paid_at = ${now}, metadata = ${JSON.stringify(event.data)}
    WHERE provider_reference = ${reference}
  `;

  // Queue the shoot for processing
  await sql`
    UPDATE shoots SET status = 'QUEUED', updated_at = ${now}
    WHERE id = ${shoot_id} AND status = 'PENDING_PAYMENT'
  `;

  // Log payment confirmation in generation timeline
  await sql`
    INSERT INTO generation_events (id, shoot_id, user_id, type, payload, created_at)
    VALUES (
      ${crypto.randomUUID()}, ${shoot_id}, ${ownerId},
      'payment_confirmed', ${JSON.stringify({ reference, amount, currency })}, ${now}
    )
  `;

  // Fire the generation worker
  fetch(`${SITE_URL}/api/shoots/${shoot_id}/start`, {
    method: "POST",
    headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "" },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
