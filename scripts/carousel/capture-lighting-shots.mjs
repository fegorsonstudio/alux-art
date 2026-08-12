#!/usr/bin/env node
/**
 * capture-lighting-shots.mjs — real screenshots of the lighting picker.
 *
 *   node scripts/carousel/capture-lighting-shots.mjs
 *
 * Two things learned the expensive way on the Magenta Boardroom shot, both
 * baked in here:
 *
 *   1. The carousel's shot frame is about 1.08 wide-to-tall. A wide desktop
 *      screenshot dropped into it letterboxes into a black band under the
 *      image, so the capture is cropped to that ratio rather than fixed later.
 *   2. Shoot at a TALL viewport (1180×1160) so the page reflows to something
 *      near the frame's shape, instead of being cropped down to fit and losing
 *      half the interface.
 */

import { chromium } from "playwright";
import sharp from "sharp";
import { mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const OUT = join(__dirname, "shots");
const SITE = process.env.ALUX_SITE || "https://aluxartandframes.shop";
const GEAR = "3d822eb4-9618-4cfc-8d21-25a4627a4d32";
const FRAME_RATIO = 1.08;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);

/** Crop to the slide frame's ratio so `contain` fills it instead of banding. */
async function cropToFrame(buf, file) {
  const img = sharp(buf);
  const { width, height } = await img.metadata();
  const targetH = Math.round(width / FRAME_RATIO);
  const h = Math.min(targetH, height);
  await img.extract({ left: 0, top: 0, width, height: h }).png().toFile(file);
  return { width, height: h };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  // Narrow viewport on purpose. At desktop width the booking panel is a 440px
  // side column — barely a third of a 1080-wide slide, so it renders soft. At
  // tablet width the same panel goes full-bleed, and at 3× that is ~2400px of
  // real detail to downscale from.
  const page = await browser.newPage({ viewport: { width: 820, height: 1000 }, deviceScaleFactor: 3 });

  log("opening The Gear Equalizer…");
  await page.goto(`${SITE}/marketplace/${GEAR}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);

  // Open the booking panel — the lighting picker lives inside it.
  const book = page.locator('button:has-text("Book This Look")').first();
  if (await book.count()) { await book.click().catch(() => {}); await page.waitForTimeout(3000); }

  // photo_upgrade templates hide the looks behind a "set the lighting myself"
  // toggle; regular templates show them directly. Tick it if it is there.
  const toggle = page.locator('text=/set the lighting myself/i').first();
  if (await toggle.count()) { await toggle.click().catch(() => {}); await page.waitForTimeout(2000); }

  // Expand the first couple of sections so the shot shows real looks rather
  // than a list of collapsed headings.
  const sections = page.locator('button[aria-expanded="false"]');
  const n = Math.min(await sections.count(), 2);
  for (let i = 0; i < n; i++) { await sections.nth(0).click().catch(() => {}); await page.waitForTimeout(1200); }
  await page.waitForTimeout(2500);

  // Clip to the booking panel itself. A full-viewport shot spends half the
  // frame on the blurred page behind the panel, which at carousel size reads as
  // a mistake rather than as context.
  // Clip to the scrolling looks list itself, found by an actual section heading
  // rather than by the panel title — the title also appears in the page's own
  // purchase box, and matching that gave a clip full of the page behind it.
  // Anchor on the look TILES, not on any container. Container rects run the full
  // page width, so clipping to one leaves the blurred page behind the panel
  // filling half the slide. The tiles' own left and right edges are the panel's
  // real content edges.
  const box = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll("*")].filter(e =>
      e.children.length === 0 && /^(Rising Fog|Backlit Haze Beam|Volumetric Shaft|Hard Warm Kicker)$/i.test((e.textContent || "").trim()));
    if (tiles.length < 2) return null;
    const rects = tiles.map(t => t.getBoundingClientRect());
    const left = Math.min(...rects.map(r => r.left));
    const right = Math.max(...rects.map(r => r.right));
    const top = Math.min(...rects.map(r => r.top));
    // Pad out to the card edges and give the grid room above/below.
    const pad = 26;
    return {
      x: Math.max(0, left - pad),
      y: Math.max(0, top - 190),
      width: Math.min(right - left + pad * 2, window.innerWidth - Math.max(0, left - pad)),
      height: Math.min(900, window.innerHeight - Math.max(0, top - 190)),
    };
  }).catch(() => null);

  const buf = await page.screenshot({ type: "png", ...(box ? { clip: box } : {}) });
  const { width, height } = await cropToFrame(buf, join(OUT, "lighting-picker.png"));
  log(`✓ lighting-picker.png  ${width}×${height}  (ratio ${(width / height).toFixed(2)})${box ? "" : "  [panel not found — full viewport]"}`);

  await browser.close();
  console.log(`\nsaved to ${OUT}`);
  console.log("Open it and check the looks are legible at phone size before building the week.");
}

main().catch(e => { console.error("capture error:", e.message); process.exitCode = 1; });
