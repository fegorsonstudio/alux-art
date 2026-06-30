/**
 * Story template save test — verifies that scene data entered in the
 * creator dashboard actually persists to the database and reloads correctly.
 *
 * Uses Supabase service-role magic link so no password is needed.
 * Run: SUPABASE_SERVICE_ROLE_KEY=<key> npx playwright test tests/story-save.spec.ts --headed
 */
import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = "fegorsonphotography@gmail.com";
const SUPABASE_URL = "https://owdfoxglbxrqhgqbvkon.supabase.co";

async function getMagicLink(email: string, redirectTo: string): Promise<string> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY env var is required");
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "apikey": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "magiclink", email, redirect_to: redirectTo }),
  });
  const data = await res.json() as Record<string, unknown>;
  if (!data.action_link) throw new Error(`Magic link failed: ${JSON.stringify(data)}`);
  return data.action_link as string;
}

test("story template: fill scenes, save, verify data persists", async ({ page }) => {
  test.setTimeout(120_000);

  // ── Step 1: Authenticate via magic link ──────────────────────────────────
  const magicLink = await getMagicLink(
    ADMIN_EMAIL,
    "https://aluxartandframes.shop/creator-dashboard"
  );

  await page.goto(magicLink);
  await page.waitForURL(url => !url.href.includes("supabase.co"), { timeout: 20_000 });
  console.log("Redirected to app. On:", page.url());

  // Login page setSession() fires and redirects away from /login
  await page.waitForURL(
    url => !url.pathname.startsWith("/login"),
    { timeout: 15_000 }
  );
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000);
  console.log("Logged in. Now on:", page.url());

  // ── Step 2: Open the Mexico template for editing ─────────────────────────
  const templateRow = page.locator("[class*='templateRow'], [class*='templateCard'], tr, li")
    .filter({ hasText: "MEXICO" });
  await expect(templateRow).toBeVisible({ timeout: 15_000 });
  await templateRow.locator("button:has-text('Edit')").first().click();
  await page.waitForTimeout(2000);
  console.log("Editor panel opened.");

  // ── Step 3: Verify story fields LOAD correctly from the DB ───────────────
  // isStory checkbox
  const isStoryChecked = await page.locator("text=THIS TEMPLATE IS A STORY")
    .locator("..")
    .locator("input[type='checkbox']")
    .isChecked()
    .catch(() => false);
  console.log(`isStory checked: ${isStoryChecked}`);
  expect(isStoryChecked).toBe(true);

  // Duo button active
  const duoBtn = page.locator("button:has-text('Duo')").first();
  await expect(duoBtn).toBeVisible({ timeout: 5_000 });
  const duoClass = await duoBtn.getAttribute("class") ?? "";
  const duoIsActive = /[Aa]ctive|selected/.test(duoClass);
  console.log(`Duo active: ${duoIsActive}`);
  expect(duoIsActive).toBe(true);

  // Default role input (exact placeholder from creator-dashboard/page.tsx)
  const defaultRoleInput = page.locator('input[placeholder*="the fan in the stands"]').first();
  const loadedRole = await defaultRoleInput.inputValue().catch(() => "");
  console.log(`Loaded defaultRole: "${loadedRole}"`);
  expect(loadedRole).toBe("the match-day fan");

  // Scene title inputs — each scene has a unique placeholder "Scene title (e.g. Arrival at the Stadium)"
  const sceneTitleInputs = page.locator('input[placeholder*="Scene title"]');
  const loadedSceneCount = await sceneTitleInputs.count();
  console.log(`Scene title inputs: ${loadedSceneCount}`);
  expect(loadedSceneCount).toBeGreaterThanOrEqual(3);

  const loadedScene1 = await sceneTitleInputs.nth(0).inputValue().catch(() => "");
  console.log(`Loaded scene 1 title: "${loadedScene1}"`);
  expect(loadedScene1).toBe("Match Day Arrival");

  // ── Step 4: Edit with new unique values ──────────────────────────────────
  const SAVE_MARKER = `T${Date.now()}`;

  await defaultRoleInput.clear();
  await defaultRoleInput.fill(`the dedicated supporter [${SAVE_MARKER}]`);

  await sceneTitleInputs.nth(0).clear();
  await sceneTitleInputs.nth(0).fill(`Stadium Gates [${SAVE_MARKER}]`);

  await sceneTitleInputs.nth(1).clear();
  await sceneTitleInputs.nth(1).fill(`The Terrace [${SAVE_MARKER}]`);

  console.log(`Edited with marker: ${SAVE_MARKER}`);

  // ── Step 5: Save ─────────────────────────────────────────────────────────
  const saveBtn = page.locator("button:has-text('Save changes'), button:has-text('Update')").first();
  await expect(saveBtn).toBeVisible();
  await saveBtn.click();

  // Wait for editor to close (title inputs disappear)
  await page.waitForFunction(
    () => !document.querySelector('input[placeholder*="Scene title"]'),
    { timeout: 15_000 }
  ).catch(() => page.waitForTimeout(4000));
  console.log("Save completed.");

  // ── Step 6: Re-open and verify data persisted ────────────────────────────
  await page.waitForTimeout(1000);
  const templateRowAgain = page.locator("[class*='templateRow'], [class*='templateCard'], tr, li")
    .filter({ hasText: "MEXICO" });
  await expect(templateRowAgain).toBeVisible({ timeout: 10_000 });
  await templateRowAgain.locator("button:has-text('Edit')").first().click();
  await page.waitForTimeout(2000);
  console.log("Re-opened editor.");

  // Duo still active
  const duoBtnAfter = page.locator("button:has-text('Duo')").first();
  await expect(duoBtnAfter).toBeVisible({ timeout: 5_000 });
  const duoClassAfter = await duoBtnAfter.getAttribute("class") ?? "";
  expect(/[Aa]ctive|selected/.test(duoClassAfter)).toBe(true);

  // Default role persisted
  const defaultRoleAfter = page.locator('input[placeholder*="the fan in the stands"]').first();
  const reloadedRole = await defaultRoleAfter.inputValue().catch(() => "");
  console.log(`Reloaded defaultRole: "${reloadedRole}"`);
  expect(reloadedRole).toContain(SAVE_MARKER);

  // Scene 1 title persisted
  const sceneTitlesAfter = page.locator('input[placeholder*="Scene title"]');
  const scene1After = await sceneTitlesAfter.nth(0).inputValue().catch(() => "");
  console.log(`Reloaded scene 1 title: "${scene1After}"`);
  expect(scene1After).toContain(SAVE_MARKER);

  // Scene count preserved
  const sceneCountAfter = await sceneTitlesAfter.count();
  console.log(`Scene count after reload: ${sceneCountAfter}`);
  expect(sceneCountAfter).toBeGreaterThanOrEqual(3);

  console.log("\nAll save/reload checks passed.");
});
