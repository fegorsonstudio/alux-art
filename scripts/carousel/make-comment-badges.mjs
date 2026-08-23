#!/usr/bin/env node
/**
 * Transparent "COMMENT <number>" badges, one per lighting look, plus a BEFORE tag.
 *
 * The side-by-side before/after slide was not engaging enough, so the images go
 * out whole and the ask is composited on top by hand instead. This produces the
 * overlay: a PNG with a real alpha channel, in the studio's own typeface and
 * palette, dropped into the same folder as the picture it belongs to.
 *
 * Two variants of every badge, because these photos run from a black nightclub
 * to a daylit TV studio and one colour cannot sit legibly on both:
 *
 *   -dark   mint pill, near-black text   -> for dark photographs
 *   -light  near-black pill, mint text    -> for bright photographs
 *
 *   node scripts/carousel/make-comment-badges.mjs
 *   node scripts/carousel/make-comment-badges.mjs --dir "C:/.../relight-looks" --width 1500
 */
import { chromium } from "playwright";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const argOf = (f, d) => { const i = args.indexOf(f); return i > -1 && args[i + 1] ? args[i + 1] : d; };

const ROOT = argOf("--dir", path.join(process.env.USERPROFILE || process.env.HOME || ".", "Desktop", "relight-looks"));
// Wide enough to stay crisp when laid over a 3584px-wide render and scaled down.
const WIDTH = Number(argOf("--width", "1500"));

const MINT = "#43ccb2";
const INK  = "#06150f";

/**
 * One badge. Height is left to the content so the PNG crops tight to the pill
 * and nothing has to be trimmed in Photoshop before placing it.
 */
function html({ label, value, fg, bg }) {
  const hasLabel = Boolean(label);
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;800;900&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{background:transparent}
  body{display:inline-block}
  .pill{
    display:inline-flex; align-items:center; gap:${hasLabel ? "38px" : "0"};
    background:${bg}; color:${fg};
    padding:${hasLabel ? "46px 76px" : "40px 88px"};
    border-radius:9999px;
    font-family:'Outfit',-apple-system,'Segoe UI',sans-serif;
    white-space:nowrap;
    /* A soft drop shadow so the pill survives a busy background without an
       outline, which would fight the brand's flat look. */
    filter:drop-shadow(0 18px 44px rgba(0,0,0,.42));
  }
  .label{
    font-size:74px; font-weight:800; letter-spacing:.20em; text-transform:uppercase;
    opacity:.92;
  }
  .value{ font-size:132px; font-weight:900; letter-spacing:-.02em; line-height:.94; }
  .solo{ font-size:96px; font-weight:900; letter-spacing:.22em; text-transform:uppercase; }
</style></head><body>
  <div class="pill">
    ${hasLabel
      ? `<span class="label">${label}</span><span class="value">${value}</span>`
      : `<span class="solo">${value}</span>`}
  </div>
</body></html>`;
}

/** "023-warm-haze-backlit-editorial" -> "23", or null when the folder is not a look. */
function lookNumber(folder) {
  const m = /^(\d{1,3})-/.exec(folder);
  return m ? String(Number(m[1])) : null;
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });

async function render(spec, outPath) {
  await page.setViewportSize({ width: 2400, height: 600 });
  await page.setContent(html(spec), { waitUntil: "networkidle" });
  const el = await page.$(".pill");
  const shot = await el.screenshot({ omitBackground: true, type: "png" });
  await writeFile(outPath, shot);
  return shot.length;
}

/** Every folder holding one relight, at any depth under the root. */
async function lookFolders(dir, acc = []) {
  for (const entry of await readdir(dir)) {
    const full = path.join(dir, entry);
    if (!(await stat(full)).isDirectory()) continue;
    if (lookNumber(entry)) acc.push(full);
    else await lookFolders(full, acc);   // other-photos/<source>/<look>
  }
  return acc;
}

const folders = await lookFolders(ROOT).catch(() => []);
if (!folders.length) {
  console.log(`No look folders under ${ROOT}`);
  await browser.close();
  process.exit(0);
}

let made = 0;
for (const folder of folders) {
  const n = lookNumber(path.basename(folder));
  for (const [suffix, fg, bg] of [["dark", INK, MINT], ["light", MINT, INK]]) {
    const out = path.join(folder, `comment-${n}-${suffix}.png`);
    const bytes = await render({ label: "Comment", value: n, fg, bg }, out);
    console.log(`  ${path.relative(ROOT, out)}  (${Math.round(bytes / 1024)}KB)`);
    made++;
  }
}

// The BEFORE tag, once, at the root — the same one goes on every original.
await mkdir(path.join(ROOT, "_badges"), { recursive: true });
for (const [suffix, fg, bg] of [["dark", INK, MINT], ["light", MINT, INK]]) {
  const out = path.join(ROOT, "_badges", `before-${suffix}.png`);
  const bytes = await render({ label: "", value: "Before", fg, bg }, out);
  console.log(`  ${path.relative(ROOT, out)}  (${Math.round(bytes / 1024)}KB)`);
  made++;
}

console.log(`\n${made} badge(s) written under ${ROOT}`);
await browser.close();
