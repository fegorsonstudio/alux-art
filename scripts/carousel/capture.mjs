/**
 * Screenshot library for the carousels.
 *
 * Captures the live app so carousel slides show the real product rather than
 * describing it. Runs against production, read-only: it never signs in with a
 * password, never books anything, and never clicks Pay.
 *
 * Each shot is cropped to the interesting region — a full page screenshot inside
 * a 4:5 slide is unreadable, and empty chrome wastes the frame.
 *
 *   node scripts/carousel/capture.mjs <outDir>
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const SITE = "https://aluxartandframes.shop";
const GEAR = "3d822eb4-9618-4cfc-8d21-25a4627a4d32";
const ASSET = "a63214fd-c56a-46ae-8056-0407a17d63a1";

/**
 * name       what it shows
 * url        where to go
 * prep       optional interactions before the shot
 * crop       fraction of the viewport to keep {x,y,w,h}, or "full"
 */
const SHOTS = [
  {
    name: "marketplace-grid",
    url: `${SITE}/marketplace`,
    prep: async (p) => { await p.waitForTimeout(3500); await p.mouse.wheel(0, 420); await p.waitForTimeout(1500); },
    crop: { x: 0, y: 0.06, w: 1, h: 0.82 },
  },
  {
    name: "style-variety",
    url: `${SITE}/marketplace`,
    prep: async (p) => { await p.waitForTimeout(3500); await p.mouse.wheel(0, 1400); await p.waitForTimeout(1500); },
    crop: { x: 0, y: 0.04, w: 1, h: 0.86 },
  },
  {
    name: "upload-guidance",
    url: `${SITE}/marketplace/${ASSET}`,
    // The checkout sheet opens by itself now; the identity-photo guidance is the
    // clearest explanation of what to upload anywhere in the product.
    prep: async (p) => {
      await p.waitForTimeout(4000);
      await p.locator("text=Your identity photos").first().scrollIntoViewIfNeeded().catch(() => {});
      await p.waitForTimeout(1200);
    },
    crop: { x: 0, y: 0.34, w: 1, h: 0.5 },
  },
  {
    name: "package-and-size",
    url: `${SITE}/marketplace/${ASSET}`,
    prep: async (p) => {
      await p.waitForTimeout(4000);
      await p.locator("text=OUTPUT SIZE").first().scrollIntoViewIfNeeded().catch(() => {});
      await p.waitForTimeout(1200);
    },
    crop: { x: 0, y: 0.2, w: 1, h: 0.44 },
  },
  {
    name: "template-page",
    url: `${SITE}/marketplace/${GEAR}`,
    // Close the sheet so the template's own gallery and description are visible.
    prep: async (p) => {
      await p.waitForTimeout(4000);
      await p.locator("button:has-text('✕'), [aria-label='Close']").first().click({ timeout: 5000 }).catch(() => {});
      await p.waitForTimeout(2000);
    },
    crop: { x: 0, y: 0.05, w: 1, h: 0.8 },
  },
  {
    name: "become-creator",
    url: `${SITE}/become-creator`,
    prep: async (p) => { await p.waitForTimeout(3500); },
    crop: { x: 0, y: 0.05, w: 1, h: 0.78 },
  },
];

async function main() {
  const outDir = process.argv[2] || "shots";
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  // Phone-shaped: the app is used on phones and the screenshots sit in a 4:5 slide.
  const ctx = await browser.newContext({ viewport: { width: 460, height: 900 }, deviceScaleFactor: 3 });
  const page = await ctx.newPage();

  for (const s of SHOTS) {
    try {
      await page.goto(s.url, { waitUntil: "networkidle", timeout: 60000 });
      if (s.prep) await s.prep(page);
      const raw = await page.screenshot({ type: "png" });
      const meta = await sharp(raw).metadata();
      const W = meta.width ?? 0, H = meta.height ?? 0;
      const c = s.crop;
      const buf = c === "full" ? raw : await sharp(raw).extract({
        left: Math.round(c.x * W), top: Math.round(c.y * H),
        width: Math.round(c.w * W), height: Math.round(c.h * H),
      }).toBuffer();
      const file = path.join(outDir, `${s.name}.jpg`);
      await sharp(buf).jpeg({ quality: 90 }).toFile(file);
      const m = await sharp(file).metadata();
      console.log(`${s.name.padEnd(20)} ${m.width}x${m.height}`);
    } catch (e) {
      console.log(`${s.name.padEnd(20)} FAILED: ${String(e.message).slice(0, 70)}`);
    }
  }

  await browser.close();
  console.log(`\nlibrary written to ${outDir}`);
}

main().catch(e => { console.error("CAPTURE FAILED:", e.message); process.exit(1); });
