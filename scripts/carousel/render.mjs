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

/**
 * The strip along the bottom.
 *
 * `brand` exists for REPOSTABLE carousels. Assets we hand creators to share on
 * their own feeds must not carry our domain: their audience would follow it to
 * us, book through us, and the creator would earn nothing on a post they made.
 * Those carousels pass brand: "" and end on "link in bio" instead, so the
 * traffic lands wherever the person who reposted it points it.
 */
const footer = (n, total, brand = "aluxartandframes.shop") => `
  <footer>
    <span>${brand}</span>
    <span>${n}/${total}</span>
  </footer>`;

// ── Slide kinds ──────────────────────────────────────────────────────────────
const SLIDES = {
  /** Opening slide. One idea, as large as it will go. */
  cover: (s, n, t, b) => shell(`
    <div class="eyebrow">${esc(s.eyebrow ?? "Alux Art")}</div>
    <div class="spacer"></div>
    <h1>${em(s.title)}</h1>
    ${s.body ? `<p class="body">${em(s.body)}</p>` : ""}
    <div class="spacer" style="flex:1.25"></div>
    ${s.kicker ? `<div style="font-size:30px;font-weight:700;color:${CORAL};letter-spacing:.14em;text-transform:uppercase;margin-bottom:30px">${em(s.kicker)}</div>` : ""}
    ${footer(n, t, b)}`),

  /** A statement with supporting text. */
  text: (s, n, t, b) => shell(`
    <div class="rule"></div>
    <h2>${em(s.title)}</h2>
    ${s.body ? `<p class="body">${em(s.body)}</p>` : ""}
    <div class="spacer"></div>
    ${footer(n, t, b)}`),

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
  shot: (s, n, t, b) => shell(`
    <div class="rule"></div>
    <h2 style="font-size:56px">${em(s.title)}</h2>
    ${s.body ? `<p class="body" style="font-size:32px;margin-top:24px">${em(s.body)}</p>` : ""}
    <div class="shotwrap"><img src="${s.image}" alt=""></div>
    ${footer(n, t, b)}`, `
    .shotwrap{
      flex:1; margin:44px 0 40px; border-radius:22px; overflow:hidden;
      background:#0b1d15; border:1px solid rgba(67,204,178,.38);
      display:flex; align-items:center; justify-content:center;
    }
    .shotwrap img{width:100%;height:100%;object-fit:${s.fit === "cover" ? "cover" : "contain"};object-position:top center}`),

  /**
   * A relight, argued by the pair rather than by the caption.
   *
   * SIDE BY SIDE, and `contain` by default. The first version stacked the two
   * frames, which forced each into a wide letterbox — and since every source
   * here is a PORTRAIT, that meant cropping the subject to fit. Two portrait
   * panes side by side match the shape of the photographs, so the whole frame
   * shows and the eye compares the same thing twice rather than two crops.
   *
   * overflow:hidden sits on each pane, not just the wrapper: the panes are flex
   * children with a border-radius, and without it a sub-pixel rounding gap shows
   * as a hairline seam in the rasterised JPEG.
   */
  beforeafter: (s, n, t, b) => shell(`
    <div class="rule"></div>
    <h2 style="font-size:52px">${em(s.title)}</h2>
    ${s.body ? `<p class="body" style="font-size:28px;margin-top:18px">${em(s.body)}</p>` : ""}
    <div class="bawrap">
      <div class="pane"><img src="${s.before}" alt=""><span class="tag">BEFORE</span></div>
      <div class="seam"></div>
      <div class="pane"><img src="${s.after}" alt=""><span class="tag after">AFTER</span></div>
    </div>
    <div class="spacer"></div>
    ${footer(n, t, b)}`, `
    /* The frame HUGS the pair instead of stretching to fill the slide. Two
       portrait panes side by side come to roughly 1.55 wide-to-tall, so pinning
       that ratio makes object-fit contain fit exactly — stretching it instead
       left thick empty bands above and below both photographs. */
    .bawrap{
      flex:0 0 auto; aspect-ratio:1.55; margin:32px 0 0; border-radius:22px; overflow:hidden;
      border:1px solid rgba(67,204,178,.38); background:#0b1d15;
      display:flex; flex-direction:row; min-height:0;
    }
    .pane{position:relative; flex:1 1 50%; min-width:0; overflow:hidden}
    .pane img{
      width:100%; height:100%; display:block;
      object-fit:${s.fit === "cover" ? "cover" : "contain"};
      object-position:${s.focus ?? "center center"};
    }
    .seam{flex:0 0 3px; background:${MINT}; opacity:.9}
    .tag{
      position:absolute; left:14px; top:14px; padding:6px 13px; border-radius:999px;
      font-size:19px; font-weight:800; letter-spacing:.14em;
      background:rgba(6,21,15,.82); color:#cfdcd7; border:1px solid rgba(207,220,215,.28);
    }
    .tag.after{background:${MINT}; color:#06150f; border-color:transparent}`),

  /** Numbered steps. Caps at 5 so the type never has to shrink. */
  steps: (s, n, t, b) => shell(`
    <div class="rule"></div>
    <h2 style="font-size:60px">${em(s.title)}</h2>
    <ol>${(s.items ?? []).slice(0, 5).map((it, i) => `
      <li><span class="num">${i + 1}</span><span class="txt">${em(it)}</span></li>`).join("")}
    </ol>
    <div class="spacer"></div>
    ${footer(n, t, b)}`, `
    ol{list-style:none;margin-top:52px;display:flex;flex-direction:column;gap:34px}
    li{display:flex;gap:28px;align-items:flex-start}
    .num{
      flex:0 0 62px;height:62px;border-radius:50%;background:${MINT};color:#06150f;
      font-size:32px;font-weight:800;display:flex;align-items:center;justify-content:center;
    }
    .txt{font-size:34px;font-weight:300;line-height:1.34;color:#cfdcd7;padding-top:9px}`),

  /** Closing slide. One instruction, nothing competing with it. */
  cta: (s, n, t, b) => shell(`
    <div class="spacer"></div>
    <div class="eyebrow">${esc(s.eyebrow ?? "Start today")}</div>
    <h1 style="font-size:92px">${em(s.title)}</h1>
    ${s.body ? `<p class="body">${em(s.body)}</p>` : ""}
    <div class="link">aluxartandframes.shop</div>
    <div class="spacer"></div>
    ${footer(n, t, b)}`, `
    .link{
      margin-top:56px;font-size:40px;font-weight:800;color:#06150f;
      background:${MINT};display:inline-block;padding:26px 42px;border-radius:16px;
      align-self:flex-start;letter-spacing:-.01em;
    }`),

  /**
   * A contact sheet of styles, each with the word that summons it.
   *
   * Built for the WhatsApp opener. A chat cannot show a picture next to a menu
   * row — the list API has no image field — so sending one image per style meant
   * five separate messages that read as a catalogue dump. One sheet shows more
   * in less space and can be scrolled and zoomed like any photo.
   *
   * The TRIGGER is the point of the tile, not decoration: it is what the buyer
   * types to skip the menu entirely, so it is set in the accent colour and given
   * its own line rather than tucked under the title.
   *
   * FOUR tiles, in a 2x2. Six was tried and the bottom row fell off the frame:
   * 1080x1350 cannot hold three rows of thumbnail plus caption at a size worth
   * looking at. Four large tiles beat six where two are invisible.
   */
  grid: (s, n, t, b) => shell(`
    <div class="rule"></div>
    <h2 style="font-size:46px">${em(s.title)}</h2>
    ${s.body ? `<p class="body" style="font-size:26px;margin-top:14px;line-height:1.34">${em(s.body)}</p>` : ""}
    <div class="grid">
      ${(s.items ?? []).slice(0, 4).map((it) => `
        <figure class="cell">
          <div class="thumb"><img src="${it.image}" alt=""></div>
          <figcaption>
            <span class="cname">${esc(it.name ?? "")}</span>
            ${it.trigger ? `<span class="ctrig">${esc(it.trigger)}</span>` : ""}
          </figcaption>
        </figure>`).join("")}
    </div>
    ${footer(n, t, b)}`, `
    .grid{
      /* min-height:0 is load-bearing: a grid inside a flex column defaults to
         min-height:auto, so it grows to fit its content instead of shrinking
         into the space left. Without it the bottom row and its captions run off
         the bottom of the frame, which is exactly what happened. */
      flex:1; min-height:0; margin:28px 0 26px; display:grid;
      grid-template-columns:repeat(2, 1fr); grid-template-rows:repeat(2, 1fr); gap:20px;
    }
    .cell{margin:0;display:flex;flex-direction:column;min-height:0}
    .thumb{
      flex:1; min-height:0; border-radius:16px; overflow:hidden;
      background:#0b1d15; border:1px solid rgba(67,204,178,.34);
    }
    .thumb img{width:100%;height:100%;object-fit:cover;object-position:top center;display:block}
    figcaption{padding-top:12px;display:flex;flex-direction:column;gap:3px}
    .cname{font-size:25px;font-weight:700;color:${PAPER};line-height:1.15}
    .ctrig{font-size:23px;font-weight:800;color:${MINT};letter-spacing:.02em}`),
};

/** Read a local image into a data: URI so it survives the about:blank origin. */
async function dataUri(file) {
  const abs = path.resolve(file);
  const buf = await readFile(abs);
  if (!buf.length) throw new Error(`${file} is zero bytes`);
  const ext = path.extname(abs).toLowerCase();
  const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

/**
 * Every slide key that names a local image file. `shot` uses one, `beforeafter`
 * uses two — inlining is keyed off this list so a new image-bearing slide type
 * only has to add its key here rather than touch the render loop.
 */
const IMAGE_KEYS = ["image", "before", "after"];

async function inlineImages(slide) {
  const out = { ...slide };
  for (const k of IMAGE_KEYS) if (typeof slide[k] === "string" && slide[k]) out[k] = await dataUri(slide[k]);
  // `grid` carries its images inside items[] rather than at the top level, so
  // the key list above cannot reach them.
  if (Array.isArray(slide.items)) {
    out.items = await Promise.all(slide.items.map(async (it) => (
      typeof it?.image === "string" && it.image ? { ...it, image: await dataUri(it.image) } : it
    )));
  }
  return out;
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
      const slide = await inlineImages(s);
      // `brand` lets a repostable carousel drop our domain from the footer;
      // undefined keeps the default stamp on everything else.
      await page.setContent(build(slide, i + 1, slides.length, c.brand), { waitUntil: "networkidle" });
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
