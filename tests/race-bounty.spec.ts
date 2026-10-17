import { test, expect } from "@playwright/test";

/**
 * Bounty Run in the browser: the bounty page lists the recorded roads, a
 * hunt plays one to the finish and the server ranks the time. The server
 * rules (prize claims, impossible times) are covered by
 * scripts/test-bounty.mjs on the server. Needs at least one ready road on
 * the bounty (tests/road-record.spec.ts makes one; the converter prepares it
 * within a minute or two).
 *
 *   AR_TOKEN=<campaign token> npx playwright test tests/race-bounty.spec.ts
 */
const TOKEN = process.env.AR_TOKEN ?? "";
// Google Chrome, not the bundled Chromium: the road video is H.264, which the bundled build cannot decode.
test.use({ channel: "chrome" });

test.describe("Bounty Run hunt", () => {
  test.skip(!TOKEN, "AR_TOKEN not set");

  test("a bad token says so", async ({ page }) => {
    await page.goto("/d/race/nottherightkindoftokenatall");
    await expect(page.locator("[data-phase]")).toHaveAttribute("data-phase", "notFound", { timeout: 15_000 });
  });

  test("a hunt plays a recorded road to the finish", async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto(`/d/race/${TOKEN}?debug=1`);
    await expect(page.locator("[data-phase]")).toHaveAttribute("data-phase", "landing", { timeout: 15_000 });
    await expect(page.getByText(/prizes left/i)).toBeVisible();
    // The page polls for roads every 15 s; a road someone just recorded takes a minute or two to prepare.
    await expect(page.locator("[aria-pressed]").first()).toBeVisible({ timeout: 180_000 });
    await page.getByPlaceholder(/hunter name/i).fill("Playwright");
    await page.getByRole("button", { name: /^hunt$/i }).click();
    await expect(page.locator("[data-phase]")).toHaveAttribute("data-phase", "racing", { timeout: 60_000 });
    await expect(page.locator("video")).toBeVisible();
    await expect(page.getByText(/to the prize/i)).toBeVisible();
    await page.keyboard.down("ArrowUp");
    await expect(page.locator("pre")).toContainText(/rate (0\.[3-9]|1\.|2\.)/, { timeout: 30_000 });
    // The road plays through to its end, the finish is sent, the time comes back.
    await expect(page.locator("[data-phase]")).toHaveAttribute("data-phase", "done", { timeout: 200_000 });
    await page.keyboard.up("ArrowUp");
    await expect(page.getByText(/fastest|home/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /hunt again/i })).toBeVisible();
  });
});
