#!/usr/bin/env node
/**
 * tutorial-poster.mjs — 9:16 tutorial graphics in the studio's carousel style.
 *
 *   node scripts/tutorial-poster.mjs [outDir]
 *
 * Separate from scripts/carousel/render.mjs on purpose. That renderer is wired
 * to 1080x1350 because Instagram crops a carousel to its first slide and 4:5 is
 * the tallest the feed allows; it also numbers slides and feeds the posting
 * queue. These are single 1080x1920 posters for stories and WhatsApp, so
 * changing the carousel renderer to serve both would have meant threading a
 * size through code that four live posting scripts depend on.
 *
 * The palette, the Outfit typeface, the corner brackets and the radial ground
 * are copied from that renderer so the two read as one family.
 *
 * Content is checked against the live product, not written from memory:
 * both templates are ₦2,000 per image (price_1_ngn, raised when every photo
 * started running through two models), the Gear Equalizer takes 1-10 photos and
 * carries 197 lighting looks grouped by shot type, and the
 * extractor returns garments as one four-panel sheet and a backdrop as a single
 * emptied setting (lib/asset-extractor.ts).
 */
import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const W = 1080, H = 1920;

// Sampled from the studio's carousel artwork — see render.mjs.
const MINT  = "#43ccb2";
const CORAL = "#d57a67";
const PAPER = "#fcfefd";
const MUTED = "#9db0aa";
const BG_CORE = "#143a29";
const BG_EDGE = "#071711";

const esc = (s = "") => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const em = (s = "") => esc(s).replace(/\*([^*]+)\*/g, `<span class="hl">$1</span>`);

const page = (p, logoDataUri) => `
<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800;900&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${W}px;height:${H}px;overflow:hidden}
  body{
    font-family:'Outfit',-apple-system,'Segoe UI',sans-serif;
    background:radial-gradient(120% 80% at 50% 30%, ${BG_CORE} 0%, #0d2518 46%, ${BG_EDGE} 100%);
    color:${PAPER};
    display:flex; flex-direction:column;
    /* Stories put UI over the top and bottom bands, so nothing meaningful
       goes within ~130px of the top or ~120px of the bottom. */
    padding:132px 84px 108px;
    position:relative;
  }
  .hl{color:${MINT}}
  .bracket{position:absolute;width:80px;height:80px;border:3px solid ${MINT};opacity:.55}
  .bracket.tl{top:44px;left:44px;border-right:0;border-bottom:0}
  .bracket.tr{top:44px;right:44px;border-left:0;border-bottom:0}
  .bracket.bl{bottom:44px;left:44px;border-right:0;border-top:0}
  .bracket.br{bottom:44px;right:44px;border-left:0;border-top:0}
  .eyebrow{
    font-size:26px; font-weight:600; letter-spacing:.22em; text-transform:uppercase;
    color:${MINT}; margin-bottom:26px;
  }
  h1{font-size:88px; font-weight:900; line-height:.98; letter-spacing:-.035em}
  .sub{font-size:33px; font-weight:300; color:${MUTED}; margin-top:26px; line-height:1.34}
  .rule{height:5px;width:104px;background:${MINT};border-radius:3px;margin:44px 0 8px}
  ol{list-style:none; margin-top:38px; display:flex; flex-direction:column; gap:34px}
  li{display:flex; gap:26px; align-items:flex-start}
  .num{
    flex:0 0 58px;height:58px;border-radius:50%;background:${MINT};color:#06150f;
    font-size:30px;font-weight:800;display:flex;align-items:center;justify-content:center;
  }
  .step{font-size:35px;font-weight:300;line-height:1.34;color:#cfdcd7;padding-top:8px}
  .step b{font-weight:600;color:${PAPER}}
  .spacer{flex:1}
  .kicker{
    font-size:29px;font-weight:700;color:${CORAL};
    letter-spacing:.13em;text-transform:uppercase;margin-bottom:30px;
  }
  footer{display:flex; align-items:center; gap:22px}
  footer img{width:76px;height:76px;border-radius:22%;display:block}
  .brandwrap{display:flex;flex-direction:column;line-height:1.2}
  .brandname{font-size:29px;font-weight:700;color:${PAPER};letter-spacing:.01em}
  .branddom{font-size:25px;font-weight:400;color:#6d8078}
</style></head><body>
<span class="bracket tl"></span><span class="bracket tr"></span>
<span class="bracket bl"></span><span class="bracket br"></span>
  <div class="eyebrow">${esc(p.eyebrow)}</div>
  <h1>${em(p.title).split("\n").join("<br>")}</h1>
  <p class="sub">${em(p.sub)}</p>
  <div class="rule"></div>
  <ol>
    ${p.steps.map((s, i) => `
      <li><span class="num">${i + 1}</span><span class="step">${em(s)}</span></li>`).join("")}
  </ol>
  <div class="spacer"></div>
  ${p.kicker ? `<div class="kicker">${em(p.kicker)}</div>` : ""}
  <footer>
    <img src="${logoDataUri}" alt="Alux Art">
    <span class="brandwrap">
      <span class="brandname">Alux Art</span>
      <span class="branddom">aluxartandframes.shop</span>
    </span>
  </footer>
</body></html>`;

const POSTERS = [
  {
    file: "tutorial-background-and-lighting.jpg",
    eyebrow: "Tutorial · The Gear Equalizer",
    title: "Change your\nbackground\nand lighting",
    sub: "Photos you already shot, relit properly and moved onto a studio backdrop. *₦2,000 per photo*.",
    steps: [
      "Open *The Gear Equalizer* and pick your output size. It is *4:5* unless you change it — crop your photos to that shape before you upload.",
      "Upload *1 to 10 photos* you already took. Pay per photo, not per package.",
      "Pick a lighting look. *197 of them*, sorted into headshots, waist-up and full body so you judge each one on the right crop.",
      "One look covers every photo. Tap a single photo only if you want *that one* lit differently.",
      "Choose the background: keep your own, pick a studio backdrop, or *upload your own plate* and it is applied across the whole set.",
    ],
    kicker: "Same face · same outfit · new light",
  },
  {
    // One look rather than the whole archive: "type 197" beats "pick from 197"
    // for someone who already knows which one they want.
    //
    // Deliberately NOT night-only. The look is a direct on-camera flash, and a
    // flash is just as visible at a pool at five in the afternoon as it is in a
    // club — writing it as a night look would tell people it does not apply to
    // the photo in their hand.
    file: "tutorial-g7x-flash.jpg",
    eyebrow: "Tutorial · Look 197",
    title: "Put a real flash\non your photo",
    sub: "Direct on-camera flash, added to a photo you already took. Day or night. *₦2,000 per photo*.",
    steps: [
      "Open *The Gear Equalizer* and tap Book This Look.",
      "Pick *4:5* at the top, and crop your photo to 4:5 so the two match. A different shape gets cropped to fit and you lose part of the frame.",
      "Upload the photo you already took — poolside in the afternoon, indoors, a night out, anywhere.",
      "Type *197* in the search box. One look comes up and it is already chosen: *Night Paparazzi G7X*.",
      "Leave the background on *keeping yours*. The look changes the light on you; the place you were stays exactly as it was.",
      "Pay and download.",
    ],
    kicker: "Same place · same outfit · real flash",
  },
  {
    file: "tutorial-asset-extractor.jpg",
    eyebrow: "Tutorial · The Asset Extractor",
    title: "Pull the outfit\nand backdrop\nout of a photo",
    sub: "Turn one photograph into reusable assets for your own templates. *₦2,000 per item*.",
    steps: [
      "Open *The Asset Extractor* and upload the photo that contains what you want.",
      "Tick what to pull out. *Each tick is one image*, so three ticks is three images.",
      "Outfits, gowns and suits return as *one sheet* — front, three-quarter, side and back in a single frame.",
      "A backdrop returns as the *empty setting*, every person removed, from the same camera position and lens.",
      "Download them and add them straight to your own template as backdrops or outfit options.",
    ],
    kicker: "One photo · many reusable assets",
  },
];

async function main() {
  const outDir = process.argv[2] || path.join(process.env.USERPROFILE || process.env.HOME || ".", "Desktop");
  await mkdir(outDir, { recursive: true });

  // Inlined: headless Chromium will not read a local file from an inline <img>
  // src reliably across platforms, and a missing logo would render as a silent
  // gap rather than an error.
  const logoBuf = await readFile(path.join(ROOT, "public", "logo.png"));
  const logoDataUri = `data:image/png;base64,${logoBuf.toString("base64")}`;

  const browser = await chromium.launch();
  const tab = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });

  const written = [];
  for (const p of POSTERS) {
    await tab.setContent(page(p, logoDataUri), { waitUntil: "networkidle" });
    // Webfont must be in before the shot or the poster renders in a fallback.
    await tab.evaluate(() => document.fonts.ready);
    const buf = await tab.screenshot({ type: "jpeg", quality: 94 });
    const dest = path.join(outDir, p.file);
    await writeFile(dest, buf);

    // A JPEG that is present is not the same as one that is whole — a truncated
    // slide reached a live carousel once in this project.
    const check = await readFile(dest);
    const ok = check[0] === 0xff && check[1] === 0xd8
      && check[check.length - 2] === 0xff && check[check.length - 1] === 0xd9;
    if (!ok) throw new Error(`wrote a truncated JPEG: ${dest}`);
    written.push({ dest, bytes: check.length });
  }

  await browser.close();
  for (const w of written) console.log(`${w.bytes.toString().padStart(7)} bytes  ${w.dest}`);
}

main().catch((e) => { console.error("tutorial-poster error:", e.message); process.exitCode = 1; });
