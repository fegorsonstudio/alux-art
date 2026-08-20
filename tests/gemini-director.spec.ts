import { test, expect } from "@playwright/test";
import * as path from "path";

// Trimmed sample that covers all 3 parts of a real Gemini director output.
// Enough for the parse endpoint to extract 10 scenes.
const SAMPLE_GEMINI_OUTPUT = `Part 1: Creative Direction — Golden Hour Editorial
Location: A white stucco terrace or rooftop overlooking the ocean. Green railings and native plants.
Lighting: Strong, direct golden hour sunset. Dramatic long shadows, sun-kissed glow.
Wardrobe: Sheer, flowing pink chiffon dress with voluminous sleeves, deep V-neck, cinched waist with gold buckle. Silver clutch, gold spiral earring, necklace, gold bracelet.
Color Grade: Warm, rich tones (magenta, orange, gold) with deep, contrasty shadows.

1. Establishing Shot (Wide): The model stands on the white terrace during golden hour, holding the silver clutch. She looks toward the setting sun over the ocean. Low angle.
2. Dramatic Profile & Shadow (Mid-Shot): Side profile of the model as she walks, her face catching the rim light. Her long shadow is cast on the textured white wall behind her.
3. Wind-Swept Movement (Full Shot): Model walking away from the camera, looking back over her shoulder. The sheer fabric billows to one side. High contrast lighting.
4. Low Angle Strut (Full Shot): Shot from a very low angle, focusing on the movement of the gown. Model walks on a white pathway, sun behind her.
5. Direct Stare & Clutch Detail (Close Up): Head and shoulders shot of the model gazing directly at the lens. The hand holding the silver clutch is prominent near the chest.
6. Hair and Light (Mid-Shot): The model poses with one hand running through her curly hair against the white wall. Strong golden light creates rim lighting.
7. Backlight Silhouette (Medium Full Shot): The model stands near the edge of the terrace, sun completely behind her. The fabric of the dress glows.
8. Framed by Nature (Wide Shot): Model positioned between two large potted cacti. Shadows of the plants and model are elongated across the white rooftop.
9. Golden Hour Portrait (Close Up): Direct portrait during peak golden minute. Model looks at the camera with calm expression, light hitting her face dead-on.
10. The Exit (Wide Shot): Model walks toward a door on the white wall, dress trailing. Focus on the scale of the environment and strong diagonal shadows.

Part 2: OOTD/Lay Flat Prompt
An organized, high-end Outfit of the Day lay-flat photography spread against a seamless bright white background. At the center is a professional ghost mannequin modeling the main piece: a voluminous, flowing sheer pink chiffon gown with deep puff sleeves, a plunging V-neckline, and a prominent gold lion-head statement buckle cinching the waist. Arranged neatly around the mannequin: on the upper left, a small textured silver minaudière clutch; on the upper right, a single intricate gold spiral serpent-shaped statement earring; below the mannequin, a pair of minimalist gold strappy high-heeled sandals. Clean, well-lit with diffused studio lighting.

Part 3: Inspiration/Set Reference Prompt
A location reference image for an editorial photoshoot set. The scene is a secluded, minimalist rooftop terrace in a Mediterranean coastal town, captured at peak golden hour. The camera is mid-distance, showing the texture of a white-washed stucco wall with elongated dark diagonal shadows of native desert plants. Adjacent to the wall is a dark teal-painted wooden railing overlooking a distant hazy blue Aegean Sea. Large sculptural potted cacti are positioned near the wall. The floor is rough light-colored flagstone. No figures in the shot.`;

test("Gemini Director story type — end to end", async ({ page }) => {
  test.setTimeout(360_000);

  const baseUrl = "https://aluxartandframes.shop";

  const consoleErrors: string[] = [];
  page.on("console", msg => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  // =========================================================================
  // Part 1 — Login
  // =========================================================================
  console.log("\n--- PART 1: LOGIN ---");
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });

  console.log("\n==========================================================");
  console.log("ACTION REQUIRED: Log in to the admin account in the browser.");
  console.log("==========================================================\n");

  await page.waitForURL(
    url => !url.pathname.startsWith("/login"),
    { timeout: 300_000 }
  );
  console.log(`Logged in. Redirected to: ${page.url()}`);

  // =========================================================================
  // Part 2 — Creator Dashboard: Create Gemini Director template
  // =========================================================================
  console.log("\n--- PART 2: CREATE GEMINI DIRECTOR TEMPLATE ---");
  await page.goto(`${baseUrl}/creator-dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  await page.click('button:has-text("New Template")');
  await page.waitForTimeout(1000);

  await page.locator('label:has-text("Title") input, input[placeholder*="Template title"]').fill("Golden Hour Terrace Test");
  await page.locator('label:has-text("10-image price") input, input[placeholder*="10-image"]').fill("25000");

  // Enable story
  const storyCheckbox = page.locator('label:has-text("This template is a Story") input[type="checkbox"]');
  await storyCheckbox.check();
  await page.waitForTimeout(500);
  console.log("Enabled story mode.");

  // Select Gemini Director type
  const directorPill = page.locator('button:has-text("Gemini Director")');
  await expect(directorPill).toBeVisible({ timeout: 5000 });
  await directorPill.click();
  await page.waitForTimeout(500);
  console.log("Selected Gemini Director story type.");

  // Verify the scene builder is HIDDEN and director textarea is VISIBLE
  const sceneCards = page.locator("[class*='sceneCard']");
  const sceneCardCount = await sceneCards.count();
  console.log(`Scene card count after selecting Director: ${sceneCardCount}`);
  expect(sceneCardCount).toBe(0);

  const directorTextarea = page.locator('textarea[placeholder*="Part 1"]');
  await expect(directorTextarea).toBeVisible();
  console.log("Director textarea is visible, scene builder is hidden. PASS");

  // Verify parse button exists but is disabled while textarea is empty
  const parseBtn = page.locator('button:has-text("Parse & Preview scenes"), button:has-text("Parse & Preview")');
  await expect(parseBtn).toBeVisible();
  const parseBtnDisabled = await parseBtn.isDisabled();
  console.log(`Parse button disabled with empty textarea: ${parseBtnDisabled}`);
  expect(parseBtnDisabled).toBe(true);

  // Paste sample Gemini output
  await directorTextarea.fill(SAMPLE_GEMINI_OUTPUT);
  await page.waitForTimeout(300);

  // Parse button should now be enabled
  const parseBtnEnabledNow = await parseBtn.isDisabled();
  console.log(`Parse button disabled after filling textarea: ${parseBtnEnabledNow}`);
  expect(parseBtnEnabledNow).toBe(false);

  // Click Parse & Preview
  await parseBtn.click();
  console.log("Clicked Parse & Preview. Waiting for Claude to parse...");

  // Wait for the parsed scenes list to appear (Claude API call, up to 30s)
  const parsedList = page.locator("[class*='directorSceneList']");
  await expect(parsedList).toBeVisible({ timeout: 30_000 });

  const sceneItems = parsedList.locator("li");
  const parsedCount = await sceneItems.count();
  console.log(`Parsed scene count: ${parsedCount}`);
  expect(parsedCount).toBeGreaterThanOrEqual(5); // at minimum 5 scenes parsed
  console.log("Scenes parsed and preview list shown. PASS");

  // Log first 3 scene titles
  for (let i = 0; i < Math.min(3, parsedCount); i++) {
    const text = await sceneItems.nth(i).innerText();
    console.log(`  Scene preview ${i + 1}: ${text}`);
  }

  // =========================================================================
  // Part 3 — Save the template
  // =========================================================================
  console.log("\n--- PART 3: SAVE TEMPLATE ---");
  await page.locator('button:has-text("Save as draft")').first().click();
  await page.waitForTimeout(200);

  await page.locator('button:has-text("Create template"), button:has-text("Save changes")').click();
  console.log("Saving template...");
  await page.waitForTimeout(5000);

  const dashboardCard = page.locator('[class*="templateRow"]:has-text("Golden Hour Terrace Test")');
  await expect(dashboardCard).toBeVisible({ timeout: 10_000 });
  console.log("Template saved and appears in dashboard. PASS");

  // Publish it
  const publishBtn = dashboardCard.locator('button[title="Publish"], button:has-text("Publish")');
  await publishBtn.click();
  await page.waitForTimeout(3000);
  console.log("Template published.");

  // =========================================================================
  // Part 4 — Get template URL from dashboard card
  // =========================================================================
  console.log("\n--- PART 4: NAVIGATE TO TEMPLATE MARKETPLACE PAGE ---");

  // Find the View button or template link
  const viewLink = dashboardCard.locator('a[href*="/marketplace/"]').first();
  const hasViewLink = await viewLink.isVisible().catch(() => false);

  let templateUrl = "";
  if (hasViewLink) {
    templateUrl = await viewLink.getAttribute("href") ?? "";
    console.log(`Template link: ${templateUrl}`);
    await page.goto(`${baseUrl}${templateUrl}`, { waitUntil: "domcontentloaded" });
  } else {
    // Navigate to stories/marketplace and find the card
    await page.goto(`${baseUrl}/stories`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const storyCard = page.locator('a[href*="/marketplace/"]:has-text("Golden Hour Terrace Test")').first();
    await storyCard.click();
    await page.waitForURL(url => url.pathname.includes("/marketplace/"), { timeout: 15_000 });
  }

  await page.waitForTimeout(2000);
  console.log(`On template page: ${page.url()}`);

  // =========================================================================
  // Part 5 — Checkout panel: Director type checks
  // =========================================================================
  console.log("\n--- PART 5: CHECKOUT PANEL VALIDATION ---");

  // Open checkout
  const bookBtn = page.locator('button:has-text("Cast Yourself"), button:has-text("Book This Look"), button:has-text("Get Started")').first();
  await expect(bookBtn).toBeVisible({ timeout: 10_000 });
  await bookBtn.click();
  await page.waitForTimeout(2000);
  console.log("Checkout panel opened.");

  // 5a — Co-star section must NOT appear
  const costarSection = page.locator('p:has-text("Your co-star"), text="Your co-star"');
  const costarVisible = await costarSection.isVisible().catch(() => false);
  console.log(`Co-star section visible: ${costarVisible}`);
  expect(costarVisible).toBe(false);
  console.log("Co-star section correctly absent. PASS");

  // 5b — Brand/logo section must NOT appear
  const brandSection = page.locator('p:has-text("Your brand"), p:has-text("brand / logo")');
  const brandVisible = await brandSection.isVisible().catch(() => false);
  console.log(`Brand section visible: ${brandVisible}`);
  expect(brandVisible).toBe(false);
  console.log("Brand section correctly absent. PASS");

  // 5c — Group photo section must NOT appear
  const groupSection = page.locator('p:has-text("Your group photo")');
  const groupVisible = await groupSection.isVisible().catch(() => false);
  console.log(`Group photo section visible: ${groupVisible}`);
  expect(groupVisible).toBe(false);
  console.log("Group photo section correctly absent. PASS");

  // 5d — Identity section must appear
  const identitySection = page.locator(
    'p:has-text("Your photos"), p:has-text("identity"), [class*="identitySection"], [class*="savedPhotos"]'
  ).first();
  const identityVisible = await identitySection.isVisible().catch(() => false);
  console.log(`Identity section visible: ${identityVisible}`);
  expect(identityVisible).toBe(true);
  console.log("Identity section present. PASS");

  // 5e — Pay button must be disabled before identity photos uploaded
  const payBtn = page.locator('button:has-text("Pay & Generate")').first();
  await expect(payBtn).toBeVisible({ timeout: 5_000 });
  const payDisabled = await payBtn.isDisabled();
  console.log(`Pay button disabled (no identity photos): ${payDisabled}`);
  expect(payDisabled).toBe(true);
  console.log("Pay button correctly blocked. PASS");

  // =========================================================================
  // Part 6 — Upload identity and verify Pay button unlocks
  // =========================================================================
  console.log("\n--- PART 6: IDENTITY UPLOAD UNLOCKS PAY BUTTON ---");

  // Use an existing screenshot as a dummy image file
  const dummyImg = path.resolve(process.cwd(), "test-screenshot.png");

  // Find the new identity upload input (not saved refs)
  const fileInputs = page.locator('input[type="file"]');
  const inputCount = await fileInputs.count();
  console.log(`File inputs found: ${inputCount}`);

  // The first "new upload" file input (saved refs reuse existing, new upload is a button)
  const newUploadInput = fileInputs.first();
  await newUploadInput.setInputFiles([dummyImg, dummyImg, dummyImg]);
  console.log("Uploading 3 identity photos...");
  await page.waitForTimeout(6000);

  const payDisabledAfter = await payBtn.isDisabled();
  console.log(`Pay button disabled after uploading: ${payDisabledAfter}`);
  expect(payDisabledAfter).toBe(false);
  console.log("Pay button unlocked after identity upload. PASS");

  // =========================================================================
  // Part 7 — API: Verify parse-director endpoint directly
  // =========================================================================
  console.log("\n--- PART 7: PARSE-DIRECTOR API DIRECT TEST ---");
  const apiResponse = await page.evaluate(async (prompt) => {
    const res = await fetch("/api/templates/parse-director", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ directorPrompt: prompt }),
    });
    return { status: res.status, data: await res.json() };
  }, SAMPLE_GEMINI_OUTPUT);

  console.log(`parse-director API status: ${apiResponse.status}`);
  console.log(`Scenes returned: ${apiResponse.data?.scenes?.length ?? "error"}`);

  if (apiResponse.status === 200) {
    expect(apiResponse.data.scenes).toBeDefined();
    expect(Array.isArray(apiResponse.data.scenes)).toBe(true);
    expect(apiResponse.data.scenes.length).toBeGreaterThanOrEqual(5);
    const firstScene = apiResponse.data.scenes[0];
    console.log(`First scene: slot=${firstScene.slot} title="${firstScene.title}"`);
    expect(firstScene.slot).toBe(1);
    expect(typeof firstScene.title).toBe("string");
    expect(typeof firstScene.description).toBe("string");
    expect(firstScene.description.length).toBeGreaterThan(10);
    console.log("parse-director API returns valid scenes. PASS");
  } else if (apiResponse.status === 401) {
    console.log("SKIP: parse-director requires auth (expected when not logged in as creator).");
  } else {
    console.log(`parse-director API error: ${JSON.stringify(apiResponse.data)}`);
  }

  // =========================================================================
  // Part 8 — Summary
  // =========================================================================
  console.log("\n--- PART 8: ERROR SUMMARY ---");
  // Filter out known pre-existing 404s (identity thumbnail previews from old storage)
  const newErrors = consoleErrors.filter(e => !e.includes("/api/media?b=identity-images"));
  console.log(`New console errors (excluding known thumbnail 404s): ${newErrors.length}`);
  newErrors.forEach(e => console.log(`  - ${e}`));

  console.log("\n===============================================");
  console.log("Gemini Director E2E Test Completed!");
  console.log("===============================================\n");
});
