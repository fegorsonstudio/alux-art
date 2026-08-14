#!/usr/bin/env node
/**
 * beforeafter-overlay.mjs — the signature before/after frame, on pure black,
 * for compositing your own pair in Photoshop.
 *
 *   node scripts/beforeafter-overlay.mjs [outDir]
 *
 * WHY PURE BLACK AND NOT THE USUAL GREEN. The carousel renderer paints a dark
 * green radial, which cannot be composited away. Here the ground is #000000 and
 * every mark is light, so dropping the file over a photograph on Screen (or
 * Lighten) blend makes the black vanish and leaves only the frame, labels and
 * branding. That is the whole point of the file: it is a lid, not a picture.
 *
 * The two panes are left empty for the same reason. Put your BEFORE and AFTER
 * underneath this layer and they show through.
 *
 * Two variants are written:
 *   -screen  the panes are pure black, so a Screen blend reveals the photos
 *   -mask    the panes are pure white, to use as a luminance mask if you would
 *            rather cut holes than blend
 */
import { chromium } from "playwright";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const W = 1080, H = 1350;              // 4:5, same as every feed carousel
const MINT = "#43ccb2";
const PAPER = "#fcfefd";

const page = (paneFill, label) => `
<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800;900&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${W}px;height:${H}px;overflow:hidden}
  body{
    font-family:'Outfit',-apple-system,'Segoe UI',sans-serif;
    /* Pure black, deliberately: anything else survives a Screen blend. */
    background:#000;
    color:${PAPER};
    display:flex; flex-direction:column;
    padding:88px 80px 78px;
    position:relative;
  }
  .bracket{position:absolute;width:78px;height:78px;border:3px solid ${MINT};opacity:.85}
  .bracket.tl{top:40px;left:40px;border-right:0;border-bottom:0}
  .bracket.tr{top:40px;right:40px;border-left:0;border-bottom:0}
  .bracket.bl{bottom:40px;left:40px;border-right:0;border-top:0}
  .bracket.br{bottom:40px;right:40px;border-left:0;border-top:0}
  h2{font-size:52px;font-weight:800;line-height:1.02;letter-spacing:-.025em}
  .sub{font-size:28px;font-weight:300;color:#9db0aa;margin-top:18px}
  .frame{
    flex:1; margin-top:34px; display:flex; flex-direction:row;
    border-radius:18px; overflow:hidden; min-height:0;
    border:3px solid ${MINT};
  }
  .pane{position:relative; flex:1 1 50%; min-width:0; background:${paneFill}}
  .pane + .pane{border-left:3px solid ${MINT}}
  .tag{
    position:absolute; top:22px; left:22px;
    background:#000; color:${PAPER};
    font-size:22px; font-weight:700; letter-spacing:.14em;
    padding:9px 18px; border-radius:999px; border:2px solid ${MINT};
  }
  .tag.after{background:${MINT}; color:#06150f; border-color:${MINT}}
  footer{
    display:flex; align-items:center; justify-content:space-between;
    font-size:24px; font-weight:400; color:#8fa39c; margin-top:26px;
  }
</style></head><body>
<span class="bracket tl"></span><span class="bracket tr"></span>
<span class="bracket bl"></span><span class="bracket br"></span>
  <h2>Same photograph.<br>New light.</h2>
  <p class="sub">Drop your two frames behind this layer.</p>
  <div class="frame">
    <div class="pane"><span class="tag">BEFORE</span></div>
    <div class="pane"><span class="tag after">AFTER</span></div>
  </div>
  <footer><span>aluxartandframes.shop</span><span>${label}</span></footer>
</body></html>`;

async function main() {
  const outDir = process.argv[2] || path.join(process.env.USERPROFILE || process.env.HOME || ".", "Desktop");
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  const tab = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });

  const jobs = [
    ["#000000", "screen blend", "before-after-overlay-screen.png"],
    ["#ffffff", "luminance mask", "before-after-overlay-mask.png"],
  ];

  for (const [fill, label, file] of jobs) {
    await tab.setContent(page(fill, label), { waitUntil: "networkidle" });
    await tab.evaluate(() => document.fonts.ready);
    // PNG, not JPEG: JPEG would smear the hard pane edges and lift the black off
    // zero, and a black that is not exactly zero does not disappear on Screen.
    const buf = await tab.screenshot({ type: "png" });
    const dest = path.join(outDir, file);
    await writeFile(dest, buf);
    const check = await readFile(dest);
    const ok = check[0] === 0x89 && check[1] === 0x50;
    if (!ok) throw new Error(`not a PNG: ${dest}`);
    console.log(`${check.length.toString().padStart(7)} bytes  ${dest}`);
  }

  await browser.close();
}

main().catch(e => { console.error("overlay error:", e.message); process.exitCode = 1; });
