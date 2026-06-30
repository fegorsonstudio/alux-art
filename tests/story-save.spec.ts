/**
 * Story template save test — verifies that scene data entered in the
 * creator dashboard actually persists to the database and reloads correctly.
 *
 * Uses Supabase service-role magic link so no password is needed.
 * Run: SUPABASE_SERVICE_ROLE_KEY=<key> npx playwright test tests/story-save.spec.ts --headed
 */
import { test, expect } from "@playwright/test";

const TEMPLATE_ID = "7108d242-24aa-4888-8e16-253d328d0143";
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
  // Supabase verify redirects to /login?next=/creator-dashboard#access_token=...
  // The login page (auth fix deployed) detects hash tokens, calls setSession(),
  // then redirects to /creator-dashboard.
  const magicLink = await getMagicLink(
    ADMIN_EMAIL,
    "https://aluxartandframes.shop/creator-dashboard"
  );

  // Capture browser console output for debugging
  page.on("console", msg => console.log(`[browser ${msg.type()}]`, msg.text()));
  page.on("pageerror", err => console.log("[browser error]", err.message));

  await page.goto(magicLink);
  // Wait for redirect from supabase.co to the app
  await page.waitForURL(url => !url.href.includes("supabase.co"), { timeout: 20_000 });
  console.log("Redirected to app. On:", page.url());

  // Wait for login page to fully load and run its useEffect
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1000);

  // Check current hash
  const hashDebug = await page.evaluate(() => window.location.hash.slice(0, 50));
  console.log("Current hash (first 50 chars):", hashDebug);

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

  const editBtn = templateRow.locator("button:has-text('Edit')").first();
  await editBtn.click();
  await page.waitForTimeout(2000);
  console.log("Editor panel opened.");

  // ── Step 3: Verify story fields LOAD correctly from the DB ───────────────
  const isStoryChecked = await page.locator("text=THIS TEMPLATE IS A STORY")
    .locator("..")
    .locator("input[type='checkbox']")
    .isChecked()
    .catch(async () => {
      return page.locator("label:has-text('story') input[type='checkbox'], label:has-text('Story') input[type='checkbox']").first().isChecked().catch(() => false);
    });
  console.log(`isStory checkbox checked: ${isStoryChecked}`);
  expect(isStoryChecked).toBe(true);

  // "Duo" button should be active/selected
  const duoBtn = page.locator("button:has-text('Duo')").first();
  await expect(duoBtn).toBeVisible({ timeout: 5_000 });
  const duoClass = await duoBtn.getAttribute("class") ?? "";
  const duoIsActive = duoClass.includes("Active") || duoClass.includes("active") || duoClass.includes("selected");
  console.log(`Duo button active: ${duoIsActive} (class: "${duoClass}")`);
  expect(duoIsActive).toBe(true);

  // Default role should be loaded
  const defaultRoleInput = page.locator("input[placeholder*='fan'], input[placeholder*='role'], label:has-text('DEFAULT ROLE') input, label:has-text('Default role') input").first();
  const loadedRole = await defaultRoleInput.inputValue().catch(() => "");
  console.log(`Loaded defaultRole: "${loadedRole}"`);
  expect(loadedRole).toBe("the match-day fan");

  // At least 3 scene cards should be visible
  const sceneCards = page.locator("[class*='sceneCard'], [class*='scene-card'], div:has(> label:has-text('Scene title'))");
  const loadedSceneCount = await sceneCards.count();
  console.log(`Scene cards loaded: ${loadedSceneCount}`);
  expect(loadedSceneCount).toBeGreaterThanOrEqual(3);

  // Scene 1 title should show
  const scene1TitleInput = sceneCards.nth(0).locator("input[placeholder*='title'], input[placeholder*='Title']").first();
  const loadedScene1 = await scene1TitleInput.inputValue().catch(() => "");
  console.log(`Loaded scene 1 title: "${loadedScene1}"`);
  expect(loadedScene1).toBe("Match Day Arrival");

  // ── Step 4: Edit with new unique values ──────────────────────────────────
  const SAVE_MARKER = `T${Date.now()}`;

  await defaultRoleInput.clear();
  await defaultRoleInput.fill(`the dedicated supporter [${SAVE_MARKER}]`);

  await scene1TitleInput.clear();
  await scene1TitleInput.fill(`Stadium Gates [${SAVE_MARKER}]`);

  const scene2TitleInput = sceneCards.nth(1).locator("input[placeholder*='title'], input[placeholder*='Title']").first();
  await scene2TitleInput.clear();
  await scene2TitleInput.fill(`The Terrace [${SAVE_MARKER}]`);

  console.log(`Edited with marker: ${SAVE_MARKER}`);

  // ── Step 5: Save ─────────────────────────────────────────────────────────
  const saveBtn = page.locator("button:has-text('Save changes'), button:has-text('Update')").first();
  await expect(saveBtn).toBeVisible();
  await saveBtn.click();

  // Wait for editor to close
  await page.waitForFunction(
    () => !document.querySelector("input[placeholder*='title']"),
    { timeout: 15_000 }
  ).catch(() => page.waitForTimeout(4000));
  console.log("Save completed (editor closed).");

  // ── Step 6: Re-open and verify data persisted ────────────────────────────
  await page.waitForTimeout(1000);
  const templateRowAgain = page.locator("[class*='templateRow'], [class*='templateCard'], tr, li")
    .filter({ hasText: "MEXICO" });
  await expect(templateRowAgain).toBeVisible({ timeout: 10_000 });
  await templateRowAgain.locator("button:has-text('Edit')").first().click();
  await page.waitForTimeout(2000);
  console.log("Re-opened editor after save.");

  const duoBtnAfter = page.locator("button:has-text('Duo')").first();
  await expect(duoBtnAfter).toBeVisible({ timeout: 5_000 });
  const duoClassAfter = await duoBtnAfter.getAttribute("class") ?? "";
  const duoStillActive = duoClassAfter.includes("Active") || duoClassAfter.includes("active") || duoClassAfter.includes("selected");
  console.log(`Duo still active after reload: ${duoStillActive}`);
  expect(duoStillActive).toBe(true);

  const defaultRoleAfter = page.locator("input[placeholder*='fan'], input[placeholder*='role'], label:has-text('DEFAULT ROLE') input, label:has-text('Default role') input").first();
  const reloadedRole = await defaultRoleAfter.inputValue().catch(() => "");
  console.log(`Reloaded defaultRole: "${reloadedRole}"`);
  expect(reloadedRole).toContain(SAVE_MARKER);

  const sceneCardsAfter = page.locator("[class*='sceneCard'], [class*='scene-card'], div:has(> label:has-text('Scene title'))");
  const scene1TitleAfter = await sceneCardsAfter.nth(0).locator("input[placeholder*='title'], input[placeholder*='Title']").first().inputValue().catch(() => "");
  console.log(`Reloaded scene 1 title: "${scene1TitleAfter}"`);
  expect(scene1TitleAfter).toContain(SAVE_MARKER);

  const reloadedSceneCount = await sceneCardsAfter.count();
  console.log(`Scene count after reload: ${reloadedSceneCount}`);
  expect(reloadedSceneCount).toBeGreaterThanOrEqual(3);

  console.log("\nAll save/reload checks passed.");
  console.log(`  defaultRole: "${reloadedRole}"`);
  console.log(`  scene1 title: "${scene1TitleAfter}"`);
  console.log(`  scene count: ${reloadedSceneCount}`);
});
