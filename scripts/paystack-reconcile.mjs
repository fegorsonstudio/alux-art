/**
 * Catches payments the webhook missed.
 *
 * The webhook is currently the ONLY path that can confirm a payment, and
 * payment_events is empty — no Paystack webhook has ever been processed. Card
 * payments have survived that because the customer stays on the page, but a bank
 * transfer confirms minutes later, after they have closed the tab. If the webhook
 * does not land, that shoot sits in PENDING_PAYMENT forever while the customer
 * has genuinely paid.
 *
 * So this asks Paystack directly. For every pending payment it calls
 * transaction/verify, and where Paystack says success it does exactly what the
 * webhook would have done: mark the payment, queue the shoot, log the event, and
 * fire the generation worker.
 *
 * It is a safety net, not a replacement. The webhook still runs and is still the
 * fast path; this only picks up what the webhook missed, and is safe to run
 * repeatedly because it only ever acts on rows still marked pending.
 *
 *   node --env-file=.env.local scripts/paystack-reconcile.mjs [--dry-run]
 */
import postgres from "postgres";
import crypto from "node:crypto";

const DRY = process.argv.includes("--dry-run");
const KEY = process.env.PAYSTACK_SECRET_KEY;
const SITE = process.env.PUBLIC_SITE_URL || "https://aluxartandframes.shop";
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_ADMIN = process.env.TELEGRAM_ADMIN_CHAT_ID;

// Paystack abandons unfinished transactions, but a slow bank transfer can land
// well after the customer gives up on the page. Two days is generous cover.
const LOOK_BACK_HOURS = 48;

const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });
const log = (...a) => console.log(new Date().toISOString(), "[reconcile]", ...a);

async function tellAdmin(text) {
  if (!TG_TOKEN || !TG_ADMIN) return;
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TG_ADMIN, text, parse_mode: "HTML", disable_web_page_preview: true }),
  }).catch(() => {});
}

async function main() {
  if (!KEY) { log("PAYSTACK_SECRET_KEY missing — cannot verify anything"); return; }

  const pending = await sql`
    SELECT p.id, p.provider_reference AS ref, p.shoot_id, p.amount_ngn, p.user_id,
           s.status AS shoot_status, s.owner_email
    FROM payments p
    LEFT JOIN shoots s ON s.id = p.shoot_id
    WHERE p.status = 'pending'
      AND p.provider_reference IS NOT NULL
      AND p.created_at > NOW() - (${LOOK_BACK_HOURS} || ' hours')::interval
    ORDER BY p.created_at DESC`;

  log(`${pending.length} pending payment(s) in the last ${LOOK_BACK_HOURS}h`);

  const rescued = [];
  for (const p of pending) {
    const r = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(p.ref)}`, {
      headers: { Authorization: `Bearer ${KEY}` },
    }).then(x => x.json()).catch(e => ({ error: e.message }));

    const status = r?.data?.status;
    if (status !== "success") { log(`${p.ref}: ${status ?? r?.message ?? "unknown"} — leaving alone`); continue; }

    log(`${p.ref}: PAID and never processed — recovering`);
    if (DRY) { rescued.push(`${p.ref} (dry run)`); continue; }

    const now = new Date().toISOString();
    const data = r.data;

    // Exactly what the webhook does, in the same order.
    await sql`UPDATE payments SET status = 'success', paid_at = ${now}, metadata = ${JSON.stringify(data)}
              WHERE id = ${p.id} AND status = 'pending'`;

    // Only queue a shoot still waiting for payment: never restart one already running.
    const [queued] = await sql`
      UPDATE shoots SET status = 'QUEUED', updated_at = ${now}
      WHERE id = ${p.shoot_id} AND status = 'PENDING_PAYMENT' RETURNING id`;

    await sql`INSERT INTO generation_events (id, shoot_id, user_id, type, payload, created_at)
              VALUES (${crypto.randomUUID()}, ${p.shoot_id}, ${p.user_id},
                      'payment_confirmed', ${JSON.stringify({ reference: p.ref, recoveredBy: "reconciler" })}, ${now})`
      .catch(() => {});

    if (queued) {
      await fetch(`${SITE}/api/shoots/${p.shoot_id}/start`, {
        method: "POST", headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "" },
      }).catch(() => {});
      log(`${p.ref}: shoot ${p.shoot_id} queued and worker fired`);
    } else {
      log(`${p.ref}: payment marked paid; shoot was not in PENDING_PAYMENT so it was left as-is`);
    }
    rescued.push(`₦${p.amount_ngn} — ${p.owner_email ?? "?"} (${p.ref})`);
  }

  if (rescued.length) {
    await tellAdmin("💰 <b>Recovered payments the webhook missed</b>\n\n" +
      rescued.map(r => "• " + r).join("\n") +
      "\n\nThese were paid on Paystack but never processed. Their shoots are now running.");
  }

  await marketplace();
  await sql.end();
}

/**
 * Marketplace bookings — the pass this script was missing.
 *
 * Everything above reads `payments`, which only direct studio shoots write.
 * Marketplace bookings — every template, the Gear Equalizer, and everything the
 * Instagram and WhatsApp bots sell — record their payment in
 * template_purchases, which nothing here ever looked at. So a bot customer who
 * paid by bank transfer, whose webhook never landed, would have waited for ever
 * with nobody told.
 *
 * Two jobs:
 *
 *   PAID BUT STILL PENDING — a customer who paid and got nothing. Reported to
 *   the admin at once rather than processed here: the webhook's template path
 *   does more than flip a status (the creator's payout, the sale email, the
 *   coupon count), and copying half of it would be worse than a human pressing
 *   one button.
 *
 *   NEVER PAID, OVER A WEEK OLD — closed as 'abandoned', so it stops reading as
 *   money owed. ONLY the purchase row changes. The shoot stays at
 *   PENDING_PAYMENT, so a payment that does turn up late still goes through
 *   untouched: the webhook and the customer's own "check payment" button both
 *   act on the shoot's status, and update any purchase not already 'success'.
 *
 * The gateway is asked for every row before anything is closed — "never paid"
 * is Paystack's or Flutterwave's answer, not an assumption from age. Flutterwave
 * is included because it is the fallback when Paystack fails, and its webhook
 * failed on every call until 2026-10-06 — exactly the booking this net is for.
 */
const ABANDON_AFTER_DAYS = 7;
/** Each gateway's own words for a transaction that will not complete. */
const NEVER_PAID = new Set(["abandoned", "failed", "reversed", "cancelled", "not found"]);
const FLW_KEY = process.env.FLUTTERWAVE_SECRET_KEY || process.env.FLW_SECRET_KEY;

/** What the gateway that took this booking says happened, as one word. */
async function gatewayStatus(provider, ref) {
  if (provider === "flutterwave") {
    if (!FLW_KEY) return "unknown";
    const r = await fetch(`https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(ref)}`, {
      headers: { Authorization: `Bearer ${FLW_KEY}` },
    }).then(x => x.json()).catch(() => null);
    const s = r?.data?.status ?? (r?.status === "error" ? "not found" : "unknown");
    return s === "successful" ? "success" : s;
  }
  const r = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(ref)}`, {
    headers: { Authorization: `Bearer ${KEY}` },
  }).then(x => x.json()).catch(() => null);
  return r?.data?.status ?? (r?.status === false ? "not found" : "unknown");
}

async function marketplace() {
  const rows = await sql`
    SELECT tp.id, COALESCE(tp.payment_provider, 'paystack') AS provider,
           COALESCE(tp.provider_reference, tp.paystack_reference) AS ref,
           tp.shoot_id, tp.amount_ngn, tp.created_at, s.status AS shoot_status
    FROM template_purchases tp
    LEFT JOIN shoots s ON s.id = tp.shoot_id
    WHERE tp.status = 'pending'
      AND COALESCE(tp.payment_provider, 'paystack') IN ('paystack', 'flutterwave')
      AND tp.created_at < NOW() - INTERVAL '2 hours'
    ORDER BY tp.created_at`;
  if (!rows.length) return;

  const paidMissed = [];
  let closed = 0;
  for (const p of rows) {
    let status = "no reference";
    if (p.ref) {
      status = await gatewayStatus(p.provider, p.ref);
      if (status === "success") {
        paidMissed.push(`₦${p.amount_ngn} via ${p.provider} — shoot ${String(p.shoot_id).slice(0, 8)} (${p.shoot_status ?? "?"}), ref ${p.ref}`);
        continue;
      }
      await new Promise(r => setTimeout(r, 250));
    }
    const ageDays = (Date.now() - new Date(p.created_at).getTime()) / 86_400_000;
    if (ageDays >= ABANDON_AFTER_DAYS && (NEVER_PAID.has(status) || status === "no reference")) {
      if (!DRY) {
        await sql`UPDATE template_purchases SET status = 'abandoned' WHERE id = ${p.id} AND status = 'pending'`;
      }
      closed++;
    }
  }

  log(`marketplace: ${rows.length} pending checked, ${paidMissed.length} paid but unprocessed, ` +
      `${closed} closed as abandoned${DRY ? " (dry run — nothing changed)" : ""}`);
  if (paidMissed.length && !DRY) {
    await tellAdmin("🚨 <b>Paid marketplace bookings that never started</b>\n\n" +
      paidMissed.map(r => "• " + r).join("\n") +
      "\n\nPaystack says these were paid, but the booking is still pending here. " +
      "The customer is waiting — open the shoot in admin and start it.");
  }
}

main().catch(async (e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(new Date().toISOString(), "[reconcile] ERROR:", msg);
  await tellAdmin(`❌ <b>Payment reconciler failed</b>\n\n<code>${msg.slice(0, 300)}</code>\n\nPaid shoots may not be starting.`);
  process.exit(1);
});
