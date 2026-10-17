import { test, expect } from "@playwright/test";

/**
 * The road camera: a road is recorded with the phone's camera while the GPS
 * is logged, then uploaded in parts. Chromium's fake camera supplies the
 * picture; the geolocation is moved north at 8 m/s so the track has length.
 *
 *   AR_TOKEN=<campaign token> npx playwright test tests/road-record.spec.ts
 */
const TOKEN = process.env.AR_TOKEN ?? "";

test.use({
  launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
  permissions: ["camera", "geolocation"],
  geolocation: { latitude: 9.1178, longitude: 7.3929 },
});

test("a road is recorded with the camera and uploaded", async ({ page, context }) => {
  test.skip(!TOKEN, "AR_TOKEN not set");
  test.setTimeout(240_000);
  await page.goto(`/d/road/${TOKEN}/record`);
  await expect(page.locator("[data-phase]")).toHaveAttribute("data-phase", "intro", { timeout: 15_000 });
  await page.getByPlaceholder(/your name/i).fill("Playwright");
  await page.getByRole("button", { name: /open the camera/i }).click();
  await expect(page.locator("[data-phase]")).toHaveAttribute("data-phase", "camera", { timeout: 20_000 });
  await page.getByRole("button", { name: /start recording/i }).click();
  await expect(page.locator("[data-phase]")).toHaveAttribute("data-phase", "recording");
  for (let i = 1; i <= 12; i++) {
    await context.setGeolocation({ latitude: 9.1178 + (i * 8) / 110_540, longitude: 7.3929 });
    await page.waitForTimeout(1000);
  }
  await page.getByRole("button", { name: /stop recording/i }).click();
  await expect(page.locator("[data-phase]")).toHaveAttribute("data-phase", "review", { timeout: 20_000 });
  await expect(page.getByText(/GPS fixes/)).toBeVisible();
  await page.getByPlaceholder(/name this road/i).fill("Playwright test road");
  await page.getByRole("button", { name: /use this road/i }).click();
  await expect(page.locator("[data-phase]")).toHaveAttribute("data-phase", "done", { timeout: 120_000 });
  await expect(page.getByText(/preparing it now/i)).toBeVisible();
});
