import { test, expect } from "@playwright/test";

/**
 * Bounty Run, stage 1: the streets load, the car exists, and it moves.
 *
 *   npx playwright test tests/race-demo.spec.ts
 *
 * The first load of a new tile asks OpenStreetMap and can take a minute.
 */
const LAT = process.env.RACE_LAT ?? "6.4541";
const LNG = process.env.RACE_LNG ?? "3.3947";

test("the demo builds the streets and the car drives", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(`/d/race/demo?lat=${LAT}&lng=${LNG}&debug=1`);
  await expect(page.locator("[data-phase]")).toHaveAttribute("data-phase", "ready", { timeout: 150_000 });
  await expect.poll(async () => Number(await page.locator("[data-phase]").getAttribute("data-roads")), { timeout: 30_000 }).toBeGreaterThan(0);
  await expect(page.locator("canvas").first()).toBeVisible();
  const before = await page.locator("pre").innerText();
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(2500);
  await page.keyboard.up("ArrowUp");
  const after = await page.locator("pre").innerText();
  const speed = Number((after.match(/speed ([\d.]+)/) || [])[1] ?? 0);
  expect(speed).toBeGreaterThan(1);
  expect(after).not.toBe(before);
});

test("without a start it offers the location buttons", async ({ page }) => {
  await page.goto("/d/race/demo");
  await expect(page.locator("[data-phase]")).toHaveAttribute("data-phase", "locate");
  await expect(page.getByRole("button", { name: /use my location/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /lagos island/i })).toBeVisible();
});
