import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual, createHash } from "crypto";
import sql from "@/lib/db";
import { notifyCreatorOfSale } from "@/lib/creator-sale-email";
import { INTERNAL_BASE_URL } from "@/lib/site-url";
import { paidEnough, reportPaymentMismatch } from "@/lib/payment-checks";
import { fulfilTemplatePurchase } from "@/lib/template-purchase";
import { normalizePackageSize } from "@/lib/types";
import { deliverRetouch } from "@/lib/whatsapp-retouch";
import { deliverRetouch as deliverRetouchIg } from "@/lib/instagram-retouch";
import { creditWallet } from "@/lib/wallet";
import { notifyWalletTopUp } from "@/lib/wallet-notify";
import { fulfilLicencePayment } from "@/lib/fegorson-licence";

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
  //
  // The WHERE clause is not decoration. idx_payment_events_idempotency is a
  // PARTIAL unique index (... WHERE idempotency_key IS NOT NULL), and Postgres
  // refuses to infer a partial index as a conflict arbiter unless the statement
  // repeats its predicate. Without it every call died on 42P10, "no unique or
  // exclusion constraint matching the ON CONFLICT specification" — which is why
  // payment_events sat empty and no Paystack webhook has ever been processed.
  const [loggedEvent] = await sql`
    INSERT INTO payment_events (transaction_ref, event_type, raw_payload, idempotency_key, processed_by, created_at)
    VALUES (${reference}, ${eventType}, ${JSON.stringify(event)}, ${idempotencyKey}, 'paystack_webhook', ${now})
    ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
    RETURNING id
  `;

  // ── 5. If the event was not inserted, it's a duplicate → return early ──────
  // This is our idempotency gate. No business logic runs.
  if (!loggedEvent) {
    console.log(`[paystack webhook] Duplicate event (idempotency_key: ${idempotencyKey.slice(0, 8)}...) — skipping business logic`);
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // ── 6. Event is NEW → proceed with business logic ──────────────────────────
  // The event row above is the duplicate gate and is written BEFORE the work.
  // If the work then fails (a database blip), Paystack's retry used to be
  // thrown away as a duplicate. Now the row is removed so the retry runs. Every
  // step below is guarded to act once, so a re-run never doubles anything.
  try {
    return await handleCharge(event, reference, now);
  } catch (e) {
    console.error("[paystack webhook] processing failed — Paystack's retry will run it again:",
      e instanceof Error ? e.message : e);
    await sql`DELETE FROM payment_events WHERE id = ${loggedEvent.id}`.catch(() => {});
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}

async function handleCharge(event: ReturnType<typeof JSON.parse>, reference: string, now: string): Promise<NextResponse> {
  const { metadata, amount, currency } = event.data;
  // Paystack amounts are in kobo / cents.
  const paidMajor = Number(amount) / 100;

  // ── Fegorson Studio licence ──────────────────────────────────────────────
  // The licence code is made inside fulfilLicencePayment, which checks the
  // amount and currency against the order and issues once per reference. It
  // never throws: a problem after Paystack has taken the money goes to the
  // owner on Telegram, and Paystack still gets its 200.
  if (metadata?.type === "fegorson_licence") {
    await fulfilLicencePayment({ reference, amountKobo: Number(amount), currency, via: "webhook" });
    return NextResponse.json({ ok: true });
  }

  // ── Creator showcase generation ─────────────────────────────────────────
  if (metadata?.type === "creator_showcase") {
    const { shoot_id: showcaseShootId, user_id } = metadata as Record<string, string>;
    if (!showcaseShootId) return NextResponse.json({ ok: true });

    const [sc] = await sql`SELECT package_size FROM shoots WHERE id = ${showcaseShootId}`;
    const showcaseExpected = sc ? normalizePackageSize(sc.package_size) * 1000 : null;
    if (showcaseExpected == null || !paidEnough(paidMajor, currency, showcaseExpected, "NGN")) {
      await reportPaymentMismatch({ where: "Paystack webhook (creator showcase)", reference, paidMajor, paidCurrency: currency,
        expectedMajor: showcaseExpected, expectedCurrency: "NGN", order: `showcase shoot ${showcaseShootId}` });
      return NextResponse.json({ ok: true });
    }

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

    fetch(`${INTERNAL_BASE_URL}/api/shoots/${showcaseShootId}/start`, {
      method: "POST",
      headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "" },
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  }

  // ── Retouch unlock ───────────────────────────────────────────────────────
  // The only thing in the system that sets shoot_retouch.paid. The client never
  // writes it, so an abandoned Paystack tab or a forged callback unlocks
  // nothing.
  if (metadata?.type === "retouch_payment") {
    const { shoot_id: retouchShootId, user_id: retouchUserId } = metadata as Record<string, string>;
    if (!retouchShootId) return NextResponse.json({ ok: true });

    const [rt] = await sql`SELECT price_ngn FROM shoot_retouch WHERE shoot_id = ${retouchShootId}`;
    if (!rt || !paidEnough(paidMajor, currency, Number(rt.price_ngn ?? 0), "NGN")) {
      await reportPaymentMismatch({ where: "Paystack webhook (retouch)", reference, paidMajor, paidCurrency: currency,
        expectedMajor: rt ? Number(rt.price_ngn ?? 0) : null, expectedCurrency: "NGN", order: `retouch for shoot ${retouchShootId}` });
      return NextResponse.json({ ok: true });
    }

    const unlocked = await sql`
      UPDATE shoot_retouch
      SET paid = true, paid_at = ${now}, paystack_reference = ${reference}, updated_at = ${now}
      WHERE shoot_id = ${retouchShootId} AND paid = false
      RETURNING shoot_id, price_ngn
    `;
    if (!unlocked.length) {
      // Already unlocked — a duplicate webhook, or comped before payment landed.
      console.log(`[paystack webhook] retouch ${retouchShootId} already unlocked`);
      return NextResponse.json({ ok: true });
    }

    await sql`
      INSERT INTO payments (id, user_id, shoot_id, provider, provider_reference, amount_ngn, status, paid_at, metadata, created_at)
      VALUES (
        ${crypto.randomUUID()}, ${retouchUserId}, ${retouchShootId}, 'paystack',
        ${reference}, ${Math.round(amount / 100)}, 'success', ${now}, ${JSON.stringify(event.data)}, ${now}
      )
    `.catch(() => {});

    console.log(`[paystack webhook] retouch unlocked for shoot ${retouchShootId}`);

    // If this retouch was ordered in a chat, payment is what releases the files
    // into it. Awaited so the buyer gets them now rather than on a later poll,
    // and caught so a chat failure can never turn a successful payment into a
    // webhook error and a Paystack retry.
    //
    // WhatsApp first, then Instagram. Each returns false rather than throwing
    // when the shoot did not come from it, so trying both in turn is how the
    // right one is found — and a shoot that came from the website matches
    // neither and correctly does nothing here.
    await deliverRetouch(retouchShootId)
      .then((done) => done || deliverRetouchIg(retouchShootId))
      .catch((e) => {
        console.error(`[paystack webhook] chat retouch delivery failed for ${retouchShootId}:`,
          e instanceof Error ? e.message : e);
      });

    return NextResponse.json({ ok: true });
  }

  // ── Wallet top-up ───────────────────────────────────────────
  // The only thing that puts funded money in a wallet. The client never writes
  // a balance, so an abandoned Paystack tab or a forged callback credits nothing.
  if (metadata?.type === "wallet_topup") {
    const { user_id: topupUserId } = metadata as Record<string, string>;
    if (!topupUserId) return NextResponse.json({ ok: true });
    if (String(currency || "NGN").toUpperCase() !== "NGN") {
      await reportPaymentMismatch({ where: "Paystack webhook (wallet top-up)", reference, paidMajor, paidCurrency: currency,
        expectedMajor: paidMajor, expectedCurrency: "NGN", order: `wallet top-up for ${topupUserId}` });
      return NextResponse.json({ ok: true });
    }

    // amount arrives in kobo. creditWallet carries a unique index on reference,
    // so a replayed webhook adds nothing the second time.
    const credited = await creditWallet({
      userId: topupUserId,
      amountNgn: Math.round(amount / 100),
      reason: "topup",
      reference,
      note: "Paystack top-up",
    });

    console.log(credited
      ? `[paystack webhook] wallet topped up for ${topupUserId}: ₦${Math.round(amount / 100)}`
      : `[paystack webhook] wallet top-up ${reference} already credited — skipping`);

    // Tell them in the chat it landed, if this came from WhatsApp. Caught, so a
    // messaging failure can never turn a successful payment into a webhook error
    // and a Paystack retry.
    if (credited) {
      await notifyWalletTopUp(topupUserId, Math.round(amount / 100)).catch((e) =>
        console.error("[paystack webhook] top-up notice failed:",
          e instanceof Error ? e.message : e));
    }

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

    // Belt-and-suspenders: confirm package_size from custom_fields matches DB record
    const customFields = (event.data?.metadata?.custom_fields ?? []) as Array<{ variable_name: string; value: string }>;
    const cfPackageSize = customFields.find(f => f.variable_name === "package_size")?.value;
    if (cfPackageSize) {
      const [stored] = await sql`SELECT package_size FROM gift_links WHERE id = ${gift_id}`;
      if (stored && String(stored.package_size) !== cfPackageSize) {
        console.warn(`[paystack webhook] gift ${gift_id}: custom_fields package_size=${cfPackageSize} differs from stored package_size=${stored.package_size}`);
      }
    }

    return NextResponse.json({ ok: true });
  }

  // ── Template purchase fulfillment ────────────────────────────────────────
  if (metadata?.type === "template_purchase") {
    const { purchase_id, template_id, shoot_id: existingShootId, user_id, coupon_id } = metadata as Record<string, string>;
    if (!purchase_id) return NextResponse.json({ ok: true });

    // The price this purchase was created at, in its own currency.
    const [tp] = await sql`SELECT amount_ngn, amount_usd, currency, shoot_id FROM template_purchases WHERE id = ${purchase_id}`;
    const tpCurrency = String(tp?.currency || "NGN").toUpperCase();
    const tpExpected = tp ? (tpCurrency === "USD" ? Number(tp.amount_usd ?? 0) : Number(tp.amount_ngn ?? 0)) : null;
    if (tpExpected == null || (existingShootId && tp?.shoot_id && tp.shoot_id !== existingShootId)
        || !paidEnough(paidMajor, currency, tpExpected, tpCurrency)) {
      await reportPaymentMismatch({ where: "Paystack webhook (marketplace)", reference, paidMajor, paidCurrency: currency,
        expectedMajor: tpExpected, expectedCurrency: tpCurrency, order: `purchase ${purchase_id}${existingShootId ? ` / shoot ${existingShootId}` : ""}` });
      return NextResponse.json({ ok: true });
    }

    // New booking flow: shoot already created with refs — just queue it
    if (existingShootId) {
      const { newlyPaid, queued } = await fulfilTemplatePurchase({ purchaseId: purchase_id, shootId: existingShootId });
      if (!newlyPaid) console.log(`[paystack webhook] Template purchase ${purchase_id} already marked success`);

      // Only when this call moved the shoot out of PENDING_PAYMENT. If the
      // buyer's "verify payment" got there first it already started the worker.
      if (queued) {
        fetch(`${INTERNAL_BASE_URL}/api/shoots/${existingShootId}/start`, {
          method: "POST",
          headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "" },
        }).catch(() => {});
      }

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
      // Tell the creator they earned. Deliberately not awaited: a slow or
      // bouncing mail provider must never delay fulfilment of a paid booking.
      void notifyCreatorOfSale(purchase_id);
    if (coupon_id) {
      await sql`UPDATE coupons SET use_count = use_count + 1 WHERE id = ${coupon_id}`;
    }

    fetch(`${INTERNAL_BASE_URL}/api/shoots/${shootId}/start`, {
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

  const [shoot] = await sql`SELECT id, user_id, currency FROM shoots WHERE id = ${shoot_id}`;
  const ownerId = shoot?.user_id ?? user_id;

  // The charge must be the one this shoot's pay step created, for the full price.
  const [pay] = await sql`SELECT amount_ngn, shoot_id FROM payments WHERE provider_reference = ${reference}`;
  if (!shoot || !pay || pay.shoot_id !== shoot_id
      || !paidEnough(paidMajor, currency, Number(pay.amount_ngn), shoot.currency ?? "NGN")) {
    await reportPaymentMismatch({ where: "Paystack webhook (studio shoot)", reference, paidMajor, paidCurrency: currency,
      expectedMajor: pay ? Number(pay.amount_ngn) : null, expectedCurrency: shoot?.currency ?? "NGN", order: `shoot ${shoot_id}` });
    if (pay) await sql`UPDATE payments SET status = 'mismatch' WHERE provider_reference = ${reference} AND status <> 'success'`;
    return NextResponse.json({ ok: true });
  }

  // Update payment record with final status
  await sql`
    UPDATE payments SET status = 'success', paid_at = ${now}, metadata = ${JSON.stringify(event.data)}
    WHERE provider_reference = ${reference}
  `;

  // Queue the shoot for processing
  const queued = await sql`
    UPDATE shoots SET status = 'QUEUED', updated_at = ${now}
    WHERE id = ${shoot_id} AND status = 'PENDING_PAYMENT'
    RETURNING id
  `;

  // Log payment confirmation in generation timeline
  await sql`
    INSERT INTO generation_events (id, shoot_id, user_id, type, payload, created_at)
    VALUES (
      ${crypto.randomUUID()}, ${shoot_id}, ${ownerId},
      'payment_confirmed', ${sql.json({ reference, amount, currency })}, ${now}
    )
  `;

  // Fire the generation worker — only if this call queued the shoot.
  if (queued.length) {
    fetch(`${INTERNAL_BASE_URL}/api/shoots/${shoot_id}/start`, {
      method: "POST",
      headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "" },
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
