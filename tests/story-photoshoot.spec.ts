import { test, expect } from "@playwright/test";

const TEMPLATE_ID = "7108d242-24aa-4888-8e16-253d328d0143";

test.describe("Story Template: Mexico vs South Africa — Duo flow", () => {
  test("Phase A — edit template to Duo story with scenes", async ({ page }) => {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD env vars");

    // Login
    await page.goto("/login");
    await page.locator('input[type="email"], input[name="email"]').fill(email);
    await page.locator('input[type="password"], input[name="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(url => !url.pathname.startsWith("/login"), { timeout: 20_000 });

    // Creator dashboard
    await page.goto("/creator-dashboard");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    // Find the Mexico template card and click Edit
    const templateRow = page.locator("[class*='templateRow'], [class*='templateCard']")
      .filter({ hasText: "MEXICO" });
    await expect(templateRow).toBeVisible({ timeout: 15_000 });
    await templateRow.locator("button:has-text('Edit')").click();
    await page.waitForTimeout(1500);

    // ---- Story type: change from Solo to Duo ----
    // The story type buttons are in the creator dashboard form
    const duoBtn = page.locator("button:has-text('Duo')").first();
    await expect(duoBtn).toBeVisible({ timeout: 10_000 });
    await duoBtn.click();
    await page.waitForTimeout(500);

    // ---- Default role ----
    const defaultRoleInput = page.locator("input[placeholder*='role'], input[placeholder*='Role'], label:has-text('Default role') input").first();
    if (await defaultRoleInput.isVisible()) {
      await defaultRoleInput.clear();
      await defaultRoleInput.fill("the match-day fan");
    }

    // ---- Role chips ----
    const roleChipsInput = page.locator("input[placeholder*='chip'], label:has-text('Role chip') input").first();
    if (await roleChipsInput.isVisible()) {
      await roleChipsInput.clear();
      await roleChipsInput.fill("VIP Guest, Sports journalist, The devoted fan");
    }

    // ---- Scenes ----
    // Clear existing scenes if any, then add 3
    // First scene card (slot 1) — fill it in
    const firstCard = page.locator("[class*='sceneCard']").first();
    await expect(firstCard).toBeVisible({ timeout: 10_000 });

    const titleInput = (n: number) =>
      page.locator("[class*='sceneCard']").nth(n).locator("input[placeholder*='title'], input[placeholder*='Title']").first();
    const envInput = (n: number) =>
      page.locator("[class*='sceneCard']").nth(n).locator("input[placeholder*='nvironment'], input[placeholder*='ocation']").first();
    const wardrobeInput = (n: number) =>
      page.locator("[class*='sceneCard']").nth(n).locator("input[placeholder*='ardrobe'], input[placeholder*='utfit']").first();
    const descInput = (n: number) =>
      page.locator("[class*='sceneCard']").nth(n).locator("textarea, input[placeholder*='escription']").first();

    // Scene 1
    await titleInput(0).clear();
    await titleInput(0).fill("Match Day Arrival");
    if (await descInput(0).isVisible()) await descInput(0).fill("Arriving at the stadium gates amid the crowd");
    if (await envInput(0).isVisible()) await envInput(0).fill("packed stadium entrance, golden hour sunlight");
    if (await wardrobeInput(0).isVisible()) await wardrobeInput(0).fill("team jersey, fitted jeans");

    // Add Scene 2
    const addSceneBtn = page.locator("button:has-text('Add scene'), button:has-text('+ Scene')").first();
    await addSceneBtn.click();
    await page.waitForTimeout(500);

    await titleInput(1).clear();
    await titleInput(1).fill("Inside the Stand");
    if (await descInput(1).isVisible()) await descInput(1).fill("Finding your seat among the roaring crowd");
    if (await envInput(1).isVisible()) await envInput(1).fill("stadium stands, floodlights, packed audience");
    if (await wardrobeInput(1).isVisible()) await wardrobeInput(1).fill("jersey, stadium scarf");

    // Add Scene 3
    await addSceneBtn.click();
    await page.waitForTimeout(500);

    await titleInput(2).clear();
    await titleInput(2).fill("Victory Moment");
    if (await descInput(2).isVisible()) await descInput(2).fill("Celebrating after the final whistle");
    if (await envInput(2).isVisible()) await envInput(2).fill("pitch-side, confetti, stadium lights");
    if (await wardrobeInput(2).isVisible()) await wardrobeInput(2).fill("jersey, arms raised");

    // Verify 3 scene cards exist
    const sceneCount = await page.locator("[class*='sceneCard']").count();
    expect(sceneCount).toBeGreaterThanOrEqual(3);

    // Save
    const saveBtn = page.locator("button:has-text('Save changes'), button:has-text('Update template')").first();
    await saveBtn.click();
    await page.waitForTimeout(3000);

    // Verify no error visible
    const errorMsg = page.locator("[class*='error'], [class*='Error']").filter({ hasText: /error|failed/i });
    const hasError = await errorMsg.isVisible().catch(() => false);
    expect(hasError).toBe(false);
    console.log("Template saved without error.");
  });

  test("Phase B — template detail page shows story info and scene timeline", async ({ page }) => {
    await page.goto(`/marketplace/${TEMPLATE_ID}`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    // STORY badge
    await expect(page.locator("text=STORY").first()).toBeVisible({ timeout: 10_000 });
    console.log("STORY badge visible.");

    // Duo badge (DOM text is "duo", CSS textTransform makes it look like "Duo" visually)
    await expect(page.locator("text=/^duo$/i").first()).toBeVisible({ timeout: 5_000 });
    console.log("Duo label visible.");

    // Scene timeline section
    const timeline = page.locator("[class*='sceneTimeline']");
    await expect(timeline).toBeVisible({ timeout: 5_000 });
    console.log("Scene timeline section visible.");

    // At least one scene card
    const sceneCards = timeline.locator("[class*='sceneCard']");
    const count = await sceneCards.count();
    expect(count).toBeGreaterThanOrEqual(1);
    console.log(`Scene cards in timeline: ${count}`);

    // Co-star notice
    await expect(page.locator("text=co-star").first()).toBeVisible({ timeout: 5_000 });
    console.log("Co-star notice visible.");

    // Book button
    const bookBtn = page.locator("button:has-text('Book This Look')");
    await expect(bookBtn).toBeVisible();
    console.log("Book This Look button visible.");
  });

  test("Phase C — checkout panel shows role prompt, chips, and co-star upload", async ({ page }) => {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD env vars");

    // Login
    await page.goto("/login");
    await page.locator('input[type="email"], input[name="email"]').fill(email);
    await page.locator('input[type="password"], input[name="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(url => !url.pathname.startsWith("/login"), { timeout: 20_000 });

    // Go to template page
    await page.goto(`/marketplace/${TEMPLATE_ID}`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    // Open checkout
    await page.locator("button:has-text('Book This Look')").click();
    await page.waitForTimeout(2000);

    // Role prompt input must be visible
    const roleInput = page.locator(
      "input[placeholder*='role'], input[placeholder*='Role'], input[placeholder*=\"I'm\"], textarea[placeholder*='role']"
    ).first();
    await expect(roleInput).toBeVisible({ timeout: 10_000 });
    console.log("Role prompt input visible.");

    // Role chip buttons
    const chipVIP = page.locator("button:has-text('VIP Guest')");
    await expect(chipVIP).toBeVisible({ timeout: 5_000 });
    console.log("Role chips visible.");

    // Click a chip and verify it fills the input
    await chipVIP.click();
    await page.waitForTimeout(400);
    const roleValue = await roleInput.inputValue();
    expect(roleValue).toContain("VIP");
    console.log(`Role input after chip click: "${roleValue}"`);

    // Co-star upload section
    const costarSection = page.locator("text=/co-star/i, text=/Co-Star/i, text=/costar/i").first();
    await expect(costarSection).toBeVisible({ timeout: 5_000 });
    console.log("Co-star upload section visible.");

    // Consent checkbox
    const consentCheckbox = page.locator("input[type='checkbox']").first();
    await expect(consentCheckbox).toBeVisible({ timeout: 5_000 });
    console.log("Consent checkbox visible.");

    console.log("Phase C complete — all story UI elements confirmed.");
  });
});
