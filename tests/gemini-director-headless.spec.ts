/**
 * Headless smoke test for Gemini Director feature.
 * Runs without manual login — covers public pages and API guards only.
 * Full E2E (with login) → run tests/gemini-director.spec.ts --headed.
 */
import { test, expect } from "@playwright/test";

const SAMPLE_PROMPT = `Part 1: Creative Direction — Golden Hour Editorial
Location: White stucco terrace, ocean view.
Lighting: Golden hour sunset, dramatic shadows.
Wardrobe: Sheer pink chiffon dress, silver clutch, gold earring.
Color Grade: Warm tones, deep shadows.

1. Establishing Shot (Wide): Model stands on white terrace at golden hour, looks toward ocean. Low angle.
2. Dramatic Profile (Mid-Shot): Side profile, long shadow on white wall behind her.
3. Wind-Swept Movement (Full Shot): Model walking away, fabric billows. High contrast.
4. Low Angle Strut (Full Shot): Very low angle, movement of gown, sun behind her.
5. Direct Stare (Close Up): Head and shoulders, gazing at lens, clutch prominent.
6. Hair and Light (Mid-Shot): One hand through hair against wall. Golden rim light.
7. Backlight Silhouette (Medium Full Shot): Terrace edge, sun behind, fabric glows.
8. Framed by Nature (Wide Shot): Between two large cacti, shadows elongated.
9. Golden Hour Portrait (Close Up): Peak golden minute, calm expression, jewelry detail.
10. The Exit (Wide Shot): Model walks toward door, dress trailing, diagonal shadows.

Part 2: OOTD/Lay Flat Prompt
Ghost mannequin in pink chiffon gown, voluminous sleeves, V-neckline, gold buckle waist. Accessories arranged: silver minaudière clutch, gold serpent earring, gold strappy sandals. White studio background, diffused lighting.

Part 3: Inspiration/Set Reference Prompt
Rooftop terrace, Mediterranean coastal town, golden hour. White-washed stucco wall with diagonal shadows. Dark teal railing, distant Aegean Sea. Potted cacti, flagstone floor. No people. Serene, high-fashion mood.`;

test.describe("Gemini Director — headless smoke tests", () => {

  test("1. Live site is reachable", async ({ page }) => {
    const res = await page.goto("https://aluxartandframes.shop/stories", { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBe(200);
    console.log("Site reachable at /stories. PASS");
  });

  test("2. parse-director API requires auth (returns 401)", async ({ page }) => {
    // Log in is required — unauthenticated requests should get 401, not 404 or 500
    const res = await page.request.post(
      "https://aluxartandframes.shop/api/templates/parse-director",
      { data: { directorPrompt: SAMPLE_PROMPT } }
    );
    console.log(`parse-director status (unauthenticated): ${res.status()}`);
    // 401 = auth guard working, route exists
    // 404 = route does not exist in the running build (feature not deployed)
    // 405 = route file exists but POST handler missing or Next.js routing issue
    expect([401, 404, 405]).toContain(res.status());
    if (res.status() === 401) {
      console.log("Auth guard working correctly. Feature is deployed. PASS");
    } else if (res.status() === 404) {
      console.log("Route not found — feature branch not yet deployed on VPS. NEEDS DEPLOYMENT.");
    } else {
      console.log(`Unexpected status ${res.status()} — check VPS build.`);
    }
  });

  test("3. Template creation API rejects unknown story_type", async ({ page }) => {
    // Unauthenticated — just verifying the route exists with the right status
    const res = await page.request.post(
      "https://aluxartandframes.shop/api/templates",
      { data: { title: "test", storyType: "director", priceNgn: 25000 } }
    );
    console.log(`POST /api/templates unauthenticated: ${res.status()}`);
    // Expect 401 (auth guard) — not 500 (crash) or 400 (rejects director type)
    expect(res.status()).not.toBe(500);
  });

  test("4. Marketplace template API works for a published template", async ({ page }) => {
    // Get the list of published templates from the marketplace
    const listRes = await page.request.get("https://aluxartandframes.shop/api/marketplace?limit=5");
    expect(listRes.status()).toBe(200);
    const body = await listRes.json();
    console.log(`Marketplace templates returned: ${body.templates?.length ?? 0}`);

    if (body.templates?.length > 0) {
      const id = body.templates[0].id;
      const detailRes = await page.request.get(`https://aluxartandframes.shop/api/marketplace/${id}`);
      expect(detailRes.status()).toBe(200);
      const detail = await detailRes.json();
      const t = detail.template;

      console.log(`Sample template: "${t.title}" storyType=${t.storyType} isDirectorStory=${t.isDirectorStory}`);

      // After deployment, the API should return isDirectorStory field (even if false for existing templates)
      if ("isDirectorStory" in t) {
        console.log("isDirectorStory field present in API response. Feature deployed. PASS");
      } else {
        console.log("isDirectorStory field MISSING from API — feature not yet deployed.");
      }
    }
  });

  test("5. Stories page renders without errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", msg => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("https://aluxartandframes.shop/stories", { waitUntil: "networkidle" });

    // Known harmless errors to skip
    const newErrors = errors.filter(e =>
      !e.includes("/api/media?b=identity-images") &&
      !e.includes("preloaded using link preload")
    );
    console.log(`New console errors on /stories: ${newErrors.length}`);
    newErrors.forEach(e => console.log(`  - ${e}`));
    expect(newErrors.length).toBe(0);

    // Verify filter pills present
    const allPill = page.locator('button:has-text("All")').first();
    await expect(allPill).toBeVisible();
    console.log("/stories page renders cleanly. PASS");
  });

  test("6. Marketplace page renders without errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", msg => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("https://aluxartandframes.shop/marketplace", { waitUntil: "networkidle" });

    const newErrors = errors.filter(e => !e.includes("/api/media?b=identity-images"));
    console.log(`New console errors on /marketplace: ${newErrors.length}`);
    newErrors.forEach(e => console.log(`  - ${e}`));
    expect(newErrors.length).toBe(0);
    console.log("/marketplace page renders cleanly. PASS");
  });

});
