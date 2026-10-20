import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import sql from "@/lib/db";
import { notifyCreatorOfSale } from "@/lib/creator-sale-email";
import { verifyFlutterwaveWebhookSignature, verifyFlutterwavePayment } from "@/lib/flutterwave";
import { INTERNAL_BASE_URL } from "@/lib/site-url";
import { paidEnough, reportPaymentMismatch } from "@/lib/payment-checks";
import { fulfilTemplatePurchase } from "@/lib/template-purchase";
import { normalizePackageSize } from "@/lib/types";

function computeIdempotencyKey(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  // ── 1. Verify signature ────────────────────────────────────────────────────
  // Flutterwave sends a plain-string `verif-hash` header (not HMAC).
  const verifHash = request.headers.get("verif-hash") ?? "";
  if (!verifHash) {
    return NextResponse.json({ error: "Missing verif-hash header" }, { status: 401 });
  }
  if (!verifyFlutterwaveWebhookSignature(rawBody, verifHash)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: {
    event: string;
    data: {
      id: number;
      tx_ref: string;
      status: string;
      amount: number;
      currency: string;
      customer: { email: string };
      created_at: string;
      meta?: Record<string, unknown>;
    };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // ── 2. Early exit: only handle successful charges ──────────────────────────
  if (event.event !== "charge.completed" || event.data?.status !== "successful") {
    return NextResponse.json({ ok: true });
  }

  const txRef = event.data.tx_ref;
  const now = new Date().toISOString();

  // ── 3. Idempotency gate ────────────────────────────────────────────────────
  const idempotencyKey = computeIdempotencyKey(rawBody);

  const [loggedEvent] = await sql`
    INSERT INTO payment_events (transaction_ref, event_type, raw_payload, idempotency_key, processed_by, created_at)
    VALUES (
      ${txRef}, ${event.event}, ${JSON.stringify(event)},
      ${idempotencyKey}, 'flutterwave_webhook', ${now}
    )
    ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
    RETURNING id
  `;
  // The WHERE is not decoration. The unique index on idempotency_key is
  // partial (WHERE idempotency_key IS NOT NULL), and Postgres only matches a
  // partial index when the conflict target repeats its predicate. Without it
  // this insert failed with 42P10 on EVERY call — so no Flutterwave payment was
  // ever confirmed here, and a customer who paid through the fallback gateway
  // sat at "pending" for good. The Paystack route always had it.

  if (!loggedEvent) {
    console.log(`[flutterwave webhook] Duplicate event (idempotency_key: ${idempotencyKey.slice(0, 8)}...) — skipping`);
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // ── 4. Re-verify with Flutterwave API (never trust webhook payload alone) ──
  let verified: Awaited<ReturnType<typeof verifyFlutterwavePayment>>;
  try {
    verified = await verifyFlutterwavePayment(txRef);
  } catch (err) {
    console.error("[flutterwave webhook] Re-verify failed:", err instanceof Error ? err.message : String(err));
    // Return 200 so Flutterwave doesn't retry — we already inserted the event row
    return NextResponse.json({ ok: true, warning: "verify_failed" });
  }

  if (!verified.success) {
    console.warn(`[flutterwave webhook] tx_ref=${txRef} re-verified as NOT successful — skipping business logic`);
    return NextResponse.json({ ok: true });
  }

  // ── 5. Dispatch on payment type via meta ───────────────────────────────────
  // As in the Paystack route: if the work fails after the duplicate gate was
  // written, remove the gate so Flutterwave's retry is processed, not dropped.
  try {
    return await handleCharge(event, txRef, now, verified);
  } catch (e) {
    console.error("[flutterwave webhook] processing failed — the retry will run it again:",
      e instanceof Error ? e.message : e);
    await sql`DELETE FROM payment_events WHERE id = ${loggedEvent.id}`.catch(() => {});
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}

async function handleCharge(
  event: ReturnType<typeof JSON.parse>,
  txRef: string,
  now: string,
  verified: Awaited<ReturnType<typeof verifyFlutterwavePayment>>,
): Promise<NextResponse> {
  // Flutterwave uses `data.meta` (not `data.metadata`)
  const meta = (event.data.meta ?? {}) as Record<string, string>;
  const { amount, currency } = event.data;
  // What Flutterwave itself confirmed was paid, in major units — the re-verify,
  // not the webhook body, is what the amount checks below trust.
  const paidMajor = Number(verified.amountNgn);
  const paidCurrency = verified.currency;

  // ── Creator showcase generation ────────────────────────────────────────────
  if (meta.type === "creator_showcase") {
    const showcaseShootId = meta.shoot_id;
    const userId = meta.user_id;
    if (!showcaseShootId) return NextResponse.json({ ok: true });

    const [sc] = await sql`SELECT package_size FROM shoots WHERE id = ${showcaseShootId}`;
    const showcaseExpected = sc ? normalizePackageSize(sc.package_size) * 1000 : null;
    if (showcaseExpected == null || !paidEnough(paidMajor, paidCurrency, showcaseExpected, "NGN")) {
      await reportPaymentMismatch({ where: "Flutterwave webhook (creator showcase)", reference: txRef, paidMajor, paidCurrency,
        expectedMajor: showcaseExpected, expectedCurrency: "NGN", order: `showcase shoot ${showcaseShootId}` });
      return NextResponse.json({ ok: true });
    }

    const activated = await sql`
      UPDATE shoots SET status = 'QUEUED', updated_at = ${now}
      WHERE id = ${showcaseShootId} AND status = 'PENDING_PAYMENT'
      RETURNING id
    `;
    if (!activated.length) {
      console.log(`[flutterwave webhook] Shoot ${showcaseShootId} already processed or wrong state`);
      return NextResponse.json({ ok: true });
    }

    await sql`
      INSERT INTO payments (id, user_id, shoot_id, provider, provider_reference, amount_ngn, status, paid_at, metadata, created_at)
      VALUES (
        ${crypto.randomUUID()}, ${userId}, ${showcaseShootId}, 'flutterwave',
        ${txRef}, ${Math.round(amount)}, 'success', ${now}, ${JSON.stringify(event.data)}, ${now}
      )
    `;

    fetch(`${INTERNAL_BASE_URL}/api/shoots/${showcaseShootId}/start`, {
      method: "POST",
      headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "" },
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  }

  // ── Gift purchase fulfillment ──────────────────────────────────────────────
  if (meta.type === "gift_purchase") {
    const giftId = meta.gift_id;
    if (!giftId) return NextResponse.json({ ok: true });

    await sql`
      UPDATE gift_links
      SET payment_status = 'paid',
          provider_reference = ${txRef},
          payment_provider = 'flutterwave'
      WHERE id = ${giftId} AND payment_status = 'pending'
    `;

    return NextResponse.json({ ok: true });
  }

  // ── Template purchase fulfillment ──────────────────────────────────────────
  if (meta.type === "template_purchase") {
    const { purchase_id, template_id, shoot_id: existingShootId, user_id, coupon_id } = meta;
    if (!purchase_id) return NextResponse.json({ ok: true });

    const [tp] = await sql`SELECT amount_ngn, amount_usd, currency, shoot_id FROM template_purchases WHERE id = ${purchase_id}`;
    const tpCurrency = String(tp?.currency || "NGN").toUpperCase();
    const tpExpected = tp ? (tpCurrency === "USD" ? Number(tp.amount_usd ?? 0) : Number(tp.amount_ngn ?? 0)) : null;
    if (tpExpected == null || (existingShootId && tp?.shoot_id && tp.shoot_id !== existingShootId)
        || !paidEnough(paidMajor, paidCurrency, tpExpected, tpCurrency)) {
      await reportPaymentMismatch({ where: "Flutterwave webhook (marketplace)", reference: txRef, paidMajor, paidCurrency,
        expectedMajor: tpExpected, expectedCurrency: tpCurrency, order: `purchase ${purchase_id}${existingShootId ? ` / shoot ${existingShootId}` : ""}` });
      return NextResponse.json({ ok: true });
    }

    // New booking flow: shoot already exists — just queue it
    if (existingShootId) {
      const { newlyPaid, queued } = await fulfilTemplatePurchase({
        purchaseId: purchase_id, shootId: existingShootId, provider: "flutterwave", providerReference: txRef,
      });
      if (!newlyPaid) console.log(`[flutterwave webhook] Template purchase ${purchase_id} already marked success`);
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
      return NextResponse.json({ ok: true });
    }

    const [template] = await sql`
      SELECT id, shoot_mode, aspect_ratio, package_size FROM templates WHERE id = ${template_id}
    `;
    if (!template) {
      await sql`UPDATE template_purchases SET status = 'failed' WHERE id = ${purchase_id}`;
      return NextResponse.json({ ok: true });
    }

    const templateImages = await sql`
      SELECT storage_path, storage_bucket, purpose, tag FROM template_images WHERE template_id = ${template_id}
    `;

    const [ownerProfile] = await sql`SELECT email FROM profiles WHERE id = ${user_id}`;
    const ownerEmail = ownerProfile?.email ?? "";

    const shootId = crypto.randomUUID();
    const packageSize = template.package_size ?? 10;

    await sql`
      INSERT INTO shoots (id, user_id, owner_email, mode, aspect_ratio, currency, package_size, status, progress, quote, identity_profile, created_at, updated_at)
      VALUES (
        ${shootId}, ${user_id}, ${ownerEmail},
        ${template.shoot_mode ?? "advanced"}, ${template.aspect_ratio ?? "4:5"},
        ${currency}, ${packageSize}, 'QUEUED', 0, '{"text":"","attribution":""}',
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
      const refs = templateImages.map((img, i: number) => ({
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
      UPDATE template_purchases
      SET status = 'success', shoot_id = ${shootId},
          payment_provider = 'flutterwave', provider_reference = ${txRef}
      WHERE id = ${purchase_id}
    `;
    await sql`UPDATE templates SET purchase_count = purchase_count + 1 WHERE id = ${template_id}`;
      // Same as the Paystack path: creators paid through Flutterwave must get
      // the same notification, and it must not delay fulfilment.
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

  // ── Standard shoot payment ─────────────────────────────────────────────────
  const shootId = meta.shoot_id;
  const userId = meta.user_id;
  if (!shootId) return NextResponse.json({ ok: true });

  const [shoot] = await sql`SELECT id, user_id, currency FROM shoots WHERE id = ${shootId}`;
  const ownerId = shoot?.user_id ?? userId;

  const [pay] = await sql`SELECT amount_ngn, shoot_id FROM payments WHERE provider_reference = ${txRef}`;
  if (!shoot || !pay || pay.shoot_id !== shootId
      || !paidEnough(paidMajor, paidCurrency, Number(pay.amount_ngn), shoot.currency ?? "NGN")) {
    await reportPaymentMismatch({ where: "Flutterwave webhook (studio shoot)", reference: txRef, paidMajor, paidCurrency,
      expectedMajor: pay ? Number(pay.amount_ngn) : null, expectedCurrency: shoot?.currency ?? "NGN", order: `shoot ${shootId}` });
    if (pay) await sql`UPDATE payments SET status = 'mismatch' WHERE provider_reference = ${txRef} AND status <> 'success'`;
    return NextResponse.json({ ok: true });
  }

  await sql`
    UPDATE payments SET status = 'success', paid_at = ${now}, metadata = ${JSON.stringify(event.data)}
    WHERE provider_reference = ${txRef}
  `;

  const queued = await sql`
    UPDATE shoots SET status = 'QUEUED', updated_at = ${now}
    WHERE id = ${shootId} AND status = 'PENDING_PAYMENT'
    RETURNING id
  `;

  await sql`
    INSERT INTO generation_events (id, shoot_id, user_id, type, payload, created_at)
    VALUES (
      ${crypto.randomUUID()}, ${shootId}, ${ownerId},
      'payment_confirmed', ${sql.json({ reference: txRef, amount, currency })}, ${now}
    )
  `;

  if (queued.length) {
    fetch(`${INTERNAL_BASE_URL}/api/shoots/${shootId}/start`, {
      method: "POST",
      headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "" },
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
