/**
 * capture-g7x-tutorial.mjs — real screenshots of booking look 197, step by step.
 *
 *   node scripts/carousel/capture-g7x-tutorial.mjs scripts/carousel/shots/g7x-tutorial
 *
 * Runs against production and STOPS BEFORE PAYING. It uploads a photo (which is
 * free and is what a buyer does anyway) and never clicks the pay button, so no
 * booking is created and no generation is charged.
 *
 * Deliberately signed OUT. That is what someone opening the link from a DM
 * actually sees, and the sign-in step is part of the instructions rather than
 * something to hide. A logged-in capture would show a button the reader does not
 * get on their first try.
 *
 * Phone-shaped viewport: the app is used on phones, the screenshots sit inside a
 * 4:5 slide, and a desktop capture shrinks to unreadable at that size.
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const SITE = "https://aluxartandframes.shop";
const GEAR = "3d822eb4-9618-4cfc-8d21-25a4627a4d32";
const PHOTO = "C:/Users/FUJITSU/Downloads/b4/before.PNG";
const LOOK = "197";

const wait = (p, ms) => p.waitForTimeout(ms);

/** Click by visible text, tolerating the button not being there yet. */
async function tap(page, text, timeout = 8000) {
  const el = page.locator(`button:has-text("${text}")`).first();
  await el.scrollIntoViewIfNeeded({ timeout }).catch(() => {});
  await el.click({ timeout }).catch(() => {});
}

const STEPS = [
  {
    name: "step1-open-template",
    note: "The template page, checkout sheet closed so the look itself is visible.",
    async prep(page) {
      await wait(page, 4000);
      await page.locator("button:has-text('✕'), [aria-label='Close']").first().click({ timeout: 4000 }).catch(() => {});
      await wait(page, 1500);
    },
    crop: { x: 0, y: 0.04, w: 1, h: 0.72 },
  },
  {
    name: "step2-upload",
    note: "Checkout open at the upload area — the photo you already have.",
    async prep(page) {
      await wait(page, 4000);
      await tap(page, "Book This Look");
      await wait(page, 2500);
      await page.locator("text=+ Upload new").first().scrollIntoViewIfNeeded().catch(() => {});
      await wait(page, 1200);
    },
    crop: { x: 0, y: 0.18, w: 1, h: 0.6 },
  },
  {
    name: "step3-photo-in",
    note: "The uploaded photo sitting in the shoot, ready for a look.",
    async prep(page) {
      await wait(page, 4000);
      await tap(page, "Book This Look");
      await wait(page, 2500);
      const chooser = page.waitForEvent("filechooser", { timeout: 15000 });
      await tap(page, "+ Upload new");
      (await chooser).setFiles(PHOTO);
      await wait(page, 9000);
      await page.locator("text=Your lighting rig").first().scrollIntoViewIfNeeded().catch(() => {});
      await wait(page, 1500);
    },
    crop: { x: 0, y: 0.12, w: 1, h: 0.66 },
  },
  {
    name: "step4-search-197",
    note: "Type the number. One look comes up, already chosen, shown large.",
    async prep(page) {
      await wait(page, 4000);
      await tap(page, "Book This Look");
      await wait(page, 2500);
      const chooser = page.waitForEvent("filechooser", { timeout: 15000 });
      await tap(page, "+ Upload new");
      (await chooser).setFiles(PHOTO);
      await wait(page, 9000);
      await tap(page, "Your lighting rig");
      await wait(page, 1500);
      const box = page.locator('input[type="search"], input[placeholder*="earch" i]').first();
      await box.scrollIntoViewIfNeeded().catch(() => {});
      await box.fill(LOOK).catch(() => {});
      await wait(page, 3500);
      await box.scrollIntoViewIfNeeded().catch(() => {});
      await wait(page, 1200);
    },
    crop: { x: 0, y: 0.1, w: 1, h: 0.74 },
  },
  {
    name: "step5-keep-background",
    note: "Background left alone — the look works on the room you were already in.",
    async prep(page) {
      await wait(page, 4000);
      await tap(page, "Book This Look");
      await wait(page, 2500);
      const chooser = page.waitForEvent("filechooser", { timeout: 15000 });
      await tap(page, "+ Upload new");
      (await chooser).setFiles(PHOTO);
      await wait(page, 9000);
      await tap(page, "Background");
      await wait(page, 2000);
      await page.locator("text=Keep my background").first().scrollIntoViewIfNeeded().catch(() => {});
      await wait(page, 1200);
    },
    crop: { x: 0, y: 0.2, w: 1, h: 0.6 },
  },
  {
    name: "step6-checkout",
    note: "The bottom of the sheet: sign in, then pay. Nothing is clicked here.",
    async prep(page) {
      await wait(page, 4000);
      await tap(page, "Book This Look");
      await wait(page, 2500);
      const chooser = page.waitForEvent("filechooser", { timeout: 15000 });
      await tap(page, "+ Upload new");
      (await chooser).setFiles(PHOTO);
      await wait(page, 9000);
      await tap(page, "Your lighting rig");
      await wait(page, 1200);
      const box = page.locator('input[type="search"], input[placeholder*="earch" i]').first();
      await box.fill(LOOK).catch(() => {});
      await wait(page, 3000);
      await page.locator("button:has-text('Sign in with Google'), button:has-text('Pay')").first()
        .scrollIntoViewIfNeeded().catch(() => {});
      await wait(page, 1500);
    },
    crop: { x: 0, y: 0.34, w: 1, h: 0.62 },
  },
];

async function main() {
  const outDir = process.argv[2] || "scripts/carousel/shots/g7x-tutorial";
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 460, height: 900 }, deviceScaleFactor: 3 });

  for (const s of STEPS) {
    const page = await ctx.newPage();
    try {
      await page.goto(`${SITE}/marketplace/${GEAR}`, { waitUntil: "networkidle", timeout: 60000 });
      await s.prep(page);
      const raw = await page.screenshot({ type: "png" });
      const meta = await sharp(raw).metadata();
      const W = meta.width ?? 0, H = meta.height ?? 0;
      const c = s.crop;
      const buf = c === "full" ? raw : await sharp(raw).extract({
        left: Math.round(c.x * W), top: Math.round(c.y * H),
        width: Math.round(c.w * W), height: Math.round(c.h * H),
      }).toBuffer();
      const file = path.join(outDir, `${s.name}.jpg`);
      await sharp(buf).jpeg({ quality: 92 }).toFile(file);
      const m = await sharp(file).metadata();
      console.log(`${s.name.padEnd(24)} ${m.width}x${m.height}`);
    } catch (e) {
      console.log(`${s.name.padEnd(24)} FAILED: ${String(e.message).slice(0, 80)}`);
    }
    await page.close();
  }

  await browser.close();
  console.log(`\nshots -> ${outDir}`);
}

main().catch(e => { console.error("CAPTURE FAILED:", e.message); process.exit(1); });
