#!/usr/bin/env node
/**
 * build.mjs — the Alux Art pitch deck, as a PDF.
 *
 *   node scripts/deck/build.mjs
 *
 * Rendered the same way as the Instagram carousels: HTML laid out with the
 * studio's own palette and typeface, printed through headless Chromium. No
 * design tool, no subscription, and it can be regenerated the moment a number
 * changes.
 *
 * EVERY FIGURE HERE IS REAL and comes from the production database or the
 * business's own bank statement. The dashboard's "total earned" number counts
 * free test bookings, so it is deliberately NOT used — an application that
 * claims ₦5.4M of revenue against ₦11,600 of actual receipts does not survive
 * due diligence. Projections are labelled as projections, on the slide, with
 * their assumptions printed beside them.
 */

import { chromium } from "playwright";
import sharp from "sharp";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const OUT_DIR = join(ROOT, "out", "deck");
const LOGO = process.env.ALUX_LOGO || "C:/Users/FUJITSU/Desktop/video assets/logo (2).PNG";

// Sampled from the studio's own carousel artwork, so the deck and the Instagram
// work read as one brand.
const MINT = "#43ccb2", CORAL = "#d57a67", PAPER = "#fcfefd", MUTED = "#9db0aa";
const BG_CORE = "#143a29", BG_EDGE = "#071711";

const logoData = existsSync(LOGO)
  ? `data:image/png;base64,${readFileSync(LOGO).toString("base64")}`
  : null;
if (!logoData) console.warn(`WARNING: logo not found at ${LOGO} — building without it`);

const TEAM_PHOTO = process.env.ALUX_TEAM_PHOTO || "C:/Users/FUJITSU/Desktop/team/team.jpg";
/** The source is a 2.9MB studio frame; the slide needs about 700px of it. */
async function teamPhoto() {
  if (!existsSync(TEAM_PHOTO)) {
    console.warn(`WARNING: team photo not found at ${TEAM_PHOTO} — building without it`);
    return null;
  }
  const buf = await sharp(readFileSync(TEAM_PHOTO))
    .resize({ width: 700, withoutEnlargement: true })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

/** Verified against the production database on 9 August 2026. */
const F = {
  started: "29 May 2026",
  weeks: 10,
  templates: 21,
  // CAREFUL. 10 creators are APPROVED; all 21 published templates are the
  // founder's own studio, and exactly one other creator has a template at all
  // (a draft). "10 photographers publishing" is false and must not reappear.
  creators: 10,
  users: 18,
  shoots: 226,
  completed: 165,
  images: 877,
  revenue: "₦11,600",
  payingCustomers: 4,
  // Alux Art's OWN prices (app_config price_1/5/10_ngn), where the whole amount
  // is revenue. NOT the creator-template list prices — on those the creator sets
  // the price and the platform keeps only the fee. Do not mix the two up.
  price1: "₦2,000", price5: "₦9,000", price10: "₦15,000",
  marketplaceFee: "₦5,000",
  ask: "$30,000 – $40,000",
  site: "aluxartandframes.shop",
  instagram: "@fegorson_studio",
  // Both addresses on purpose: the support address is the one customers and
  // partners should use, the Gmail is the founder's and matches the application.
  support: "support@aluxartandframes.shop",
  email: "fegorsonphotography@gmail.com",
  phone: "+234 813 786 1670",
};

const shell = (inner, extra = "") => `
<section class="slide">${inner}</section>
<style>${extra}</style>`;

const cover = () => shell(`
  <div class="cover">
    ${logoData
      ? `<div class="logomark"><img src="${logoData}" alt="Alux Art"></div>`
      : `<div class="wordmark">ALUX ART</div>`}
    <h1>Photographs of you,<br><span class="hl">without the photoshoot.</span></h1>
    <p class="sub">A marketplace where Nigerian photographers sell their style, and anyone can book a shoot from their phone.</p>
    <p class="foot">${F.site} · ${F.instagram} · Abuja, Nigeria · Founded ${F.started}</p>
  </div>`);

const slide = (eyebrow, title, body) => shell(`
  <div class="rule"></div>
  <p class="eyebrow">${eyebrow}</p>
  <h2>${title}</h2>
  ${body}`);

const bullets = (items) => `<ul>${items.map(i => `<li>${i}</li>`).join("")}</ul>`;
const stats = (items) => `<div class="stats">${items.map(([n, l]) =>
  `<div class="stat"><span class="n">${n}</span><span class="l">${l}</span></div>`).join("")}</div>`;

const buildSlides = (photo) => [
  cover(),

  slide("The problem", "A photoshoot costs a day and a fortune.",
    bullets([
      "A studio session in Lagos or Abuja means a photographer's day rate, studio hire, transport both ways, a day off work, and two weeks waiting for edits.",
      "In the weeks that matter most (Call to Bar, convocation, owambe season, December) every good photographer in the city is already fully booked.",
      "Photographers have the opposite problem: their income stops the moment they put the camera down. Their style, which is the actual asset, earns nothing while they sleep.",
    ])),

  slide("The solution", "Sell the style, not the session.",
    `<p class="lead">A photographer publishes their look as a bookable template. A customer picks it, uploads a few photos of themselves, and receives a finished shoot in minutes, wearing that photographer's lighting, framing and art direction.</p>` +
    bullets([
      "The customer never visits a studio, and never waits two weeks.",
      "The photographer earns from a style they built once, on bookings that arrive while they are shooting something else.",
      "Alux Art takes a platform fee on each booking.",
    ])),

  slide("How it works", "Three steps, about four minutes.",
    `<ol class="steps">
      <li><b>Choose a style.</b> Every template shows real sample images and its price before anything is paid.</li>
      <li><b>Upload a few photos.</b> Four is enough: a clear face, a side angle, full body, and one genuine smile.</li>
      <li><b>Receive the shoot.</b> Identity is locked to the customer's own face; the outfit is reproduced element for element from the creator's reference.</li>
    </ol>
    <p class="note">Buyers also choose shoes, hair, nails, jewellery, props and backdrops from the creator's library, so one template produces a shoot that is theirs rather than a stock look.</p>`),

  slide("Proof", "The week it proved itself.",
    `<p class="lead">Two days before the Call to Bar ceremony, we built and published two templates for it. Newly called lawyers booked them and received their portraits without setting foot in a studio, during the exact week every photographer in Abuja was fully booked.</p>
     <p class="lead">Our audience then asked for nursing induction. We built it. That is the loop: demand names the template, and the template exists within days.</p>`),

  slide("Traction", `Built in ${F.weeks} weeks.`,
    stats([
      [F.templates, "published templates"],
      [F.creators, "photographers in the creators academy"],
      [F.images, "images generated"],
      [F.shoots, "shoots booked"],
      [F.users, "customers"],
      [F.revenue, "revenue since payments opened"],
    ]) +
    `<p class="note">Two things to be straight about. The platform ran free while we proved people
     wanted it, so ${F.revenue} from ${F.payingCustomers} paying customers is all the revenue there
     has been since pricing opened in July. And all ${F.templates} published templates are still
     built in-house: ${F.creators} photographers have joined the creators academy, but getting them
     publishing is ahead of us, not behind us.</p>`),

  slide("Business model", "Paid per shoot. Two ways in.",
    `<div class="price">
      <div><span class="p">${F.price1}</span><span class="q">1 photo</span></div>
      <div><span class="p">${F.price5}</span><span class="q">5 photos</span></div>
      <div><span class="p">${F.price10}</span><span class="q">10 photos</span></div>
     </div>` +
    bullets([
      "<b>Booked direct from Alux Art</b> at the prices above. No creator in the transaction, so the whole amount is revenue and about 88% of it survives generation and card fees.",
      `<b>Booked from a photographer's template</b>, where they set the price and keep most of it and Alux Art keeps a fee of ${F.marketplaceFee} on a ten-photo shoot. Less per booking, far more catalogue.`,
      "No subscription either way, and the price is visible before anything is uploaded.",
      "Payments run live through Paystack: card and bank transfer.",
    ])),

  slide("Distribution", "The marketing is already automated.",
    bullets([
      "Three Instagram accounts posting daily, unattended: one for buyers, one for creators, one for how it works.",
      "Comment a keyword on any post and the platform sends the link by direct message automatically.",
      "A free creators academy: photographers learn to build and publish their own templates. 10 have joined so far.",
      "A WhatsApp booking bot, built and ready, so a customer can book an entire shoot inside a chat.",
    ]) +
    `<p class="note">Every one of these was built in-house and runs without staff.</p>`),

  // Two columns when the photo exists, single column when it does not, so the
  // deck still builds on a machine without the image.
  slide("Team", "Founder-led, and photographer-built.",
    `<div class="team">
      ${photo ? `<img class="teamPhoto" src="${photo}" alt="The Alux Art team">` : ""}
      <div class="teamText">
        <p class="lead">Ebele Ogheneofegor Charles, founder. A working photographer for over
        ten years, now building the infrastructure the job always needed.</p>
        ${bullets([
          "The product decisions come from having done the work: what a client actually wants, why a shoot goes wrong, what a photographer will and will not hand over.",
          "The platform itself (marketplace, generation pipeline, payments, automation) I built myself, using AI agents, in ten weeks.",
          "The gap is engineering. Growing past this point needs people who can build alongside me.",
        ])}
      </div>
     </div>`),

  slide("The ask", F.ask,
    bullets([
      "<b>Marketing and distribution.</b> Turn a working product into a known one.",
      "<b>Image generation credits.</b> The direct cost of every shoot, and the ceiling on how many we can serve.",
      "<b>Engineering support.</b> The constraint named above, and the reason for applying.",
    ]) +
    `<p class="lead">The product exists, customers have used it, and photographers have trusted it with their work. What is missing is reach and the hands to build faster.</p>
     <p class="foot">${F.site} · ${F.instagram} · ${F.phone}<br>
     ${F.support} · ${F.email}</p>`),
];

const css = `
  @page { size: 1280px 720px; margin: 0; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Outfit',system-ui,sans-serif; -webkit-font-smoothing:antialiased; }
  .slide {
    width:1280px; height:720px; padding:74px 88px; position:relative; overflow:hidden;
    background:radial-gradient(circle at 50% 42%, ${BG_CORE} 0%, ${BG_EDGE} 78%);
    color:${PAPER}; display:flex; flex-direction:column; justify-content:center;
    page-break-after:always;
  }
  .rule { width:74px; height:5px; background:${MINT}; border-radius:3px; margin-bottom:26px; }
  .eyebrow { color:${MINT}; font-size:19px; letter-spacing:.16em; text-transform:uppercase; font-weight:600; margin-bottom:14px; }
  h1 { font-size:70px; line-height:1.06; font-weight:700; letter-spacing:-.02em; }
  h2 { font-size:52px; line-height:1.1; font-weight:700; letter-spacing:-.015em; margin-bottom:28px; }
  .hl { color:${MINT}; }
  .lead { font-size:26px; line-height:1.5; color:${PAPER}; opacity:.94; margin-bottom:20px; max-width:64ch; }
  ul { list-style:none; display:flex; flex-direction:column; gap:20px; }
  li { font-size:24px; line-height:1.45; color:${PAPER}; opacity:.9; padding-left:30px; position:relative; max-width:70ch; }
  li::before { content:""; position:absolute; left:0; top:13px; width:12px; height:12px; border-radius:50%; background:${MINT}; }
  ol.steps { list-style:none; counter-reset:s; display:flex; flex-direction:column; gap:22px; }
  ol.steps li { counter-increment:s; padding-left:62px; font-size:24px; line-height:1.45; }
  ol.steps li::before {
    content:counter(s); left:0; top:-2px; width:42px; height:42px; border-radius:50%;
    background:${MINT}; color:${BG_EDGE}; font-weight:700; font-size:22px;
    display:flex; align-items:center; justify-content:center;
  }
  .note { margin-top:28px; font-size:19px; line-height:1.5; color:${MUTED}; max-width:74ch; }
  /* A .lead that closes a slide sits after the bullet list, which is a flex
     column with gap — so it needs its own top margin or it butts up against
     the final bullet. */
  ul + .lead, ol + .lead { margin-top:26px; }
  .stats { display:grid; grid-template-columns:repeat(3,1fr); gap:30px 40px; margin-top:6px; }
  .stat { display:flex; flex-direction:column; gap:4px; }
  .stat .n { font-size:52px; font-weight:700; color:${MINT}; line-height:1; }
  .stat .l { font-size:18px; color:${MUTED}; }
  .price { display:flex; gap:56px; margin-bottom:30px; }
  .price .p { font-size:46px; font-weight:700; color:${MINT}; display:block; line-height:1.1; }
  .price .q { font-size:18px; color:${MUTED}; }
  .cover { display:flex; flex-direction:column; justify-content:center; height:100%; }
  /* The supplied logo is a 400x712 render: a gold badge sitting on a navy card
     with a lot of empty space above and below it. Crop to the badge itself so
     it reads as a mark rather than a floating black rectangle. */
  .cover .logomark {
    width:158px; height:158px; overflow:hidden; position:relative;
    border-radius:26px; align-self:flex-start; margin-bottom:40px;
    box-shadow:0 0 0 1px rgba(252,254,253,.10);
  }
  .cover .logomark img { position:absolute; width:230px; height:409px; left:-36px; top:-124px; }
  .wordmark { font-size:38px; letter-spacing:.3em; color:${MINT}; font-weight:700; margin-bottom:38px; }
  .cover .sub { font-size:27px; line-height:1.5; color:${PAPER}; opacity:.9; margin-top:26px; max-width:62ch; }
  .foot { position:absolute; left:88px; bottom:52px; font-size:17px; color:${MUTED}; line-height:1.5; }
  .cover .foot { position:static; margin-top:44px; }
  .team { display:flex; gap:54px; align-items:center; }
  .teamPhoto {
    width:322px; height:430px; object-fit:cover; object-position:center 22%;
    border-radius:14px; flex:none; box-shadow:0 18px 44px rgba(0,0,0,.42);
  }
  .teamText { min-width:0; }
  .team .lead { margin-bottom:22px; }
  .team li { font-size:21px; }
`;

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const SLIDES = buildSlides(await teamPhoto());
  const html = `<!doctype html><html><head><meta charset="utf-8">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap" rel="stylesheet">
    <style>${css}</style></head><body>${SLIDES.join("")}</body></html>`;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.setContent(html, { waitUntil: "networkidle" });
  // Give the webfont a moment; a deck set in the fallback face looks nothing
  // like the Instagram work it is meant to match.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);

  const pdf = join(OUT_DIR, "Alux-Art-Pitch-Deck.pdf");
  await page.pdf({ path: pdf, width: "1280px", height: "720px", printBackground: true, pageRanges: `1-${SLIDES.length}` });

  // Also export each slide as an image, useful for socials and for checking.
  for (let i = 0; i < SLIDES.length; i++) {
    const el = page.locator("section.slide").nth(i);
    await el.screenshot({ path: join(OUT_DIR, `slide-${String(i + 1).padStart(2, "0")}.png`) });
  }

  await browser.close();
  console.log(`${SLIDES.length} slides`);
  console.log(`PDF:    ${pdf}`);
  console.log(`Images: ${OUT_DIR}`);
}

main().catch((e) => { console.error("deck error:", e); process.exitCode = 1; });
