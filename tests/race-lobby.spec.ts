import { test, expect } from "@playwright/test";

/**
 * Bounty Run with others: two phones in one lobby see each other, one starts
 * the race, both end up racing the same recorded road with the same
 * countdown. Needs a ready road on the bounty (tests/road-record.spec.ts).
 *
 *   AR_TOKEN=<campaign token> npx playwright test tests/race-lobby.spec.ts
 */
const TOKEN = process.env.AR_TOKEN ?? "";
// Google Chrome, not the bundled Chromium: the road video is H.264, which the bundled build cannot decode.
test.use({ channel: "chrome" });

test("two hunters meet in the lobby and start together", async ({ browser }) => {
  test.skip(!TOKEN, "AR_TOKEN not set");
  test.setTimeout(300_000);
  const a = await browser.newContext();
  const b = await browser.newContext();
  const pa = await a.newPage(), pb = await b.newPage();
  for (const [p, name] of [[pa, "Ada"], [pb, "Bola"]] as const) {
    await p.goto(`/d/race/${TOKEN}?debug=1`);
    await expect(p.locator("[data-phase]")).toHaveAttribute("data-phase", "landing", { timeout: 15_000 });
    await expect(p.locator("[aria-pressed]").first()).toBeVisible({ timeout: 180_000 });
    await p.getByPlaceholder(/hunter name/i).fill(name);
    await p.getByRole("button", { name: /race others/i }).click();
    await expect(p.locator("[data-phase]")).toHaveAttribute("data-phase", "lobby", { timeout: 20_000 });
  }
  await expect(pa.getByText("Bola")).toBeVisible({ timeout: 30_000 });
  await expect(pb.getByText("Ada")).toBeVisible({ timeout: 30_000 });
  await pa.getByRole("button", { name: /start the race/i }).click();
  await expect(pa.locator("[data-phase]")).toHaveAttribute("data-phase", "racing", { timeout: 60_000 });
  await expect(pb.locator("[data-phase]")).toHaveAttribute("data-phase", "racing", { timeout: 60_000 });
  await expect(pa.locator("video")).toBeVisible();
  await expect(pb.locator("video")).toBeVisible();
  // The positions flow both ways: each page sees one other hunter racing.
  await expect(pa.getByText(/1 other hunter racing/i)).toBeVisible({ timeout: 30_000 });
  await expect(pb.getByText(/1 other hunter racing/i)).toBeVisible({ timeout: 30_000 });
  await a.close();
  await b.close();
});
