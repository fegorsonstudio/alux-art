#!/usr/bin/env node
/**
 * portfolio.mjs — the Alux Art portfolio, as a PDF.
 *
 *   node scripts/deck/portfolio.mjs
 *
 * Shows what the platform actually produces, pulled live from the public
 * marketplace API rather than from a folder of hand-picked favourites. Re-run it
 * and it reflects whatever is published that day.
 *
 * IMPORTANT — what this may and may not show. Every image here is a template
 * COVER: public marketing art a creator deliberately published to the
 * marketplace. Buyers' delivered portraits are private commissioned work and are
 * never included, no matter how good they look. Do not "improve" this script by
 * pointing it at shoot_images.
 */

import { chromium } from "playwright";
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "..", "out", "deck");
const SITE = process.env.ALUX_SITE || "https://aluxartandframes.shop";

const MINT = "#43ccb2", PAPER = "#fcfefd", MUTED = "#9db0aa";
const BG_CORE = "#143a29", BG_EDGE = "#071711";

const ngn = (n) => (n ? "₦" + Number(n).toLocaleString("en-NG") : "");
const esc = (s) => String(s ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

/**
 * Templates kept out of the portfolio PDF. They stay live on the marketplace;
 * this is about what belongs in a document sent to investors and institutions.
 */
const EXCLUDE = new Map([
  ["850a6027-b934-4c21-b9cc-10ae6dd870bb",
   "cover reproduces a real broadcaster's on-screen branding over a real air-crash " +
   "headline — the news template's own directive forbids real news organisations"],
]);

const CATEGORY_LABEL = {
  asset_extract: "Creator tool", photo_upgrade: "Creator tool",
  nursing_induction: "Induction", call_to_bar: "Call to Bar",
  trending: "Trending", portrait: "Portrait", fashion: "Fashion",
};
const label = (c) => CATEGORY_LABEL[c] ?? String(c ?? "").replace(/_/g, " ");

/** Fetch a cover and shrink it. Full-size covers are 4K; twenty of them would
 *  make a PDF nobody can email. */
async function cover(url) {
  const abs = url.startsWith("http") ? url : SITE + url;
  const res = await fetch(abs);
  if (!res.ok) throw new Error(`${res.status} ${abs}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // "inside" and never "cover": several covers are collages with a strip of
  // sample shots along the bottom, and cropping to a fixed box beheads the
  // subject and slices the strip in half.
  const jpg = await sharp(buf)
    .resize({ width: 700, height: 900, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 84 })
    .toBuffer();
  return `data:image/jpeg;base64,${jpg.toString("base64")}`;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const res = await fetch(`${SITE}/api/marketplace?limit=60`);
  if (!res.ok) throw new Error(`marketplace ${res.status}`);
  const { templates } = await res.json();
  console.log(`${templates.length} published templates`);

  const cards = [];
  for (const t of templates) {
    if (EXCLUDE.has(t.id)) { console.log(`\n  EXCLUDED "${t.title}": ${EXCLUDE.get(t.id)}`); continue; }
    if (!t.coverUrl) { console.log(`\n  skip (no cover): ${t.title}`); continue; }
    try {
      cards.push({ ...t, img: await cover(t.coverUrl) });
      process.stdout.write(".");
    } catch (e) {
      console.log(`\n  skip (${e.message}): ${t.title}`);
    }
  }
  console.log(`\n${cards.length} covers embedded`);
  if (!cards.length) throw new Error("no covers fetched — nothing to show");

  const creators = new Set(cards.map(c => c.creator?.displayName).filter(Boolean));

  const card = (c) => `
    <figure class="card">
      <img src="${c.img}" alt="">
      <figcaption>
        <span class="cat">${esc(label(c.category))}</span>
        <b>${esc(c.title)}</b>
        <span class="by">${esc(c.creator?.displayName ?? "Alux Art")}</span>
        <span class="pr">${ngn(c.price1Ngn)} for one photo · ${ngn(c.priceNgn)} for ten</span>
      </figcaption>
    </figure>`;

  const page1 = `
    <section class="slide intro">
      <div class="rule"></div>
      <p class="eyebrow">Portfolio</p>
      <h1>Every one of these is<br><span class="hl">a shoot you can book.</span></h1>
      <p class="lead">Not concepts. ${cards.length} templates live right now at
      <b>aluxartandframes.shop</b>${creators.size > 1 ? `, from ${creators.size} photographers` : ""}.
      A customer picks one, uploads a few photos of their own face, and receives that shoot in
      minutes.</p>
      <p class="lead">The images on the following pages are the creators' own published cover
      art. Customers' delivered portraits are private commissioned work and are deliberately
      not reproduced here.</p>
      <p class="foot">aluxartandframes.shop · @fegorson_studio · Abuja, Nigeria<br>
      support@aluxartandframes.shop · fegorsonphotography@gmail.com</p>
    </section>`;

  // Four to a page, one row. Two rows cannot fit portrait covers at a size where
  // you can actually judge the work, and judging the work is the entire point.
  // Spread the remainder rather than leaving a last page with one lonely card:
  // 17 covers becomes 4,4,3,3,3 and not 4,4,4,4,1.
  const pageCount = Math.ceil(cards.length / 4);
  const chunks = [];
  for (let p = 0, taken = 0; p < pageCount; p++) {
    const size = Math.ceil((cards.length - taken) / (pageCount - p));
    chunks.push(cards.slice(taken, taken + size));
    taken += size;
  }
  const pages = chunks.map((chunk, i) => `<section class="slide">
      <p class="pagehead">Published templates<span>${i + 1} / ${pageCount}</span></p>
      <div class="grid">${chunk.map(card).join("")}</div>
    </section>`);

  const css = `
    @page { size: 1280px 720px; margin: 0; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Outfit',system-ui,sans-serif; -webkit-font-smoothing:antialiased; }
    .slide { width:1280px; height:720px; padding:44px 56px; overflow:hidden; color:${PAPER};
      background:radial-gradient(circle at 50% 42%, ${BG_CORE} 0%, ${BG_EDGE} 78%);
      page-break-after:always; position:relative; }
    .intro { padding:74px 88px; display:flex; flex-direction:column; justify-content:center; }
    .rule { width:74px; height:5px; background:${MINT}; border-radius:3px; margin-bottom:26px; }
    .eyebrow { color:${MINT}; font-size:19px; letter-spacing:.16em; text-transform:uppercase;
      font-weight:600; margin-bottom:14px; }
    h1 { font-size:60px; line-height:1.08; font-weight:700; letter-spacing:-.02em; margin-bottom:26px; }
    .hl { color:${MINT}; }
    .lead { font-size:23px; line-height:1.5; opacity:.92; max-width:66ch; margin-bottom:16px; }
    .foot { margin-top:26px; font-size:17px; color:${MUTED}; line-height:1.5; }
    .pagehead { display:flex; justify-content:space-between; align-items:baseline;
      color:${MINT}; font-size:14px; letter-spacing:.16em; text-transform:uppercase;
      font-weight:600; padding-bottom:10px; margin-bottom:22px;
      border-bottom:1px solid rgba(67,204,178,.28); }
    .pagehead span { color:${MUTED}; letter-spacing:.08em; }
    .grid { display:grid; grid-template-columns:repeat(4,1fr); gap:28px; align-content:start; }
    .card { display:flex; flex-direction:column; min-height:0; }
    /* contain, not cover: show the creator's whole composition, letterboxed. */
    .card img { width:100%; height:404px; object-fit:contain; object-position:center top;
      border-radius:10px; display:block; }
    figcaption { display:flex; flex-direction:column; gap:2px; padding-top:12px; }
    .cat { color:${MINT}; font-size:11px; letter-spacing:.14em; text-transform:uppercase; font-weight:600; }
    figcaption b { font-size:17px; font-weight:600; line-height:1.25;
      overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
    .by { font-size:13px; color:${PAPER}; opacity:.72; }
    .pr { font-size:12px; color:${MUTED}; }
  `;

  const html = `<!doctype html><html><head><meta charset="utf-8">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap" rel="stylesheet">
    <style>${css}</style></head><body>${page1}${pages.join("")}</body></html>`;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);

  const total = pages.length + 1;
  const pdf = join(OUT_DIR, "Alux-Art-Portfolio.pdf");
  await page.pdf({ path: pdf, width: "1280px", height: "720px", printBackground: true,
                   pageRanges: `1-${total}` });
  await page.locator("section.slide").nth(1).screenshot({ path: join(OUT_DIR, "portfolio-proof.png") });
  await page.locator("section.slide").last().screenshot({ path: join(OUT_DIR, "portfolio-proof-last.png") });
  await browser.close();

  console.log(`PDF:   ${pdf}  (${total} pages)`);
  console.log(`Proof: ${join(OUT_DIR, "portfolio-proof.png")}`);
}

main().catch((e) => { console.error("portfolio error:", e); process.exitCode = 1; });
