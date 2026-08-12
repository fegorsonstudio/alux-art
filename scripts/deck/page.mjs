#!/usr/bin/env node
/**
 * page.mjs — build a shareable review page for the pitch deck.
 *
 *   node scripts/deck/page.mjs
 *
 * Writes out/deck/deck-page.html, which is then published as an Artifact.
 *
 * The page embeds the ALREADY RENDERED slides rather than re-creating them in
 * HTML. That is deliberate: the PDF is what actually gets sent to investors, so
 * the review page has to show exactly that, not a lookalike that can drift out of
 * sync the next time build.mjs changes.
 *
 * Everything is inlined as data URIs — the Artifact CSP blocks every external
 * host, so a linked webfont would silently fall back and a linked image would
 * simply not load. Outfit's latin-ext subset is included because the naira sign
 * (U+20A6) lives there, not in latin.
 */

import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "..", "out", "deck");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Slide order and what each one is for. A deck is a sequence, so the numbering
 *  on the page encodes something true rather than decorating. */
const SLIDES = [
  ["Cover",          "Photographs of you, without the photoshoot"],
  ["The problem",    "A photoshoot costs a day and a fortune"],
  ["The solution",   "Sell the style, not the session"],
  ["How it works",   "Three steps, about four minutes"],
  ["Proof",          "The week it proved itself"],
  ["Traction",       "Built in 10 weeks"],
  ["Business model", "Paid per shoot, two ways in"],
  ["Distribution",   "The marketing is already automated"],
  ["Team",           "Founder-led, and photographer-built"],
  ["The ask",        "$30,000 – $40,000"],
];

async function outfit() {
  const res = await fetch(
    "https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap",
    { headers: { "User-Agent": UA } });
  const css = await res.text();

  // Keep latin and latin-ext for each weight; drop the rest to hold the page down.
  const blocks = css.split("@font-face").slice(1)
    .filter(b => /U\+0100-02BA|U\+0000-00FF/.test(b));

  const faces = [];
  for (const b of blocks) {
    const url = b.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
    const weight = b.match(/font-weight:\s*(\d+)/)?.[1];
    if (!url || !weight) continue;
    const buf = Buffer.from(await (await fetch(url, { headers: { "User-Agent": UA } })).arrayBuffer());
    const range = b.match(/unicode-range:\s*([^;]+);/)?.[1]?.trim();
    faces.push(`@font-face{font-family:'Outfit';font-style:normal;font-weight:${weight};` +
      `font-display:swap;src:url(data:font/woff2;base64,${buf.toString("base64")}) format('woff2');` +
      (range ? `unicode-range:${range};` : "") + "}");
  }
  console.log(`  ${faces.length} font faces inlined`);
  return faces.join("\n");
}

async function slideImages() {
  const out = [];
  for (let i = 1; i <= SLIDES.length; i++) {
    const file = join(OUT_DIR, `slide-${String(i).padStart(2, "0")}.png`);
    // JPEG at 92: the slides are gradient-heavy, where PNG palette reduction
    // bands badly and full-colour PNG is several megabytes each.
    const buf = await sharp(readFileSync(file)).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
    out.push(`data:image/jpeg;base64,${buf.toString("base64")}`);
    process.stdout.write(".");
  }
  console.log("");
  return out;
}

const css = (fonts) => `
${fonts}

/* Light is the base layer: every token is defined here, unconditionally, so the
   un-stamped "system" state always has a complete palette to fall back on. */
:root{
  --ground:#f4f8f6; --raised:#ffffff; --ink:#10231b; --ink-soft:#4a5f57;
  --ink-faint:#7b8d86; --accent:#1f8f77; --rule:#dbe6e1;
  --frame:rgba(16,35,27,.10); --shadow:0 1px 2px rgba(16,35,27,.05),0 12px 32px rgba(16,35,27,.09);
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --ground:#07120e; --raised:#0e1d17; --ink:#e8f2ee; --ink-soft:#9db0aa;
    --ink-faint:#6d817a; --accent:#43ccb2; --rule:#1c2f28;
    --frame:rgba(232,242,238,.12); --shadow:0 1px 2px rgba(0,0,0,.4),0 12px 32px rgba(0,0,0,.45);
  }
}
:root[data-theme="dark"]{
  --ground:#07120e; --raised:#0e1d17; --ink:#e8f2ee; --ink-soft:#9db0aa;
  --ink-faint:#6d817a; --accent:#43ccb2; --rule:#1c2f28;
  --frame:rgba(232,242,238,.12); --shadow:0 1px 2px rgba(0,0,0,.4),0 12px 32px rgba(0,0,0,.45);
}

*{box-sizing:border-box}
body{
  margin:0; background:var(--ground); color:var(--ink);
  font-family:'Outfit',system-ui,-apple-system,'Segoe UI',sans-serif;
  font-size:17px; line-height:1.6; -webkit-font-smoothing:antialiased;
}
.wrap{max-width:1120px; margin:0 auto; padding:56px 28px 96px; display:flex; flex-direction:column; gap:52px}

header{display:flex; flex-direction:column; gap:14px; padding-bottom:34px; border-bottom:1px solid var(--rule)}
.eyebrow{
  color:var(--accent); font-size:13px; font-weight:600;
  letter-spacing:.18em; text-transform:uppercase;
}
h1{
  margin:0; font-size:clamp(34px,5.4vw,50px); font-weight:700; line-height:1.08;
  letter-spacing:-.022em; text-wrap:balance;
}
.standfirst{margin:0; max-width:62ch; color:var(--ink-soft); font-size:18px}
.meta{
  display:flex; flex-wrap:wrap; gap:10px 26px; margin-top:6px;
  color:var(--ink-faint); font-size:14px; font-variant-numeric:tabular-nums;
}
.meta b{color:var(--ink); font-weight:600}

.deck{display:flex; flex-direction:column; gap:46px; list-style:none; margin:0; padding:0}
.slide{display:flex; flex-direction:column; gap:12px}
.cap{display:flex; align-items:baseline; gap:14px; flex-wrap:wrap}
.num{
  color:var(--accent); font-size:14px; font-weight:700;
  font-variant-numeric:tabular-nums; letter-spacing:.06em;
}
.role{font-weight:600; font-size:17px}
.gist{color:var(--ink-faint); font-size:15px}
.slide img{
  display:block; width:100%; height:auto; border-radius:12px;
  border:1px solid var(--frame); box-shadow:var(--shadow); background:#071711;
}

footer{
  border-top:1px solid var(--rule); padding-top:26px;
  color:var(--ink-faint); font-size:14.5px; display:flex; flex-direction:column; gap:8px;
}
footer a{color:var(--accent)}
.contact{display:flex; flex-wrap:wrap; gap:6px 22px; margin:0; color:var(--ink-soft)}
footer a:focus-visible{outline:2px solid var(--accent); outline-offset:3px; border-radius:3px}

@media (max-width:640px){
  .wrap{padding:36px 18px 64px; gap:38px}
  .deck{gap:34px}
}
`;

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log("fetching Outfit…");
  const fonts = await outfit();
  console.log("encoding slides…");
  const imgs = await slideImages();

  const items = SLIDES.map(([role, gist], i) => `
      <li class="slide">
        <div class="cap">
          <span class="num">${String(i + 1).padStart(2, "0")}</span>
          <span class="role">${role}</span>
          <span class="gist">${gist}</span>
        </div>
        <img src="${imgs[i]}" alt="Slide ${i + 1}: ${role} — ${gist}">
      </li>`).join("");

  const html = `<title>Alux Art — Pitch Deck</title>
<style>${css(fonts)}</style>
<div class="wrap">
  <header>
    <p class="eyebrow">Pitch deck</p>
    <h1>Alux Art</h1>
    <p class="standfirst">A marketplace where Nigerian photographers sell their style, and
    anyone can book a shoot from their phone. Ten slides, for the Founders Fund Africa
    application.</p>
    <div class="meta">
      <span><b>10</b> slides</span>
      <span>Prepared <b>9 August 2026</b></span>
      <span>Figures verified against production</span>
    </div>
  </header>

  <ol class="deck">${items}
  </ol>

  <footer>
    <p>Every figure on these slides comes from the production database or the business
    bank statement. Where a number is weak it is stated plainly rather than left out.</p>
    <p>Companion documents: the financial projections and the portfolio, both in
    <code>out/deck/</code>.</p>
    <p class="contact">
      <a href="https://aluxartandframes.shop">aluxartandframes.shop</a>
      <span>@fegorson_studio</span>
      <a href="mailto:support@aluxartandframes.shop">support@aluxartandframes.shop</a>
      <span>+234 813 786 1670</span>
    </p>
  </footer>
</div>`;

  const out = join(OUT_DIR, "deck-page.html");
  writeFileSync(out, html, "utf8");
  console.log(`HTML: ${out}  (${(Buffer.byteLength(html) / 1e6).toFixed(2)} MB)`);
}

main().catch(e => { console.error("page error:", e); process.exitCode = 1; });
