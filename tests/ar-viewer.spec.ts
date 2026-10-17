import { test, expect } from "@playwright/test";

/**
 * Desktop half; the phone half (fake camera, emulated Pixel) is ar-viewer-phone.spec.ts.
 * The AR balloon viewer, without a real phone: a fake camera, a granted
 * geolocation that is moved in and out of the circle, and the preview link.
 *
 *   AR_TOKEN=<token> AR_PREVIEW=<preview token> AR_LAT=6.52 AR_LNG=3.38 npx playwright test tests/ar-viewer.spec.ts
 *
 * Skipped when AR_TOKEN is not set: it needs a real campaign on the server
 * the config points at.
 */

const TOKEN = process.env.AR_TOKEN ?? "";

test.describe("AR balloon viewer (desktop)", () => {
  test.skip(!TOKEN, "AR_TOKEN not set");

  test("a desktop sees the QR screen and is never asked for the camera", async ({ page }) => {
    await page.goto(`/d/ar/${TOKEN}`);
    await expect(page.locator("[data-phase]")).toHaveAttribute("data-phase", "desktop", { timeout: 15_000 });
    await expect(page.locator("svg[viewBox]").first()).toBeVisible();
  });

  test("an unknown token says the link is not valid", async ({ page }) => {
    await page.goto(`/d/ar/nottherightkindoftokenatall`);
    await expect(page.locator("[data-phase]")).toHaveAttribute("data-phase", "notFound", { timeout: 15_000 });
  });
});
