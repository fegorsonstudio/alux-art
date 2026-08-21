#!/usr/bin/env node
/**
 * Watches for customers the system has quietly failed, and says so on Telegram.
 *
 * Written after a customer paid for two images and heard nothing for hours. Her
 * shoot was finished the whole time; the delivery poller simply could not see
 * her. Nobody knew until she complained, and at that scale a complaint is a
 * workable alarm. At a hundred customers it is not.
 *
 * Four things are worth waking someone for. Everything else is noise:
 *
 *   1. finished and paid, but the chat was never told
 *   2. generation running far longer than it ever legitimately takes
 *   3. failed, with money against it
 *   4. the delivery poller itself has stopped running
 *
 * Alerts are de-duplicated through a state file, the same way
 * scripts/telegram-poster.mjs remembers what it has posted, so one stuck shoot
 * produces one message rather than one every ten minutes for a week.
 *
 *   node --env-file=.env.local scripts/whatsapp-watchdog.mjs
 */

import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import postgres from "postgres";

const STATE = "/home/aluxart/watchdog-state.json";
const DELIVER_LOG = "/home/aluxart/whatsapp-deliver.log";

// Generation is quoted to buyers as "up to 60 minutes". Ninety is past any
// honest reading of that, so it means stuck, not slow.
const STALL_MINUTES = 90;
// The poller runs every 2 minutes; 20 is ten missed chances, not a blip.
const UNDELIVERED_MINUTES = 20;
// Silence longer than this from the poller means the cron itself is down.
const POLLER_SILENT_MINUTES = 30;

function env() {
  const out = {};
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const E = env();
const sql = postgres(E.DATABASE_URL, { ssl: false });

function loadState() {
  try { return existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {}; }
  catch { return {}; }
}
function saveState(s) {
  try { writeFileSync(STATE, JSON.stringify(s, null, 2)); }
  catch (e) { console.error("could not write state:", e.message); }
}

async function tellAdmin(text) {
  const token = E.TELEGRAM_BOT_TOKEN, chat = E.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !chat) { console.error("no telegram credentials"); return false; }
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true }),
    }).then(x => x.json());
    if (!r?.ok) console.error("telegram refused:", JSON.stringify(r).slice(0, 200));
    return Boolean(r?.ok);
  } catch (e) {
    console.error("telegram threw:", e.message);
    return false;
  }
}

const state = loadState();
const alerts = [];

/** Raise once per key, ever. */
function once(key, text) {
  if (state[key]) return;
  alerts.push({ key, text });
}

// ── 1. Finished, paid, and the customer was never told ──────────────────────
// Only shoots a live chat still points at: those are the ones the poller could
// have delivered and did not. An older shoot whose session has moved on is
// history, not a live failure.
const undelivered = await sql`
  SELECT sh.id, sh.status, s.customer_phone,
         round(EXTRACT(EPOCH FROM (NOW() - sh.updated_at)) / 60) AS mins
  FROM shoots sh
  JOIN whatsapp_sessions s ON s.shoot_id = sh.id
  WHERE sh.status = 'COMPLETE'
    AND sh.wa_delivered_at IS NULL
    AND sh.updated_at < NOW() - (${UNDELIVERED_MINUTES} * interval '1 minute')
    AND sh.updated_at > NOW() - interval '7 days'`;

for (const r of undelivered) {
  once(`undelivered:${r.id}`,
    `⚠ <b>Paid customer never received their photos</b>\n\n` +
    `Customer: <code>+${r.customer_phone}</code>\n` +
    `Shoot: <code>${r.id}</code>\n` +
    `Finished ${r.mins} minutes ago and still not sent.\n\n` +
    `The delivery poller should have handled this. Check ${DELIVER_LOG}.`);
}

// ── 2. Generation that has run far too long ─────────────────────────────────
const stalled = await sql`
  SELECT sh.id, sh.status, s.customer_phone,
         round(EXTRACT(EPOCH FROM (NOW() - sh.created_at)) / 60) AS mins,
         (SELECT count(*)::int FROM shoot_images i WHERE i.shoot_id = sh.id AND i.status = 'COMPLETE') AS done,
         (SELECT count(*)::int FROM shoot_images i WHERE i.shoot_id = sh.id) AS total
  FROM shoots sh
  LEFT JOIN whatsapp_sessions s ON s.shoot_id = sh.id
  WHERE sh.status IN ('QUEUED', 'PROCESSING', 'BASE_LOCKING')
    AND sh.created_at < NOW() - (${STALL_MINUTES} * interval '1 minute')
    -- Anything older than a day is dead debris, not a customer waiting. The
    -- first run found four abandoned shoots between 46 and 91 days old; paging
    -- someone about those teaches them to ignore the alerts that matter.
    AND sh.created_at > NOW() - interval '24 hours'`;

for (const r of stalled) {
  once(`stalled:${r.id}`,
    `⚠ <b>Shoot stuck in ${r.status}</b>\n\n` +
    (r.customer_phone ? `Customer: <code>+${r.customer_phone}</code>\n` : "From the website, not WhatsApp\n") +
    `Shoot: <code>${r.id}</code>\n` +
    `Running ${r.mins} minutes — ${r.done}/${r.total} images done.\n\n` +
    `Normal is under 60. This one is not moving.`);
}

// ── 3. Failed, with money against it ────────────────────────────────────────
// Money for a marketplace booking lives in template_purchases, not payments —
// that is the only table carrying the creator payout split, and every WhatsApp
// shoot is a marketplace booking. An inner join on payments alone made this,
// the most important alert here, blind to the entire revenue path it exists to
// protect.
const failedPaid = await sql`
  SELECT sh.id, s.customer_phone,
         COALESCE(tp.paystack_reference, p.provider_reference) AS ref,
         COALESCE(tp.amount_ngn, p.amount_ngn) AS amount,
         round(EXTRACT(EPOCH FROM (NOW() - sh.updated_at)) / 60) AS mins
  FROM shoots sh
  LEFT JOIN template_purchases tp ON tp.shoot_id = sh.id AND tp.status = 'success'
  LEFT JOIN payments p           ON p.shoot_id  = sh.id AND p.status  = 'success'
  LEFT JOIN whatsapp_sessions s  ON s.shoot_id  = sh.id
  WHERE sh.status = 'FAILED'
    AND (tp.id IS NOT NULL OR p.id IS NOT NULL)
    -- A comped shoot failing is a bug to fix, not money to give back. This
    -- alert says "refund them today", so it must only fire when there is
    -- something to refund.
    AND COALESCE(tp.amount_ngn, p.amount_ngn, 0) > 0
    AND sh.updated_at > NOW() - interval '7 days'`;

for (const r of failedPaid) {
  once(`failedpaid:${r.id}`,
    `🔴 <b>Someone paid and got nothing</b>\n\n` +
    (r.customer_phone ? `Customer: <code>+${r.customer_phone}</code>\n` : "") +
    `Shoot: <code>${r.id}</code>\n` +
    `Paid: ₦${Number(r.amount ?? 0).toLocaleString("en-NG")} — <code>${r.ref}</code>\n` +
    `Failed ${r.mins} minutes ago.\n\n` +
    `They need a refund or a re-run today.`);
}

// ── 4. The delivery poller itself ───────────────────────────────────────────
// The poller only writes to its log when it does something, so an old file is
// normal. An old file combined with work waiting is not.
// "Waiting" has to mean work the poller could actually pick up — a session in
// one of the two states it watches. A shoot whose chat has already moved on is
// undelivered but not evidence of a dead cron, and calling it one sends someone
// to check a service that is running perfectly.
const pollerWork = await sql`
  SELECT count(*)::int AS n
  FROM whatsapp_sessions s
  JOIN shoots sh ON sh.id = s.shoot_id
  JOIN creators c ON c.id = s.creator_id
  WHERE sh.wa_delivered_at IS NULL
    AND c.whatsapp_access_token IS NOT NULL
    AND s.state IN ('AWAITING_PAYMENT', 'GENERATING')`;

try {
  if (existsSync(DELIVER_LOG) && Number(pollerWork[0].n) > 0) {
    const idleMins = (Date.now() - statSync(DELIVER_LOG).mtimeMs) / 60000;
    if (idleMins > POLLER_SILENT_MINUTES) {
      once(`poller:${new Date().toISOString().slice(0, 13)}`,
        `🔴 <b>The delivery poller looks dead</b>\n\n` +
        `${pollerWork[0].n} shoot(s) waiting on it, and it has not logged anything ` +
        `for ${Math.round(idleMins)} minutes.\n\n` +
        `Check: <code>crontab -l | grep whatsapp-deliver</code>`);
    }
  }
} catch (e) {
  console.error("could not check the poller log:", e.message);
}

// ── Send, and remember ──────────────────────────────────────────────────────
let sent = 0;
for (const a of alerts) {
  if (await tellAdmin(a.text)) {
    // Only remembered once it has actually been delivered, so a Telegram
    // outage does not silently swallow the one alert that mattered.
    state[a.key] = new Date().toISOString();
    sent++;
  }
}

// Forget keys older than 30 days so the file cannot grow without limit.
const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
for (const [k, v] of Object.entries(state)) {
  if (new Date(v).getTime() < cutoff) delete state[k];
}
saveState(state);

console.log(JSON.stringify({
  ok: true,
  undelivered: undelivered.length,
  stalled: stalled.length,
  failedPaid: failedPaid.length,
  alertsSent: sent,
}));

await sql.end();
