import { test, expect } from "@playwright/test";

const TEMPLATE_ID = "51fddb50-228e-417a-9b68-8c3600d91735";
const TEMPLATE_URL = `/marketplace/${TEMPLATE_ID}`;

const MOCK_TEMPLATE = {
  id: TEMPLATE_ID,
  title: "Luxury Studio Look",
  description: "A bold editorial look.",
  category: "fashion",
  tags: ["editorial", "luxury"],
  priceNgn: 35000,
  price1Ngn: 35000,
  price5Ngn: 150000,
  shootMode: "fast",
  aspectRatio: "4:5",
  packageSize: 5,
  purchaseCount: 12,
  avgRating: 4.5,
  ratingCount: 8,
  userRating: null,
  coverUrl: null,
  images: [],
  creator: {
    id: "creator-1",
    displayName: "AluxArt Studio",
    bio: "Premium virtual studio",
    avatarUrl: null,
    templateCount: 5,
    theme: null,
    fontFamily: null,
  },
};

test.describe("Luxury QR Share Card", () => {
  test.beforeEach(async ({ page }) => {
    // Mock the marketplace API so tests run without a live VPS connection
    await page.route(`**/api/marketplace/${TEMPLATE_ID}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ template: MOCK_TEMPLATE }),
      });
    });

    // Mock auth endpoints so the page doesn't stall waiting for them
    await page.route("**/api/user/creator-status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ isCreator: false }),
      });
    });

    await page.route("**/api/me", async (route) => {
      await route.fulfill({ status: 200 });
    });

    await page.goto(TEMPLATE_URL);
    await page.waitForSelector("text=Book This Look", { timeout: 15_000 });
  });

  test("QR Code button is visible on the template page", async ({ page }) => {
    const qrBtn = page.getByRole("button", { name: "QR Code" });
    await expect(qrBtn).toBeVisible();
  });

  test("clicking QR Code opens the luxury overlay", async ({ page }) => {
    await page.getByRole("button", { name: "QR Code" }).click();

    // The overlay backdrop uses position:fixed
    const overlay = page.locator('[style*="position: fixed"]').first();
    await expect(overlay).toBeVisible();
  });

  test("overlay contains the creator handle with @ prefix", async ({ page }) => {
    await page.getByRole("button", { name: "QR Code" }).click();

    // Creator handle contains "@" and is uppercase
    const handle = page.locator("p").filter({ hasText: /@[A-Z_]+/ }).first();
    await expect(handle).toBeVisible();
  });

  test("overlay contains iPhone and Android instructions", async ({ page }) => {
    await page.getByRole("button", { name: "QR Code" }).click();

    await expect(page.locator("text=iPhone")).toBeVisible();
    await expect(page.locator("text=Android")).toBeVisible();
    await expect(page.locator("text=Screenshot").first()).toBeVisible();
  });

  test("Download Card + Cover triggers file download with correct naming", async ({ page }) => {
    await page.getByRole("button", { name: "QR Code" }).click();
    await expect(page.getByRole("button", { name: /Download Card/ })).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /Download Card/ }).click(),
    ]);

    const suggestedName = download.suggestedFilename();
    expect(suggestedName).toMatch(/\.png$/i);
    expect(suggestedName).toMatch(/-qr-share\.png$/i);
  });

  test("Close button dismisses the overlay", async ({ page }) => {
    await page.getByRole("button", { name: "QR Code" }).click();
    await expect(page.locator("text=iPhone")).toBeVisible();

    await page.getByRole("button", { name: /✕ Close/ }).click();
    await expect(page.locator("text=iPhone")).not.toBeVisible({ timeout: 3_000 });
  });
});
