import { test, expect, devices } from "@playwright/test";

/**
 * The AR balloon viewer, without a real phone: a fake camera, a granted
 * geolocation that is moved in and out of the circle, and the preview link.
 *
 *   AR_TOKEN=<token> AR_PREVIEW=<preview token> AR_LAT=6.52 AR_LNG=3.38 npx playwright test tests/ar-viewer.spec.ts
 *
 * Skipped when AR_TOKEN is not set: it needs a real campaign on the server
 * the config points at.
 */

const TOKEN = process.env.AR_TOKEN ?? "";
const PREVIEW = process.env.AR_PREVIEW ?? "";
const LAT = Number(process.env.AR_LAT ?? "6.5244");
const LNG = Number(process.env.AR_LNG ?? "3.3792");

test.describe("AR balloon viewer", () => {
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

  test.describe("on a phone", () => {
    test.use({
      ...devices["Pixel 5"],
      permissions: ["geolocation", "camera"],
      geolocation: { latitude: LAT + 0.01, longitude: LNG, accuracy: 10 },
      launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
    });

    test("outside the circle it shows the distance, inside it shows the camera", async ({ page, context }) => {
      await page.goto(`/d/ar/${TOKEN}?debug=1`);
      await expect(page.locator("[data-phase]")).toHaveAttribute("data-phase", "landing", { timeout: 15_000 });
      await page.getByRole("button", { name: /start/i }).click();
      await expect(page.locator("[data-phase]")).toHaveAttribute("data-phase", "outside", { timeout: 20_000 });
      await expect(page.getByText(/km|\d+ m/).first()).toBeVisible();

      // Two fixes inside are needed before it flips (the hysteresis rule).
      await context.setGeolocation({ latitude: LAT, longitude: LNG, accuracy: 10 });
      await page.waitForTimeout(1500);
      await context.setGeolocation({ latitude: LAT + 0.00001, longitude: LNG, accuracy: 10 });
      await expect(page.locator("[data-phase]")).toHaveAttribute("data-phase", "active", { timeout: 20_000 });
      await expect(page.locator("video")).toBeVisible();
      await expect(page.locator("canvas")).toBeVisible();
    });

    test("the preview link skips the location check", async ({ page }) => {
      test.skip(!PREVIEW, "AR_PREVIEW not set");
      await page.goto(`/d/ar/${TOKEN}?p=${PREVIEW}`);
      await expect(page.getByText(/preview/i).first()).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: /start/i }).click();
      await expect(page.locator("[data-phase]")).toHaveAttribute("data-phase", "active", { timeout: 20_000 });
    });
  });
});
