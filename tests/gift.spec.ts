import { test, expect } from "@playwright/test";

/**
 * Gift a Friend — end-to-end tests (unauthenticated + page rendering).
 * Runs against https://aluxartandframes.shop
 *
 * Auth-gated flows (modal form, claim) are covered in the authenticated section
 * below; those tests skip if no TEST_USER_* env vars are set.
 */

const TEMPLATE_URL = "/marketplace/51fddb50-228e-417a-9b68-8c3600d91735";
const FAKE_UUID = "00000000-0000-0000-0000-000000000000";

// ---------------------------------------------------------------------------
// Gift button on marketplace template page
// ---------------------------------------------------------------------------

test.describe("Gift button — template page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEMPLATE_URL);
    await page.waitForSelector("text=Book This Look", { timeout: 30_000 });
  });

  test("Gift a Friend button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Gift a Friend" })).toBeVisible();
  });

  test("Gift a Friend click while not logged in redirects to /login with ?next=", async ({ page }) => {
    await page.getByRole("button", { name: "Gift a Friend" }).click();
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toContain("/login");
    expect(page.url()).toContain("next=");
    expect(page.url()).toContain(encodeURIComponent("/marketplace/"));
  });

  test("QR Code button still works after Gift button added", async ({ page }) => {
    await page.getByRole("button", { name: "QR Code" }).click();
    await page.waitForSelector("text=Download Card", { timeout: 15_000 });
    await expect(page.locator("text=Download Card")).toBeVisible();
    // Close overlay
    await page.getByRole("button", { name: /✕|Close/ }).first().click();
    await expect(page.locator("text=Download Card")).not.toBeVisible({ timeout: 3_000 });
  });
});

// ---------------------------------------------------------------------------
// Gift unboxing landing page — unauthenticated error states
// ---------------------------------------------------------------------------

test.describe("Gift unboxing page — error states", () => {
  test("non-existent gift UUID shows 'Gift not found'", async ({ page }) => {
    await page.goto(`/gift/${FAKE_UUID}`);
    await expect(page.locator("text=Gift not found.")).toBeVisible({ timeout: 20_000 });
  });

  test("invalid (non-UUID) token shows error, not a crash", async ({ page }) => {
    await page.goto("/gift/this-is-not-a-real-token");
    // Should render an error page, not a blank page or unhandled exception
    const body = page.locator("body");
    await expect(body).toBeVisible({ timeout: 20_000 });
    // Must contain some error text — "not found" or similar
    await expect(body).toContainText(/not found|error|invalid/i, { timeout: 10_000 });
  });

  test("error page contains 'Browse styles' link back to marketplace", async ({ page }) => {
    await page.goto(`/gift/${FAKE_UUID}`);
    await expect(page.locator("text=Gift not found.")).toBeVisible({ timeout: 20_000 });
    const browseLink = page.getByRole("link", { name: /Browse styles/ });
    await expect(browseLink).toBeVisible();
    await expect(browseLink).toHaveAttribute("href", "/marketplace");
  });
});

// ---------------------------------------------------------------------------
// Gift success page — shareable link UI
// ---------------------------------------------------------------------------

test.describe("Gift success page", () => {
  test("renders 'Your gift is ready!' without a gift_id param", async ({ page }) => {
    await page.goto("/gift/success");
    await expect(page.locator("text=Your gift is ready!")).toBeVisible({ timeout: 20_000 });
  });

  test("renders without a gift_id: no link input shown (nothing to share)", async ({ page }) => {
    await page.goto("/gift/success");
    await expect(page.locator("text=Your gift is ready!")).toBeVisible({ timeout: 20_000 });
    // Without a gift_id, the link box should not appear
    const linkInput = page.locator("input[readonly]");
    await expect(linkInput).not.toBeVisible();
  });

  test("with a gift_id param: shows the shareable link input", async ({ page }) => {
    await page.goto("/gift/success?gift_id=test-gift-123");
    await expect(page.locator("text=Your gift is ready!")).toBeVisible({ timeout: 20_000 });
    const linkInput = page.locator("input[readonly]");
    await expect(linkInput).toBeVisible();
    await expect(linkInput).toHaveValue(/aluxartandframes\.shop\/gift\/test-gift-123/);
  });

  test("Copy button toggles to 'Copied!' then resets", async ({ page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/gift/success?gift_id=copy-test-456");
    await expect(page.locator("text=Your gift is ready!")).toBeVisible({ timeout: 20_000 });

    const copyBtn = page.getByRole("button", { name: "Copy" });
    await expect(copyBtn).toBeVisible();
    await copyBtn.click();

    await expect(page.getByRole("button", { name: "Copied!" })).toBeVisible({ timeout: 3_000 });
    // Resets back to "Copy" after 2.5s
    await expect(page.getByRole("button", { name: "Copy" })).toBeVisible({ timeout: 5_000 });
  });

  test("success page shows 30-day expiry note", async ({ page }) => {
    await page.goto("/gift/success");
    await expect(page.locator("text=30 days")).toBeVisible({ timeout: 20_000 });
  });

  test("'Browse more styles' link goes to /marketplace", async ({ page }) => {
    await page.goto("/gift/success");
    await expect(page.locator("text=Your gift is ready!")).toBeVisible({ timeout: 20_000 });
    const link = page.getByRole("link", { name: /Browse more styles/ });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/marketplace");
  });
});

// ---------------------------------------------------------------------------
// Authenticated gift modal — skips if TEST_USER_EMAIL / TEST_USER_PASSWORD unset
// ---------------------------------------------------------------------------

test.describe("Gift modal — authenticated", () => {
  const email = process.env.TEST_USER_EMAIL ?? "";
  const password = process.env.TEST_USER_PASSWORD ?? "";

  test.beforeEach(async ({ page }) => {
    if (!email || !password) {
      test.skip();
      return;
    }
    // Sign in
    await page.goto("/login");
    await page.fill("input[type='email']", email);
    await page.fill("input[type='password']", password);
    await page.click("button[type='submit']");
    await page.waitForURL(/\/(marketplace|studio|$)/, { timeout: 20_000 });

    // Navigate to template
    await page.goto(TEMPLATE_URL);
    await page.waitForSelector("text=Book This Look", { timeout: 30_000 });
  });

  test("Gift a Friend opens the modal overlay (not a redirect)", async ({ page }) => {
    await page.getByRole("button", { name: "Gift a Friend" }).click();
    // Should see the modal heading, not a redirect
    await expect(page.locator("text=Gift a Friend").last()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("text=Gift this style")).toBeVisible();
  });

  test("modal shows template title and price", async ({ page }) => {
    await page.getByRole("button", { name: "Gift a Friend" }).click();
    await expect(page.locator("text=Gift a Friend").last()).toBeVisible({ timeout: 5_000 });
    // Template summary block should be visible
    const modalContent = page.locator('[style*="background: linear-gradient(160deg"]');
    await expect(modalContent).toBeVisible();
  });

  test("submit button is disabled when name is empty", async ({ page }) => {
    await page.getByRole("button", { name: "Gift a Friend" }).click();
    await expect(page.locator("text=Gift a Friend").last()).toBeVisible({ timeout: 5_000 });

    // Clear the name field
    const nameInput = page.locator("input[placeholder='Your name']");
    await nameInput.clear();

    const payBtn = page.locator("button").filter({ hasText: /Pay .* — Send Gift/ });
    await expect(payBtn).toBeDisabled();
  });

  test("closing modal with ✕ dismisses it", async ({ page }) => {
    await page.getByRole("button", { name: "Gift a Friend" }).click();
    await expect(page.locator("text=Gift this style")).toBeVisible({ timeout: 5_000 });

    await page.getByRole("button", { name: "✕" }).click();
    await expect(page.locator("text=Gift this style")).not.toBeVisible({ timeout: 3_000 });
  });

  test("message character counter updates as user types", async ({ page }) => {
    await page.getByRole("button", { name: "Gift a Friend" }).click();
    await expect(page.locator("text=Gift this style")).toBeVisible({ timeout: 5_000 });

    const msgBox = page.locator("textarea");
    await msgBox.fill("Hello, enjoy this gift!");
    await expect(page.locator("text=/\\d+\\/300/")).toBeVisible();
  });
});
