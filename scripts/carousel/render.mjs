/**
 * Instagram carousel renderer.
 *
 * Turns a JSON spec into 1080x1350 JPEG slides using headless Chromium. No paid
 * service and no image generation: slides are HTML laid out with the site's own
 * typeface and brand colour, plus real screenshots of the product.
 *
 * 4:5 is deliberate. Instagram crops every slide in a carousel to match the
 * FIRST slide's aspect ratio, and 4:5 is the tallest the feed allows, so it
 * takes the most screen. JPEG is not a preference either — it is the only format
 * the publishing API accepts.
 *
 *   node scripts/carousel/render.mjs scripts/carousel/samples.json out/
 */
import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const W = 1080, H = 1350;
// Palette sampled directly from the studio's own carousel artwork rather than
// from the website: the site runs teal on navy, the social work is a dark green
// radial with mint and coral. These are the pixel values out of those files.
const MINT  = "#43ccb2";   // accents, the second line of a headline, rules
const CORAL = "#d57a67";   // swipe prompts and anything asking for a tap
const PAPER = "#fcfefd";   // headlines
const MUTED = "#9db0aa";   // body copy
const BG_CORE = "#143a29"; // centre of the radial
const BG_EDGE = "#071711";  // corners
const BRAND = MINT;
const INK = BG_EDGE;

const esc = (s = "") => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Inline emphasis: *word* becomes brand-coloured. Kept deliberately tiny. */
const em = (s = "") => esc(s).replace(/\*([^*]+)\*/g, `<span class="hl">$1</span>`);

const shell = (body, extraCss = "") => `
<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800;900&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${W}px;height:${H}px;overflow:hidden}
  body{
    font-family:'Outfit',-apple-system,'Segoe UI',sans-serif;
    /* Off-centre radial, matching the studio artwork: the glow sits above the
       middle so headlines land in the brightest part of the frame. */
    background:
      radial-gradient(120% 85% at 50% 34%, ${BG_CORE} 0%, #0d2518 46%, ${BG_EDGE} 100%);
    color:${PAPER};
    display:flex; flex-direction:column;
    /* Instagram overlays UI near the edges in some surfaces, so nothing
       meaningful goes within 72px of the frame. */
    padding:88px 80px 78px;
    position:relative;
  }
  .hl{color:${BRAND}}
  .eyebrow{
    font-size:26px; font-weight:600; letter-spacing:.22em; text-transform:uppercase;
    color:${BRAND}; margin-bottom:34px;
  }
  h1{font-size:104px; font-weight:900; line-height:.96; letter-spacing:-.035em}
  h2{font-size:74px; font-weight:800; line-height:1.02; letter-spacing:-.025em}
  p.body{font-size:38px; font-weight:300; line-height:1.42; color:${MUTED}; margin-top:34px}
  /* The four corner brackets are the studio's signature framing device. */
  .bracket{position:absolute;width:78px;height:78px;border:3px solid ${MINT};opacity:.55}
  .bracket.tl{top:40px;left:40px;border-right:0;border-bottom:0}
  .bracket.tr{top:40px;right:40px;border-left:0;border-bottom:0}
  .bracket.bl{bottom:40px;left:40px;border-right:0;border-top:0}
  .bracket.br{bottom:40px;right:40px;border-left:0;border-top:0}
  .spacer{flex:1}
  footer{
    display:flex; align-items:center; justify-content:space-between;
    font-size:24px; font-weight:400; color:#6d8078; letter-spacing:.02em;
  }
  .rule{height:5px;width:104px;background:${BRAND};border-radius:3px;margin-bottom:40px}
  ${extraCss}
</style></head><body>
<span class="bracket tl"></span><span class="bracket tr"></span>
<span class="bracket bl"></span><span class="bracket br"></span>
${body}</body></html>`;

const footer = (n, total) => `
  <footer>
    <span>aluxartandframes.shop</span>
    <span>${n}/${total}</span>
  </footer>`;

// ── Slide kinds ──────────────────────────────────────────────────────────────
const SLIDES = {
  /** Opening slide. One idea, as large as it will go. */
  cover: (s, n, t) => shell(`
    <div class="eyebrow">${esc(s.eyebrow ?? "Alux Art")}</div>
    <div class="spacer"></div>
    <h1>${em(s.title)}</h1>
    ${s.body ? `<p class="body">${em(s.body)}</p>` : ""}
    <div class="spacer" style="flex:1.25"></div>
    ${s.kicker ? `<div style="font-size:30px;font-weight:700;color:${CORAL};letter-spacing:.14em;text-transform:uppercase;margin-bottom:30px">${em(s.kicker)}</div>` : ""}
    ${footer(n, t)}`),

  /** A statement with supporting text. */
  text: (s, n, t) => shell(`
    <div class="rule"></div>
    <h2>${em(s.title)}</h2>
    ${s.body ? `<p class="body">${em(s.body)}</p>` : ""}
    <div class="spacer"></div>
    ${footer(n, t)}`),

  /** A screenshot doing the arguing. Caption above so the image can run large. */
  /**
   * A screenshot or photo in a rounded frame.
   *
   * `contain` is the default and `cover` must be asked for. It used to be the
   * other way round, and 20 slides were quietly having their edges sliced off —
   * on a pricing slide the naira sign was the character that got cut. Cropping
   * a photo loses a little scenery; cropping a screenshot loses words, and
   * almost every shot here is a screenshot.
   */
  shot: (s, n, t) => shell(`
    <div class="rule"></div>
    <h2 style="font-size:56px">${em(s.title)}</h2>
    ${s.body ? `<p class="body" style="font-size:32px;margin-top:24px">${em(s.body)}</p>` : ""}
    <div class="shotwrap"><img src="${s.image}" alt=""></div>
    ${footer(n, t)}`, `
    .shotwrap{
      flex:1; margin:44px 0 40px; border-radius:22px; overflow:hidden;
      background:#0b1d15; border:1px solid rgba(67,204,178,.38);
      display:flex; align-items:center; justify-content:center;
    }
    .shotwrap img{width:100%;height:100%;object-fit:${s.fit === "cover" ? "cover" : "contain"};object-position:top center}`),

  /** Numbered steps. Caps at 5 so the type never has to shrink. */
  steps: (s, n, t) => shell(`
    <div class="rule"></div>
    <h2 style="font-size:60px">${em(s.title)}</h2>
    <ol>${(s.items ?? []).slice(0, 5).map((it, i) => `
      <li><span class="num">${i + 1}</span><span class="txt">${em(it)}</span></li>`).join("")}
    </ol>
    <div class="spacer"></div>
    ${footer(n, t)}`, `
    ol{list-style:none;margin-top:52px;display:flex;flex-direction:column;gap:34px}
    li{display:flex;gap:28px;align-items:flex-start}
    .num{
      flex:0 0 62px;height:62px;border-radius:50%;background:${MINT};color:#06150f;
      font-size:32px;font-weight:800;display:flex;align-items:center;justify-content:center;
    }
    .txt{font-size:34px;font-weight:300;line-height:1.34;color:#cfdcd7;padding-top:9px}`),

  /** Closing slide. One instruction, nothing competing with it. */
  cta: (s, n, t) => shell(`
    <div class="spacer"></div>
    <div class="eyebrow">${esc(s.eyebrow ?? "Start today")}</div>
    <h1 style="font-size:92px">${em(s.title)}</h1>
    ${s.body ? `<p class="body">${em(s.body)}</p>` : ""}
    <div class="link">aluxartandframes.shop</div>
    <div class="spacer"></div>
    ${footer(n, t)}`, `
    .link{
      margin-top:56px;font-size:40px;font-weight:800;color:#06150f;
      background:${MINT};display:inline-block;padding:26px 42px;border-radius:16px;
      align-self:flex-start;letter-spacing:-.01em;
    }`),
};

/** Read a local image into a data: URI so it survives the about:blank origin. */
async function dataUri(file) {
  const abs = path.resolve(file);
  const buf = await readFile(abs);
  const ext = path.extname(abs).toLowerCase();
  const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

async function main() {
  const [specPath, outDir = "out"] = process.argv.slice(2);
  if (!specPath) { console.error("usage: render.mjs <spec.json> [outDir]"); process.exit(1); }

  const spec = JSON.parse(await readFile(specPath, "utf8"));
  const carousels = Array.isArray(spec) ? spec : [spec];
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });

  const manifest = [];
  for (const c of carousels) {
    // An id becomes a directory name and a path the poster looks up, so a space
    // or slash in it silently breaks posting later rather than rendering here.
    if (!/^[a-z0-9][a-z0-9-]*$/.test(c.id)) {
      throw new Error(`carousel id "${c.id}" must be lowercase letters, numbers and hyphens only`);
    }
    const slides = c.slides ?? [];
    if (slides.length > 10) throw new Error(`"${c.id}" has ${slides.length} slides — Instagram allows 10`);
    const dir = path.join(outDir, c.id);
    await mkdir(dir, { recursive: true });
    const files = [];

    for (const [i, s] of slides.entries()) {
      const build = SLIDES[s.type];
      if (!build) throw new Error(`unknown slide type "${s.type}" in ${c.id}`);
      // Screenshots are inlined as data URIs. A file:// reference is silently
      // dropped here: setContent gives the page an about:blank origin, and
      // Chromium refuses to load local files into it, so the slide rendered
      // with an empty box and no error.
      const slide = s.image ? { ...s, image: await dataUri(s.image) } : s;
      await page.setContent(build(slide, i + 1, slides.length), { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      const broken = await page.evaluate(() =>
        [...document.images].filter((im) => !im.complete || im.naturalWidth === 0).length);
      if (broken) throw new Error(`${c.id} slide ${i + 1}: ${broken} image(s) failed to load`);
      const file = path.join(dir, `${String(i + 1).padStart(2, "0")}.jpg`);
      await page.screenshot({ path: file, type: "jpeg", quality: 92 });
      files.push(file);
    }
    manifest.push({ id: c.id, account: c.account, caption: c.caption, slides: files });
    console.log(`${c.id}: ${files.length} slides -> ${dir}`);
  }

  await browser.close();
  await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`\nmanifest: ${path.join(outDir, "manifest.json")}`);
}

main().catch((e) => { console.error("RENDER FAILED:", e.message); process.exit(1); });
