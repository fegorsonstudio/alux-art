#!/usr/bin/env node
/**
 * projections.mjs — Alux Art financial projections, as an A4 PDF.
 *
 *   node scripts/deck/projections.mjs
 *
 * Two rules this document follows, because a funding application that breaks
 * either one does not survive due diligence:
 *
 *   1. Actuals and projections are never mixed. The actuals block is what the
 *      database and the bank statement say. Everything after it is labelled a
 *      projection, on the page, in the heading.
 *   2. Every assumption states its basis.
 *
 * THE TWO PRODUCTS — do not collapse them into one, as an earlier draft did.
 *
 *   Direct shoots. Alux Art's own prices, held in app_config as price_1_ngn /
 *   price_5_ngn / price_10_ngn = 2,000 / 9,000 / 15,000. There is no creator in
 *   the transaction, so ALL of it is platform revenue. 161 of 226 shoots to date,
 *   and every naira ever received.
 *
 *   Marketplace templates. The creator sets the price; the platform keeps a fee
 *   derived from app_config.platform_fee_ngn (5,000 on a 10-image booking, scaled
 *   by package size, so ~600 on a 1-image). 65 shoots to date and ZERO paid — the
 *   creator revenue line is entirely unproven, so it is deliberately excluded from
 *   the model and shown as upside instead.
 *
 * The one genuine estimate is generation cost per image; it is marked as an
 * estimate and the risk section says what happens if it is wrong.
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "..", "out", "deck");

const INK = "#10231b", BODY = "#33453e", MUTED = "#6d7f78";
const MINT = "#1f8f77", RULE = "#dfe7e3", WASH = "#f3f8f6", WARN = "#a8503c";

const ngn = (n) =>
  (n < 0 ? "-₦" : "₦") + Math.round(Math.abs(n)).toLocaleString("en-NG");

/* ---------------------------------------------------------------- actuals */
// Verified 9 August 2026: production database + Moniepoint statement.
const PRICE = { one: 2000, five: 9000, ten: 15000 };   // app_config, direct shoots

const ACTUAL = {
  started: "29 May 2026",
  images: 877, templates: 21, creators: 10, users: 18,
  revenue: 11600, payingCustomers: 4, payments: 8,
  shoots: 226,
  direct: { one: 81, five: 31, ten: 49 },              // 161 shoots, all revenue
  marketplace: { shoots: 65, paid: 0 },
};
const DIRECT_TOTAL = ACTUAL.direct.one + ACTUAL.direct.five + ACTUAL.direct.ten;

/* ------------------------------------------------------------ assumptions */
// Blended from the observed direct package mix, not from a favourite price:
//   (81*2000 + 31*9000 + 49*15000) / 161
const AOV_TODAY = Math.round(
  (ACTUAL.direct.one * PRICE.one + ACTUAL.direct.five * PRICE.five +
   ACTUAL.direct.ten * PRICE.ten) / DIRECT_TOTAL);
// Images actually generated per booking, same mix: (81*1 + 31*5 + 49*10) / 161
const IMAGES_PER_BOOKING = +(
  (ACTUAL.direct.one + ACTUAL.direct.five * 5 + ACTUAL.direct.ten * 10) / DIRECT_TOTAL
).toFixed(2);

const A = {
  aovToday: AOV_TODAY,
  aovMonth12: 8500,          // assumes the 5- and 10-image share keeps growing
  costPerImage: 150,         // ESTIMATE: fal generation + retries + upscale + storage
  imagesPerBooking: IMAGES_PER_BOOKING,
  retryAllowance: 1.09,      // failed slots that get regenerated
  gatewayRate: 0.015,        // Paystack, capped at 2000 per transaction
  fx: 1550,                  // NGN per USD, stated so USD readers can convert
  startBookings: 25,         // month 1. See the risk note: only 8 have ever paid.
  marketingFloor: 60000,     // NGN/month baseline ad spend
  marketingPerBooking: 400,  // NGN of paid acquisition per incremental booking
};

const SCENARIOS = [
  { key: "conservative", label: "Conservative", growth: 0.20 },
  { key: "base", label: "Base case", growth: 0.35 },
  { key: "ambitious", label: "Ambitious", growth: 0.50 },
];

const MONTHS = ["Sep 26","Oct 26","Nov 26","Dec 26","Jan 27","Feb 27",
                "Mar 27","Apr 27","May 27","Jun 27","Jul 27","Aug 27"];

/** One month of the model. Kept pure so the scenarios cannot drift apart.
 *  Direct shoots only: there is no creator payout line, because there is no
 *  creator in the transaction. Marketplace bookings are treated as upside. */
function month(i, growth) {
  const bookings = Math.round(A.startBookings * Math.pow(1 + growth, i));
  // Order value drifts from today's toward the month-12 figure, linearly.
  const aov = Math.round(A.aovToday + (A.aovMonth12 - A.aovToday) * (i / 11));
  const revenue = bookings * aov;
  const generation = bookings * A.imagesPerBooking * A.retryAllowance * A.costPerImage;
  const gateway = Math.min(revenue * A.gatewayRate, bookings * 2000);
  const marketing = A.marketingFloor + bookings * A.marketingPerBooking;
  const net = revenue - generation - gateway - marketing;
  return { m: MONTHS[i], bookings, aov, revenue, generation, gateway, marketing, net };
}

const run = (growth) => MONTHS.map((_, i) => month(i, growth));
const sum = (rows, k) => rows.reduce((t, r) => t + r[k], 0);

const base = run(0.35);
const results = SCENARIOS.map(s => {
  const rows = run(s.growth);
  const net = sum(rows, "net");
  const loss = rows.findIndex(r => r.net <= 0);
  return { ...s, rows, revenue: sum(rows, "revenue"), net,
           allProfitable: loss === -1,
           exitBookings: rows[11].bookings,
           exitRevenue: rows[11].revenue };
});

/* ----------------------------------------------------------------- markup */
const money = (n) => n < 0 ? `(${ngn(-n)})` : ngn(n);

const row = (r) => `<tr>
  <td class="m">${r.m}</td>
  <td>${r.bookings.toLocaleString()}</td>
  <td>${ngn(r.aov)}</td>
  <td class="hi">${ngn(r.revenue)}</td>
  <td>${ngn(r.generation)}</td>
  <td>${ngn(r.gateway)}</td>
  <td>${ngn(r.marketing)}</td>
  <td class="${r.net < 0 ? "neg" : "pos"}">${money(r.net)}</td>
</tr>`;

const totals = (rows) => `<tr class="tot">
  <td class="m">12-month total</td>
  <td>${sum(rows, "bookings").toLocaleString()}</td>
  <td></td>
  <td class="hi">${ngn(sum(rows, "revenue"))}</td>
  <td>${ngn(sum(rows, "generation"))}</td>
  <td>${ngn(sum(rows, "gateway"))}</td>
  <td>${ngn(sum(rows, "marketing"))}</td>
  <td class="${sum(rows, "net") < 0 ? "neg" : "pos"}">${money(sum(rows, "net"))}</td>
</tr>`;

const html = `
<h1>Alux Art — Financial Projections</h1>
<p class="stamp">Prepared 9 August 2026 · all figures in Nigerian Naira · ${ngn(A.fx)} = US$1</p>

<div class="callout">
  <b>Read this first.</b> Only the "Where we are today" block below is actual, measured
  performance. Everything after it is a <b>projection</b> built from the assumptions on
  this page. It has not happened. The assumptions are listed so you can disagree with
  them individually rather than with the total.
</div>

<h2>The two products</h2>
<table class="kv wide">
  <tr><td>Direct shoots</td><td><b>${ngn(PRICE.one)} / ${ngn(PRICE.five)} / ${ngn(PRICE.ten)}</b></td>
      <td>Alux Art's own prices for 1, 5 and 10 photos. No creator is involved, so the whole amount
      is revenue. <b>${DIRECT_TOTAL} of ${ACTUAL.shoots} shoots, and every naira ever received.</b>
      This is the business the projection models.</td></tr>
  <tr><td>Marketplace templates</td><td><b>creator-priced</b></td>
      <td>The photographer sets the price and keeps most of it; Alux Art keeps a fee
      (${ngn(5000)} on a 10-image booking, scaled down by package size). ${ACTUAL.marketplace.shoots} shoots
      so far and <b>${ACTUAL.marketplace.paid} of them paid</b>, so this line earns nothing in the model
      and is treated as upside, not income.</td></tr>
</table>

<h2>Where we are today (actual)</h2>
<table class="kv">
  <tr><td>Trading since</td><td>${ACTUAL.started} (10 weeks)</td></tr>
  <tr><td>Revenue received</td><td><b>${ngn(ACTUAL.revenue)}</b> across ${ACTUAL.payments} payments from ${ACTUAL.payingCustomers} paying customers</td></tr>
  <tr><td>Shoots booked</td><td>${ACTUAL.shoots} (${DIRECT_TOTAL} direct, ${ACTUAL.marketplace.shoots} marketplace) — the platform ran free during testing</td></tr>
  <tr><td>Direct package mix</td><td>${ACTUAL.direct.one} × 1-photo · ${ACTUAL.direct.five} × 5-photo · ${ACTUAL.direct.ten} × 10-photo</td></tr>
  <tr><td>Images generated</td><td>${ACTUAL.images}</td></tr>
  <tr><td>Published templates</td><td>${ACTUAL.templates}, all built in-house so far; ${ACTUAL.creators} photographers have joined the creators academy</td></tr>
  <tr><td>Registered customers</td><td>${ACTUAL.users}</td></tr>
</table>
<p class="fine">Revenue is small because pricing was switched on only in July, after ten weeks of
deliberately free testing. The question being answered in that period was whether anyone would
book at all, not what they would pay.</p>

<h2>Assumptions, and where each one comes from</h2>
<table class="kv wide">
  <tr><td>Average order value, today</td><td><b>${ngn(A.aovToday)}</b></td>
      <td>Blended from the actual direct package mix above at the prices in <code>app_config</code>,
      not from a chosen headline price.</td></tr>
  <tr><td>Average order value, month 12</td><td><b>${ngn(A.aovMonth12)}</b></td>
      <td>Assumes the 5- and 10-photo share keeps growing. Moved linearly across the twelve months;
      it is the single softest assumption here.</td></tr>
  <tr><td>Generation cost per image</td><td><b>${ngn(A.costPerImage)}</b> <span class="est">estimate</span></td>
      <td>The image model call, upscaling and storage. Not yet metered per shoot in production;
      see the risk note below.</td></tr>
  <tr><td>Images per booking</td><td><b>${A.imagesPerBooking}</b> <span class="est">+${Math.round((A.retryAllowance - 1) * 100)}% retries</span></td>
      <td>The observed direct package mix, plus an allowance for failed slots that get regenerated
      at our cost, not the customer's.</td></tr>
  <tr><td>Payment processing</td><td><b>${(A.gatewayRate * 100).toFixed(1)}%</b></td>
      <td>Paystack's Nigerian card rate, capped at ${ngn(2000)} per transaction.</td></tr>
  <tr><td>Marketing</td><td><b>${ngn(A.marketingFloor)}/mo + ${ngn(A.marketingPerBooking)}/booking</b></td>
      <td>The organic channels (three automated Instagram accounts, the creators academy) cost
      nothing to run; this line is paid acquisition on top.</td></tr>
  <tr><td>Growth</td><td><b>20% / 35% / 50%</b> per month</td>
      <td>Three scenarios rather than one number. Month 1 starts at ${A.startBookings} paid bookings
      against ${ACTUAL.payments} payments received to date — the largest single leap in this model.</td></tr>
</table>

<h2>Unit economics of one booking (at today's prices)</h2>
<table class="grid">
  <thead><tr><th class="m">Package</th><th>Customer pays</th><th>Generation</th>
    <th>Card fee</th><th class="hi">Contribution</th><th>Margin</th></tr></thead>
  <tbody>${[["1 photo", PRICE.one, 1], ["5 photos", PRICE.five, 5], ["10 photos", PRICE.ten, 10]]
    .map(([lbl, price, imgs]) => {
      const gen = imgs * A.retryAllowance * A.costPerImage;
      const fee = Math.min(price * A.gatewayRate, 2000);
      const c = price - gen - fee;
      return `<tr><td class="m">${lbl}</td><td>${ngn(price)}</td><td>${ngn(gen)}</td>
        <td>${ngn(fee)}</td><td class="hi">${ngn(c)}</td><td>${Math.round(c / price * 100)}%</td></tr>`;
    }).join("")}</tbody>
</table>
<p class="fine">Contribution is what is left before marketing and overheads. Every package clears the
${ngn(A.marketingPerBooking)} of paid acquisition assumed in the model, so growth can be bought
rather than only waited for.</p>

<div class="break"></div>

<h2>Base case — 35% monthly growth (projection)</h2>
<table class="grid">
  <thead><tr>
    <th class="m">Month</th><th>Bookings</th><th>Avg order</th>
    <th class="hi">Revenue</th><th>Generation</th><th>Card fees</th>
    <th>Marketing</th><th>Net</th>
  </tr></thead>
  <tbody>${base.map(row).join("")}${totals(base)}</tbody>
</table>
<p class="fine">Direct shoots only. There is no creator payout line because there is no creator in
these transactions; marketplace bookings would add revenue on top and are excluded. Figures in
brackets are losses.</p>

<h2>All three scenarios (projection)</h2>
<table class="grid">
  <thead><tr>
    <th class="m">Scenario</th><th>Monthly growth</th><th>Bookings in month 12</th>
    <th>Revenue in month 12</th><th class="hi">Revenue, year 1</th>
    <th>Net, year 1</th><th>Profitable every month?</th>
  </tr></thead>
  <tbody>${results.map(s => `<tr>
    <td class="m">${s.label}</td>
    <td>${(s.growth * 100).toFixed(0)}%</td>
    <td>${s.exitBookings.toLocaleString()}</td>
    <td>${ngn(s.exitRevenue)}</td>
    <td class="hi">${ngn(s.revenue)}</td>
    <td class="${s.net < 0 ? "neg" : "pos"}">${money(s.net)}</td>
    <td>${s.allProfitable ? "Yes" : "No"}</td>
  </tr>`).join("")}</tbody>
</table>

<h2>What would break this model</h2>
<ol class="risks">
  <li><b>The number of paying customers, not the margin.</b> The margins above are healthy, so the
  model lives or dies on volume. It assumes ${A.startBookings} paid bookings in month one against
  ${ACTUAL.payments} payments received in total so far. That single leap is the biggest assumption in
  this document, and it is the one to interrogate first.</li>

  <li><b>The marketplace has never earned a naira.</b> ${ACTUAL.marketplace.shoots} shoots have been
  booked through creator templates and ${ACTUAL.marketplace.paid} were paid for. The creator side is
  live and used, but as a revenue line it is unproven, which is why it contributes nothing above.</li>

  <li><b>A shift toward marketplace bookings would lower revenue per booking, not raise it.</b> A
  direct 10-photo shoot brings in ${ngn(PRICE.ten)}; the same customer booking a creator's template
  brings in the ${ngn(5000)} fee instead. Growing the marketplace is right for supply and reach, but
  it dilutes revenue per booking until volume makes up the difference.</li>

  <li><b>Generation cost is estimated, not metered.</b> Per-shoot cost is not recorded anywhere in the
  database. At ${ngn(A.costPerImage)} per image it is comfortably covered; at three times that, the
  1-photo package stops being worth selling. Metering it is the first thing to build with any funding.</li>

  <li><b>All ${ACTUAL.templates} published templates are still built in-house.</b>
  ${ACTUAL.creators} photographers have joined the creators academy and one has a template in
  progress. Until they publish, the catalogue grows only as fast as one person can build it.</li>

  <li><b>Seasonality is not modelled.</b> Real demand spikes around Call to Bar, convocation,
  induction and December. Smooth monthly growth understates those peaks and overstates the quiet
  months between them.</li>
</ol>

<p class="foot">Alux Art · aluxartandframes.shop · @fegorson_studio · Abuja, Nigeria<br>
support@aluxartandframes.shop · fegorsonphotography@gmail.com · +234 813 786 1670</p>
`;

const css = `
  @page { size: A4; margin: 17mm 15mm 15mm; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Outfit',system-ui,sans-serif; color:${BODY}; font-size:9.6pt; line-height:1.5; }
  h1 { font-size:22pt; color:${INK}; font-weight:700; letter-spacing:-.02em; }
  h2 { font-size:12.5pt; color:${INK}; font-weight:700; margin:20px 0 9px;
       padding-bottom:5px; border-bottom:2px solid ${MINT}; break-after:avoid; }
  .stamp { color:${MUTED}; font-size:8.6pt; margin-top:3px; }
  .callout { background:${WASH}; border:1px solid ${RULE}; border-radius:7px;
             padding:11px 14px; margin:16px 0 4px; font-size:9.2pt; color:${INK}; }
  table { width:100%; border-collapse:collapse; margin-bottom:4px; }
  .kv td { padding:5px 9px; border-bottom:1px solid ${RULE}; vertical-align:top; }
  .kv td:first-child { width:170px; color:${INK}; font-weight:600; }
  .kv.wide td:nth-child(2) { width:118px; }
  .kv.wide td:nth-child(3) { color:${MUTED}; font-size:8.8pt; }
  code { font-family:ui-monospace,Menlo,Consolas,monospace; font-size:8.4pt;
         background:${WASH}; padding:1px 4px; border-radius:3px; }
  .est { color:${WARN}; font-size:7.8pt; text-transform:uppercase; letter-spacing:.08em; }
  .grid { font-size:8.5pt; }
  .grid th { background:${INK}; color:#fff; font-weight:600; text-align:right;
             padding:7px 7px; font-size:8pt; }
  .grid th.m, .grid td.m { text-align:left; }
  .grid th.hi { background:${MINT}; }
  .grid td { padding:5px 7px; text-align:right; border-bottom:1px solid ${RULE}; }
  .grid td.m { font-weight:600; color:${INK}; }
  .grid td.hi { color:${MINT}; font-weight:700; }
  .grid tr:nth-child(even) td { background:${WASH}; }
  .grid .tot td { border-top:2px solid ${INK}; border-bottom:none; font-weight:700; color:${INK};
                  background:#fff !important; }
  .pos { color:${MINT}; font-weight:600; }
  .neg { color:${WARN}; }
  .fine { font-size:8.5pt; color:${MUTED}; margin-top:6px; }
  .risks { margin:4px 0 0 17px; }
  .risks li { margin-bottom:8px; padding-left:3px; }
  .risks b { color:${INK}; }
  .break { break-before:page; }
  .foot { margin-top:22px; padding-top:8px; border-top:1px solid ${RULE};
          color:${MUTED}; font-size:8.2pt; }
`;

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const doc = `<!doctype html><html><head><meta charset="utf-8">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap" rel="stylesheet">
    <style>${css}</style></head><body>${html}</body></html>`;

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(doc, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1000);

  const out = join(OUT_DIR, "Alux-Art-Financial-Projections.pdf");
  await page.pdf({
    path: out, format: "A4", printBackground: true,
    margin: { top: "17mm", bottom: "15mm", left: "15mm", right: "15mm" },
    displayHeaderFooter: true,
    headerTemplate: `<div></div>`,
    footerTemplate: `<div style="width:100%;font-size:7.5pt;color:${MUTED};
      font-family:sans-serif;padding:0 15mm;display:flex;justify-content:space-between;">
      <span>Alux Art — financial projections, not results</span>
      <span class="pageNumber"></span></div>`,
  });
  // A PNG proof too: there is no PDF viewer on this machine, and a projections
  // document with a broken table is worse than no document.
  await page.setViewportSize({ width: 794, height: 1123 });   // A4 at 96dpi
  const png = join(OUT_DIR, "projections-proof.png");
  await page.screenshot({ path: png, fullPage: true });

  await browser.close();

  console.log(`PDF:   ${out}`);
  console.log(`Proof: ${png}`);
  for (const s of results) {
    console.log(`  ${s.label.padEnd(13)} exit ${String(s.exitBookings).padStart(5)} bookings/mo · ` +
      `revenue ${ngn(s.revenue).padStart(13)} · net ${ngn(s.net).padStart(13)} · ` +
      `profitable every month: ${s.allProfitable ? "yes" : "no"}`);
  }
}

main().catch((e) => { console.error("projections error:", e); process.exitCode = 1; });
