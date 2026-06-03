/**
 * Direct pricing verification — reads from VPS postgres via SSH tunnel.
 * Simulates the booking route math to confirm test price override is active.
 * Run: node test-payment.mjs
 */
import postgres from 'postgres';

// Same DATABASE_URL as the VPS app uses
const DB_URL = 'postgresql://aluxart:aluxart_db_2026@localhost:5432/aluxart';

// NOTE: This only works when run ON the VPS, or via an SSH tunnel.
// To run locally: ssh -L 5433:localhost:5432 root@aluxartandframes.shop
// Then change the URL to postgresql://aluxart:aluxart_db_2026@localhost:5433/aluxart

const sql = postgres(DB_URL, { ssl: false, max: 1 });

// Mirrors lib/types.ts packagePrice()
const MULTIPLIERS = { 1: 0.1, 5: 0.5, 10: 1.0 };
function packagePrice(base, size) {
  return Math.ceil(base * MULTIPLIERS[size]);
}

(async () => {
  try {
    // 1. Read app_config
    const config = await sql`SELECT key, value FROM app_config WHERE key IN ('platform_fee_ngn', 'test_price_per_image_ngn')`;
    const cfg = Object.fromEntries(config.map(r => [r.key, r.value]));
    console.log('app_config:', cfg);

    const basePlatformFee = parseInt(cfg.platform_fee_ngn ?? '15000', 10);
    const testPriceRaw    = cfg.test_price_per_image_ngn;

    if (!testPriceRaw) {
      console.log('\n⚠️  test_price_per_image_ngn is NOT set in app_config');
    } else {
      console.log(`\n✅ Test mode ACTIVE — ₦${testPriceRaw} per image`);
    }

    // 2. Read published templates
    const templates = await sql`
      SELECT id, title, price_1_ngn, price_5_ngn, price_ngn
      FROM templates
      WHERE status = 'published'
      LIMIT 3
    `;

    console.log('\nPublished templates:');
    for (const t of templates) {
      console.log(`  ${t.title} (${t.id})`);
      console.log(`    price_1_ngn: ${t.price_1_ngn}, price_5_ngn: ${t.price_5_ngn}, price_10_ngn: ${t.price_ngn}`);
    }

    // 3. Simulate pricing for each package size
    const template = templates[0];
    if (!template) { console.log('No templates found'); process.exit(1); }

    console.log(`\n--- Simulating booking for "${template.title}" ---`);

    for (const packageSize of [1, 5, 10]) {
      let base = basePlatformFee;
      let p1 = template.price_1_ngn;
      let p5 = template.price_5_ngn;
      let p10 = template.price_ngn;

      if (testPriceRaw) {
        const tp = parseInt(testPriceRaw, 10);
        p1 = tp; p5 = tp * 5; p10 = tp * 10;
        base = Math.max(10, Math.floor(tp * 0.1));
      }

      const priceMap = { 1: p1, 5: p5, 10: p10 };
      const buyerAmount = priceMap[packageSize];
      const platformFee = packagePrice(base, packageSize);
      const creatorPayout = buyerAmount - platformFee;
      const estimatedPaystackFee = Math.min(Math.ceil(buyerAmount * 0.015), 2000);
      const minPlatform = estimatedPaystackFee + 50;
      const safeCreatorPayout = Math.max(0, Math.min(creatorPayout, buyerAmount - minPlatform));

      console.log(`\n  Package: ${packageSize} image(s)`);
      console.log(`    Buyer pays:        ₦${buyerAmount}`);
      console.log(`    Platform fee:      ₦${platformFee}`);
      console.log(`    Creator payout:    ₦${creatorPayout}`);
      console.log(`    Est. Paystack fee: ₦${estimatedPaystackFee}`);
      console.log(`    Safe payout:       ₦${safeCreatorPayout}`);
      console.log(`    Paystack amount:   ₦${buyerAmount} (${buyerAmount * 100} kobo)`);
      console.log(`    Split share:       ₦${safeCreatorPayout} (${safeCreatorPayout * 100} kobo)`);
      console.log(`    Split valid:       ${safeCreatorPayout * 100 < buyerAmount * 100 ? '✅ YES' : '❌ NO (share >= total)'}`);
    }

    console.log('\n--- VERDICT ---');
    if (testPriceRaw) {
      console.log(`✅ Test mode is ACTIVE. Paystack will be initialized for ₦${parseInt(testPriceRaw)} for 1-image bookings.`);
    } else {
      console.log('❌ Test mode is NOT active. Normal template prices will be charged.');
    }
  } finally {
    await sql.end();
  }
})();
