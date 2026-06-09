import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { hashToken, timingSafeCompare } from "@/lib/shortcut-token";
import { SITE_URL } from "@/lib/site-url";

const ALLOWED_HOSTNAME = "aluxartandframes.shop";
// Pathname must be exactly /marketplace/<uuid> — no query strings, fragments, or extra segments
const TEMPLATE_PATH_RE = /^\/marketplace\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

// In-memory sliding-window rate limiter (per VPS process, per IP)
const rateLimitCache = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 10;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const prev = (rateLimitCache.get(ip) ?? []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (prev.length >= MAX_REQUESTS_PER_WINDOW) return true;
  rateLimitCache.set(ip, [...prev, now]);
  return false;
}

export async function POST(req: NextRequest) {
  // 1. Rate limit — take first IP from x-forwarded-for (VPS sits behind proxy)
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (isRateLimited(ip)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const body = await req.json().catch(() => null);
  if (
    !body ||
    typeof body.token !== "string" ||
    typeof body.parsedQrUrl !== "string" ||
    typeof body.idempotencyKey !== "string"
  ) {
    return NextResponse.json(
      { error: "Missing required fields: token, parsedQrUrl, idempotencyKey" },
      { status: 400 }
    );
  }

  const { token, parsedQrUrl, idempotencyKey } = body as {
    token: string;
    parsedQrUrl: string;
    idempotencyKey: string;
  };
  const packageSize: 1 | 5 | 10 = ([1, 5, 10] as const).includes(body.packageSize) ? body.packageSize : 1;
  const currency: "NGN" | "USD" = body.currency === "USD" ? "USD" : "NGN";

  // 2. Idempotency check
  // Sweep expired keys fire-and-forget so cleanup never adds latency to the hot path.
  sql`DELETE FROM siri_idempotency_keys WHERE expires_at < now()`.catch(() => {});

  const [existingKey] = await sql`
    SELECT shoot_id, checkout_url
    FROM siri_idempotency_keys
    WHERE key = ${idempotencyKey} AND expires_at > now()
  `;
  if (existingKey) {
    return NextResponse.json({
      checkoutUrl: existingKey.checkout_url,
      shootId: existingKey.shoot_id,
      isReplay: true,
    });
  }

  // 3. Token authentication
  // Look up by hash (fast indexed lookup), then timingSafeCompare as defense-in-depth.
  const clientHash = hashToken(token);
  const [dbToken] = await sql`
    SELECT id, user_id, token_hash, expires_at
    FROM shortcut_tokens
    WHERE token_hash = ${clientHash}
  `;
  if (!dbToken || !timingSafeCompare(dbToken.token_hash as string, clientHash)) {
    return NextResponse.json({ error: "Invalid or expired Siri token" }, { status: 401 });
  }
  if (dbToken.expires_at && new Date(dbToken.expires_at as string) < new Date()) {
    return NextResponse.json({ error: "Invalid or expired Siri token" }, { status: 401 });
  }
  const userId = dbToken.user_id as string;

  // 4. URL validation — parse, whitelist hostname, extract UUID from pathname only
  let parsedUrl: URL;
  try { parsedUrl = new URL(parsedQrUrl); }
  catch { return NextResponse.json({ error: "Invalid QR code URL" }, { status: 400 }); }

  if (parsedUrl.hostname !== ALLOWED_HOSTNAME) {
    return NextResponse.json({ error: "QR code does not point to an Alux template" }, { status: 400 });
  }
  // Use pathname only — any query string or fragment is discarded before regex match
  const pathMatch = parsedUrl.pathname.match(TEMPLATE_PATH_RE);
  if (!pathMatch) {
    return NextResponse.json({ error: "QR code path does not match a valid template URL" }, { status: 400 });
  }
  const templateId = pathMatch[1]; // UUID extracted server-side, never trusted from client

  // 5. Template lookup
  const [template] = await sql`
    SELECT t.id, t.title, t.price_ngn, t.price_1_ngn, t.price_5_ngn,
           t.aspect_ratio, t.shoot_mode,
           c.paystack_subaccount_code AS cr_subaccount
    FROM templates t
    LEFT JOIN creators c ON c.id = t.creator_id
    WHERE t.id = ${templateId} AND t.status = 'published'
  `;
  if (!template) return NextResponse.json({ error: "Template not found or no longer available" }, { status: 404 });

  if (!template.cr_subaccount) {
    return NextResponse.json({ error: "This creator has not set up payouts yet" }, { status: 422 });
  }

  // 6. Identity images — up to 3 most recently used from the user's library
  const identityImages = await sql`
    SELECT id, name, type, size, storage_bucket, storage_path
    FROM identity_images
    WHERE user_id = ${userId}
    ORDER BY last_used_at DESC NULLS LAST, created_at DESC
    LIMIT 3
  `;
  if (identityImages.length === 0) {
    return NextResponse.json(
      { error: "No identity photos found. Upload at least 1 on the website first." },
      { status: 400 }
    );
  }

  // 7. Resolve price for the chosen package (mirrors /api/marketplace/[id]/book)
  const price10 = Number(template.price_ngn) || 0;
  const priceMap: Record<1 | 5 | 10, number | null> = {
    1: template.price_1_ngn != null ? Number(template.price_1_ngn) : (price10 ? Math.round(price10 * 0.12) : null),
    5: template.price_5_ngn != null ? Number(template.price_5_ngn) : (price10 ? Math.round(price10 * 0.60) : null),
    10: price10 || null,
  };
  const amountNgn = priceMap[packageSize];
  if (!amountNgn) return NextResponse.json({ error: "This package size is not available for this template" }, { status: 422 });

  // FX rate for USD payments
  let usdToNgn = 1600;
  if (currency === "USD") {
    try {
      const fxRes = await fetch("https://open.er-api.com/v6/latest/USD");
      if (fxRes.ok) {
        const fxData = await fxRes.json();
        if (fxData?.rates?.NGN > 100) usdToNgn = fxData.rates.NGN;
      }
    } catch { /* use fallback */ }
  }

  // 8. User email for Paystack — query auth.users directly via the postgres client
  const [userRow] = await sql`SELECT email FROM auth.users WHERE id = ${userId}`;
  const userEmail = (userRow?.email as string | undefined) ?? "";

  // 9. Create shoot, slots, identity refs, and purchase record
  // This mirrors the structure in /api/marketplace/[id]/book/route.ts exactly so the
  // existing Paystack webhook can route and process the payment confirmation unchanged.
  const now = new Date();
  const shootId = crypto.randomUUID();
  const purchaseId = crypto.randomUUID();

  const platformFeeNgn = 15000;
  const creatorPayoutNgn = amountNgn - platformFeeNgn;
  const estimatedPaystackFeeNgn = Math.min(Math.ceil(amountNgn * 0.015), 2000);
  const safeCreatorPayout = Math.max(0, Math.min(creatorPayoutNgn, amountNgn - estimatedPaystackFeeNgn - 50));

  const [shootRow] = await sql`
    INSERT INTO shoots
      (id, user_id, owner_email, mode, aspect_ratio, currency, package_size, status,
       progress, quote, identity_profile, shot_type, role_prompt, template_id, created_at, updated_at)
    VALUES (
      ${shootId}, ${userId}, ${userEmail},
      ${template.shoot_mode ?? "advanced"}, ${template.aspect_ratio ?? "4:5"},
      ${currency}, ${packageSize}, 'PENDING_PAYMENT',
      0, ${JSON.stringify({ text: "", attribution: "" })}::jsonb,
      '', ${null}, ${null}, ${templateId}, ${now}, ${now}
    )
    RETURNING id
  `.catch(err => { console.error("[siri/quick-shoot] shoot insert:", err); return [null]; });

  if (!shootRow) return NextResponse.json({ error: "Failed to create shoot record" }, { status: 500 });

  // shoot_images slots — one per package image
  const slots = Array.from({ length: packageSize }, (_, i) => ({
    id: crypto.randomUUID(),
    shoot_id: shootId,
    user_id: userId,
    slot: i + 1,
    kind: i < 8 ? "portrait" : i === 8 ? "mood" : "quote",
    status: "PENDING",
    created_at: now,
    updated_at: now,
  }));
  await sql`INSERT INTO shoot_images ${sql(slots)}`;

  // shoot_references — identity images
  const identityRefs = identityImages.map((img, i) => ({
    id: crypto.randomUUID(),
    shoot_id: shootId,
    user_id: userId,
    purpose: "identity",
    tag: null,
    custom_name: null,
    note: null,
    name: (img.name as string) ?? `identity-${i + 1}`,
    type: (img.type as string) ?? "image/jpeg",
    size: (img.size as number) ?? 1,
    storage_bucket: img.storage_bucket as string,
    storage_path: img.storage_path as string,
    created_at: now,
  }));
  await sql`INSERT INTO shoot_references ${sql(identityRefs)}`;

  // template_purchases — the webhook handler looks up this table on charge.success
  await sql`
    INSERT INTO template_purchases
      (id, template_id, shoot_id, user_id, amount_ngn, platform_fee_ngn, creator_payout_ngn,
       coupon_id, coupon_discount_ngn, currency, amount_usd, status, created_at)
    VALUES (
      ${purchaseId}, ${templateId}, ${shootId}, ${userId}, ${amountNgn}, ${platformFeeNgn},
      ${creatorPayoutNgn}, ${null}, 0, ${currency},
      ${currency === "USD" ? parseFloat((amountNgn / usdToNgn).toFixed(2)) : null},
      'pending', ${now}
    )
  `;

  // 10. Initialize Paystack checkout
  const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: userEmail,
      amount: currency === "USD" ? Math.ceil((amountNgn / usdToNgn) * 100) : amountNgn * 100,
      currency,
      callback_url: `${SITE_URL}/studio`,
      metadata: {
        type: "template_purchase",    // required by webhook handler for routing
        template_id: templateId,
        purchase_id: purchaseId,
        shoot_id: shootId,
        user_id: userId,
        via_siri: true,
      },
      split: safeCreatorPayout > 0 ? {
        type: "flat",
        bearer_type: "account",
        subaccounts: [{ subaccount: template.cr_subaccount, share: safeCreatorPayout * 100 }],
      } : undefined,
    }),
  });

  const paystackData = await paystackRes.json();
  if (!paystackData.status) {
    // Rollback in insertion order
    await sql`DELETE FROM template_purchases WHERE id = ${purchaseId}`;
    await sql`DELETE FROM shoot_references WHERE shoot_id = ${shootId}`;
    await sql`DELETE FROM shoot_images WHERE shoot_id = ${shootId}`;
    await sql`DELETE FROM shoots WHERE id = ${shootId}`;
    return NextResponse.json({ error: "Payment initialization failed" }, { status: 502 });
  }

  await sql`
    UPDATE template_purchases SET paystack_reference = ${paystackData.data.reference}
    WHERE id = ${purchaseId}
  `;

  const checkoutUrl = paystackData.data.authorization_url as string;

  // 11. Store idempotency key + update token last_used_at
  await sql`
    INSERT INTO siri_idempotency_keys (key, shoot_id, checkout_url)
    VALUES (${idempotencyKey}, ${shootId}, ${checkoutUrl})
    ON CONFLICT (key) DO NOTHING
  `;
  await sql`UPDATE shortcut_tokens SET last_used_at = ${now} WHERE id = ${dbToken.id}`;

  return NextResponse.json({
    checkoutUrl,
    shootId,
    templateTitle: template.title as string,
    imageCount: packageSize,
  });
}
