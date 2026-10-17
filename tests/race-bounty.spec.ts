import { test, expect } from "@playwright/test";

/**
 * Bounty Run stage 2 in the browser: the bounty page, a hunt that starts on a
 * real street with the balloons as the goal. The server rules (prize claims,
 * impossible times) are covered by scripts/test-bounty.mjs on the server.
 *
 *   AR_TOKEN=<campaign token> npx playwright test tests/race-bounty.spec.ts
 */
const TOKEN = process.env.AR_TOKEN ?? "";

test.describe("Bounty Run hunt", () => {
  test.skip(!TOKEN, "AR_TOKEN not set");

  test("a bad token says so", async ({ page }) => {
    await page.goto("/d/race/nottherightkindoftokenatall");
    await expect(page.locator("[data-phase]")).toHaveAttribute("data-phase", "notFound", { timeout: 15_000 });
  });

  test("the hunt starts on a real street with the prize in sight", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto(`/d/race/${TOKEN}?debug=1`);
    await expect(page.locator("[data-phase]")).toHaveAttribute("data-phase", "landing", { timeout: 15_000 });
    await expect(page.getByText(/prizes left/i)).toBeVisible();
    await page.getByPlaceholder(/hunter name/i).fill("Playwright");
    await page.getByRole("button", { name: /^hunt$/i }).click();
    await expect(page.locator("[data-phase]")).toHaveAttribute("data-phase", "racing", { timeout: 200_000 });
    await expect(page.locator("canvas").first()).toBeVisible();
    await expect(page.getByText(/to the prize/i)).toBeVisible();
    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(2500);
    await page.keyboard.up("ArrowUp");
    const dbg = await page.locator("pre").innerText();
    expect(Number((dbg.match(/speed ([\d.]+)/) || [])[1] ?? 0)).toBeGreaterThan(1);
  });
});
