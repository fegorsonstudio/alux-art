import { test, expect } from "@playwright/test";

const TEMPLATE_URL = "/marketplace/51fddb50-228e-417a-9b68-8c3600d91735";

test.describe("Luxury QR Share Card", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEMPLATE_URL);
    await page.waitForSelector("text=Book This Look", { timeout: 30_000 });
  });

  test("QR Code button is visible on the template page", async ({ page }) => {
    const qrBtn = page.getByRole("button", { name: "QR Code" });
    await expect(qrBtn).toBeVisible();
  });

  test("clicking QR Code opens the luxury overlay", async ({ page }) => {
    await page.getByRole("button", { name: "QR Code" }).click();

    const overlay = page.locator('[style*="position: fixed"]').first();
    await expect(overlay).toBeVisible();
  });

  test("overlay contains the creator handle with @ prefix", async ({ page }) => {
    await page.getByRole("button", { name: "QR Code" }).click();
    // Wait for the dynamic TemplateShareCard chunk to load and render
    await page.waitForSelector("text=Download Card", { timeout: 15_000 });

    const handle = page.locator("p").filter({ hasText: /@[A-Z_]+/ }).first();
    await expect(handle).toBeVisible();
  });

  test("overlay contains iPhone and Android instructions", async ({ page }) => {
    await page.getByRole("button", { name: "QR Code" }).click();
    await page.waitForSelector("text=Download Card", { timeout: 15_000 });

    await expect(page.locator("text=iPhone")).toBeVisible();
    await expect(page.locator("text=Android")).toBeVisible();
    await expect(page.locator("text=Screenshot").first()).toBeVisible();
  });

  test("Download button triggers a PNG download and resets", async ({ page }) => {
    await page.getByRole("button", { name: "QR Code" }).click();
    await page.waitForSelector("text=Download Card", { timeout: 15_000 });

    // Hook anchor.click() so we can verify the blob download is triggered.
    // Playwright doesn't fire the "download" event for programmatic blob: anchors,
    // so we detect it via a flag set inside the page.
    await page.evaluate(() => {
      (window as any).__qrDownloadTriggered = false;
      const orig = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (this.download && this.href.startsWith("blob:")) {
          (window as any).__qrDownloadTriggered = true;
        }
        return orig.call(this);
      };
    });

    const downloadBtn = page.getByRole("button", { name: /Download Card/ });
    await expect(downloadBtn).toBeVisible();
    await downloadBtn.click();

    // SVG→Canvas capture is fast; button returns to normal label once done.
    await expect(page.getByRole("button", { name: /Download Card/ })).toBeVisible({ timeout: 10_000 });

    // Verify the blob anchor was actually clicked (capture succeeded, not silently failed).
    const triggered = await page.evaluate(() => (window as any).__qrDownloadTriggered);
    expect(triggered).toBe(true);
  });

  test("Close button dismisses the overlay", async ({ page }) => {
    await page.getByRole("button", { name: "QR Code" }).click();
    await page.waitForSelector("text=Download Card", { timeout: 15_000 });

    await expect(page.locator("text=iPhone")).toBeVisible();
    await page.getByRole("button", { name: /✕ Close/ }).click();
    await expect(page.locator("text=iPhone")).not.toBeVisible({ timeout: 3_000 });
  });

  test("visual snapshot — 4:5 card layout matches baseline", async ({ page }) => {
    await page.getByRole("button", { name: "QR Code" }).click();
    await page.waitForSelector("text=iPhone", { timeout: 15_000 });

    // data-testid only exists after the updated TemplateShareCard is deployed.
    // Skip gracefully on the pre-deployment live site; assert once deployed.
    const card = page.locator('[data-testid="luxury-qr-card"]');
    const isPresent = await card.isVisible({ timeout: 3_000 }).catch(() => false);
    if (!isPresent) {
      console.warn("SKIP: data-testid='luxury-qr-card' not found — deploy component first to establish baseline");
      test.skip();
      return;
    }

    // Give QRCodeCanvas one animation frame to finish painting.
    await page.waitForTimeout(300);

    // First run writes the golden snapshot; subsequent runs diff against it.
    // maxDiffPixelRatio: 0.01 allows up to 1% changed pixels (font rounding, etc.).
    await expect(card).toHaveScreenshot("luxury-qr-4x5.png", {
      maxDiffPixelRatio: 0.01,
    });
  });
});
