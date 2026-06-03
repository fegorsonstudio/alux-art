import { test, expect, Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const TEMPLATE_URL = "/marketplace/51fddb50-228e-417a-9b68-8c3600d91735";
const SHOTS_DIR = path.join(process.cwd(), "qa-screenshots");

if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.jpeg`), fullPage: false, timeout: 8_000 }).catch(() => {});
}

async function consoleErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("console", msg => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", err => errors.push(err.message));
  return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
test.describe("Section 1 — Marketplace", () => {
  test("marketplace loads and shows template cards", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

    const start = Date.now();
    await page.goto("/marketplace", { waitUntil: "domcontentloaded" });

    // Wait for cards to appear (client-rendered)
    await page.waitForSelector("[class*='card'], [class*='Card'], [class*='template'], a[href*='/marketplace/']", { timeout: 15_000 }).catch(() => {});

    const loadTime = ((Date.now() - start) / 1000).toFixed(1);
    await shot(page, "01-marketplace-desktop");

    // Count template cards
    const cards = await page.locator("a[href*='/marketplace/']").count();
    console.log(`[marketplace] Load time: ${loadTime}s | Template links found: ${cards}`);

    // Check for "Loading styles..." text still visible
    const loading = await page.locator("text=Loading styles").isVisible().catch(() => false);
    console.log(`[marketplace] Still showing 'Loading styles...': ${loading}`);

    // Check broken images
    const brokenImgs = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll("img"));
      return imgs.filter(img => !img.complete || img.naturalWidth === 0).map(img => img.src);
    });
    console.log(`[marketplace] Broken images: ${brokenImgs.length}`, brokenImgs);

    // Mobile check
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);
    await shot(page, "01-marketplace-mobile");
    console.log("[marketplace] Mobile screenshot taken");

    // Tablet check
    await page.setViewportSize({ width: 768, height: 1024 });
    await shot(page, "01-marketplace-tablet");

    // Reset
    await page.setViewportSize({ width: 1280, height: 800 });

    console.log(`[marketplace] Console errors: ${errors.join(" | ") || "none"}`);
    expect(cards).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test.describe("Section 2 — Template Detail Page", () => {
  test("package selector shows 1/5/10 options with correct prices", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

    const start = Date.now();
    await page.goto(TEMPLATE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("text=Book This Look", { timeout: 30_000 });
    const loadTime = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[template] Load time: ${loadTime}s`);

    await shot(page, "02-template-desktop");

    // Package buttons
    const pkg1 = page.locator("button").filter({ hasText: /^1\s+image/i });
    const pkg5 = page.locator("button").filter({ hasText: /^5\s+image/i });
    const pkg10 = page.locator("button").filter({ hasText: /^10\s+image/i });

    const has1 = await pkg1.isVisible().catch(() => false);
    const has5 = await pkg5.isVisible().catch(() => false);
    const has10 = await pkg10.isVisible().catch(() => false);
    console.log(`[template] Package buttons visible — 1: ${has1} | 5: ${has5} | 10: ${has10}`);

    // Read prices for each package
    const prices: Record<string, string> = {};

    if (has10) {
      await pkg10.click();
      await page.waitForTimeout(400);
      const btn = page.locator("button").filter({ hasText: /Book This Look/i });
      prices["10"] = await btn.textContent().then(t => t ?? "").catch(() => "");
    }
    if (has5) {
      await pkg5.click();
      await page.waitForTimeout(400);
      const btn = page.locator("button").filter({ hasText: /Book This Look/i });
      prices["5"] = await btn.textContent().then(t => t ?? "").catch(() => "");
      await shot(page, "02-template-5img-selected");
    }
    if (has1) {
      await pkg1.click();
      await page.waitForTimeout(400);
      const btn = page.locator("button").filter({ hasText: /Book This Look/i });
      prices["1"] = await btn.textContent().then(t => t ?? "").catch(() => "");
      await shot(page, "02-template-1img-selected");
    }

    console.log(`[template] Book button text — 1img: "${prices["1"]}" | 5img: "${prices["5"]}" | 10img: "${prices["10"]}"`);

    // Check Gift a Friend button
    const giftBtn = page.locator("button").filter({ hasText: /Gift a Friend/i });
    const hasGift = await giftBtn.isVisible().catch(() => false);
    console.log(`[template] Gift a Friend button visible: ${hasGift}`);

    // Check QR Code button
    const qrBtn = page.locator("button").filter({ hasText: /QR Code/i });
    const hasQr = await qrBtn.isVisible().catch(() => false);
    console.log(`[template] QR Code button visible: ${hasQr}`);

    // Mobile layout
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);
    await shot(page, "02-template-mobile");

    // Check buttons still visible on mobile
    const mobileBook = await page.locator("button").filter({ hasText: /Book This Look/i }).isVisible().catch(() => false);
    const mobileGift = await page.locator("button").filter({ hasText: /Gift a Friend/i }).isVisible().catch(() => false);
    const mobilePkg1 = await page.locator("button").filter({ hasText: /^1\s+image/i }).isVisible().catch(() => false);
    console.log(`[template mobile] Book: ${mobileBook} | Gift: ${mobileGift} | 1-img btn: ${mobilePkg1}`);

    await page.setViewportSize({ width: 1280, height: 800 });
    console.log(`[template] Console errors: ${errors.join(" | ") || "none"}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test.describe("Section 3 — Gift Modal (unauthenticated)", () => {
  test("Gift a Friend redirects unauthenticated user to login", async ({ page }) => {
    await page.goto(TEMPLATE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("text=Book This Look", { timeout: 30_000 });

    const giftBtn = page.locator("button").filter({ hasText: /Gift a Friend/i });
    if (!await giftBtn.isVisible().catch(() => false)) {
      console.log("[gift] Gift a Friend button not found — skipping");
      return;
    }

    await giftBtn.click();
    await page.waitForTimeout(2_000);
    const url = page.url();
    console.log(`[gift] After clicking Gift (not logged in): URL = ${url}`);
    await shot(page, "03-gift-unauth-result");

    const isLogin = url.includes("/login");
    const isModal = await page.locator("text=Gift this style").isVisible().catch(() => false);
    console.log(`[gift] Redirected to login: ${isLogin} | Modal opened: ${isModal}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test.describe("Section 4 — QR Code Modal", () => {
  test("QR Code button opens the QR overlay", async ({ page }) => {
    await page.goto(TEMPLATE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("text=Book This Look", { timeout: 30_000 });

    const qrBtn = page.locator("button").filter({ hasText: /QR Code/i });
    if (!await qrBtn.isVisible().catch(() => false)) {
      console.log("[qr] QR Code button not visible — skipping");
      return;
    }

    await qrBtn.click();
    await page.waitForTimeout(2_000);
    await shot(page, "04-qr-modal");

    const hasDownload = await page.locator("text=Download Card").isVisible().catch(() => false);
    console.log(`[qr] 'Download Card' visible: ${hasDownload}`);

    const closeBtn = page.getByRole("button", { name: /✕|Close|close/i }).first();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click();
      await page.waitForTimeout(500);
      const stillOpen = await page.locator("text=Download Card").isVisible().catch(() => false);
      console.log(`[qr] Modal closed successfully: ${!stillOpen}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test.describe("Section 5 — Navigation", () => {
  test("all nav links present and functional", async ({ page }) => {
    await page.goto("/marketplace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2_000);

    // Collect all nav links
    const navLinks = await page.locator("nav a, header a").evaluateAll(els =>
      (els as HTMLAnchorElement[]).map(a => ({ text: a.innerText.trim(), href: a.href }))
    );
    console.log("[nav] Links found:", JSON.stringify(navLinks, null, 2));

    // Logo
    const logo = page.locator("a").filter({ hasText: /Alux|alux/i }).first();
    const hasLogo = await logo.isVisible().catch(() => false);
    console.log(`[nav] Logo visible: ${hasLogo}`);

    // Mobile hamburger
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);
    await shot(page, "05-nav-mobile");

    const hamburger = page.locator("button[aria-label*='menu' i], button[aria-label*='nav' i], button[class*='hamburger' i], button[class*='mobile' i]");
    const hasHamburger = await hamburger.first().isVisible().catch(() => false);
    console.log(`[nav mobile] Hamburger menu visible: ${hasHamburger}`);

    // Check if any nav links are cut off
    const navOverflow = await page.evaluate(() => {
      const nav = document.querySelector("nav");
      if (!nav) return "no nav element";
      return nav.scrollWidth > nav.clientWidth ? "OVERFLOWING" : "ok";
    });
    console.log(`[nav mobile] Nav overflow: ${navOverflow}`);

    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test("support page loads", async ({ page }) => {
    const res = await page.goto("/support", { waitUntil: "domcontentloaded" });
    const status = res?.status();
    const url = page.url();
    await page.waitForTimeout(2_000);
    await shot(page, "05-support-page");
    const bodyText = await page.locator("body").innerText().catch(() => "");
    console.log(`[support] Status: ${status} | Final URL: ${url}`);
    console.log(`[support] Page content excerpt: ${bodyText.slice(0, 300)}`);
  });

  test("homepage loads", async ({ page }) => {
    const start = Date.now();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const loadTime = ((Date.now() - start) / 1000).toFixed(1);
    await shot(page, "05-homepage");
    console.log(`[homepage] Load time: ${loadTime}s`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test.describe("Section 6 — Gift Unboxing & Success Pages", () => {
  test("gift unboxing page shows error for fake UUID", async ({ page }) => {
    await page.goto("/gift/00000000-0000-0000-0000-000000000000", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3_000);
    await shot(page, "06-gift-not-found");
    const text = await page.locator("body").innerText().catch(() => "");
    console.log(`[gift-page] Content: ${text.slice(0, 300)}`);
  });

  test("gift success page renders correctly", async ({ page }) => {
    await page.goto("/gift/success?gift_id=test-123", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3_000);
    await shot(page, "06-gift-success");
    const hasHeading = await page.locator("text=Your gift is ready!").isVisible().catch(() => false);
    const hasInput = await page.locator("input[readonly]").isVisible().catch(() => false);
    console.log(`[gift-success] Heading visible: ${hasHeading} | Share link input visible: ${hasInput}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
test.describe("Section 7 — Performance & Console Errors", () => {
  test("check console errors and network failures across key pages", async ({ page }) => {
    test.setTimeout(120_000);
    const consoleErrs: string[] = [];
    const networkErrs: string[] = [];
    const falLeaks: string[] = [];

    page.on("console", m => {
      if (m.type() === "error") consoleErrs.push(`[${page.url()}] ${m.text()}`);
    });
    page.on("response", res => {
      if (res.status() >= 400) networkErrs.push(`${res.status()} ${res.url()}`);
      if (res.url().includes("fal.ai") || res.url().includes("fal.media")) {
        falLeaks.push(res.url());
      }
    });

    // Visit key pages (relative — respects baseURL in config)
    for (const path of ["/marketplace", TEMPLATE_URL, "/gift/success"]) {
      await page.goto(path, { waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(500).catch(() => {});
    }

    console.log(`[errors] Console errors (${consoleErrs.length}):\n${consoleErrs.join("\n") || "none"}`);
    console.log(`[errors] Network errors (${networkErrs.length}):\n${networkErrs.join("\n") || "none"}`);
    console.log(`[security] Fal.ai browser requests (${falLeaks.length}):\n${falLeaks.join("\n") || "none"}`);
  });
});
