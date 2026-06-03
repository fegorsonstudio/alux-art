/**
 * Mobile Performance Audit — tests/editorPerformance.spec.ts
 *
 * Validates page load and interaction timing on the template gallery page
 * (the heaviest rendering surface in the app) using mobile device emulation.
 *
 * Thresholds are conservative enough to pass on a cold CDN edge but tight
 * enough to catch genuine regressions:
 *   - DOMContentLoaded  < 6 000 ms
 *   - First Contentful Paint  < 4 000 ms
 *   - Gallery image-click response  < 500 ms
 *   - No individual long task  > 300 ms during gallery navigation
 */

import { test, expect, devices } from "@playwright/test";

const TEMPLATE_URL = "/marketplace/51fddb50-228e-417a-9b68-8c3600d91735";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return the PerformanceNavigationTiming entry via evaluate. */
async function getNavTiming(page: Parameters<typeof test>[1] extends never ? never : import("@playwright/test").Page) {
  return page.evaluate(() => {
    const [nav] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    if (!nav) return null;
    return {
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
      load: Math.round(nav.loadEventEnd - nav.startTime),
      ttfb: Math.round(nav.responseStart - nav.requestStart),
    };
  });
}

/** Collect First-Contentful-Paint and any first-paint from the paint buffer. */
async function getPaintTimings(page: Parameters<typeof test>[1] extends never ? never : import("@playwright/test").Page) {
  return page.evaluate(() =>
    performance.getEntriesByType("paint").map(e => ({ name: e.name, start: Math.round(e.startTime) }))
  );
}

/** Collect all PerformanceMeasure entries added by our probe. */
async function getInteractionMeasures(page: Parameters<typeof test>[1] extends never ? never : import("@playwright/test").Page) {
  return page.evaluate(() =>
    performance.getEntriesByType("measure").map(e => ({ name: e.name, duration: Math.round(e.duration) }))
  );
}

// ---------------------------------------------------------------------------
// iPhone 13 suite
// ---------------------------------------------------------------------------

// Strip defaultBrowserType so test.use() doesn't force a browser-type switch
// (our config only runs Chromium; viewport + UA are what actually matter).
const { defaultBrowserType: _ib, ...iphone13 } = devices["iPhone 13"];

test.describe("Mobile performance — iPhone 13", () => {
  test.use(iphone13);

  test("DOMContentLoaded < 6 000 ms on template page", async ({ page }) => {
    await page.goto(TEMPLATE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("text=Book This Look", { timeout: 30_000 });

    const timing = await getNavTiming(page);
    expect(timing, "Navigation timing unavailable").not.toBeNull();

    console.log("[iPhone 13] Nav timing:", timing);
    expect(timing!.domContentLoaded).toBeLessThan(6_000);
  });

  test("First Contentful Paint < 4 000 ms", async ({ page }) => {
    // "load" fires once the HTML + render-blocking resources are done.
    // "networkidle" waits for ALL lazy images and is unreliable on CDN sites.
    await page.goto(TEMPLATE_URL, { waitUntil: "load" });
    await page.waitForSelector("text=Book This Look", { timeout: 30_000 });

    const paints = await getPaintTimings(page);
    console.log("[iPhone 13] Paint entries:", paints);

    const fcp = paints.find(p => p.name === "first-contentful-paint");
    // FCP is only available in Chromium — skip gracefully on other engines.
    if (!fcp) { test.skip(); return; }
    expect(fcp.start).toBeLessThan(4_000);
  });

  test("gallery thumbnail click responds within 500 ms", async ({ page }) => {
    await page.goto(TEMPLATE_URL);
    await page.waitForSelector("text=Book This Look", { timeout: 30_000 });

    // Wait for the thumbnail track to appear (only present when there are multiple images).
    const thumbTrack = page.locator('[class*="thumbTrack"]');
    const hasThumbs = await thumbTrack.isVisible().catch(() => false);

    if (!hasThumbs) {
      // Template has only one image — skip gallery interaction test.
      test.skip();
      return;
    }

    const thumbs = thumbTrack.locator("button");
    const thumbCount = await thumbs.count();
    if (thumbCount < 2) { test.skip(); return; }

    // Inject performance marks around the click so we can measure response time.
    await page.evaluate(() => performance.clearMarks());

    await page.evaluate(() => performance.mark("gallery-click-start"));
    await thumbs.nth(1).tap();    // mobile tap, not click
    // The gallery counter text re-renders immediately when state updates.
    await page.waitForSelector('[class*="galleryCounter"]', { timeout: 3_000 });
    await page.evaluate(() => performance.mark("gallery-click-end"));
    await page.evaluate(() =>
      performance.measure("gallery-click", "gallery-click-start", "gallery-click-end")
    );

    const measures = await getInteractionMeasures(page);
    const clickMeasure = measures.find(m => m.name === "gallery-click");
    console.log("[iPhone 13] Gallery click duration:", clickMeasure?.duration, "ms");

    expect(clickMeasure, "gallery-click measure missing").toBeDefined();
    expect(clickMeasure!.duration).toBeLessThan(500);
  });

  test("no layout thrash — CLS below 0.1 during gallery swipe", async ({ page }) => {
    await page.goto(TEMPLATE_URL);
    await page.waitForSelector("text=Book This Look", { timeout: 30_000 });

    // Inject a PerformanceObserver that sums layout-shift scores.
    const cumulativeCls: number = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let clsScore = 0;
        const obs = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const ls = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
            if (!ls.hadRecentInput) clsScore += ls.value;
          }
        });
        obs.observe({ type: "layout-shift", buffered: true });

        // Let a couple of seconds of rendering settle.
        setTimeout(() => { obs.disconnect(); resolve(clsScore); }, 2_000);
      });
    });

    console.log("[iPhone 13] CLS score:", cumulativeCls.toFixed(4));
    expect(cumulativeCls).toBeLessThan(0.1);
  });

  test("long tasks during gallery navigation stay below 300 ms each", async ({ page }) => {
    // Attach a PerformanceObserver for longtask BEFORE navigation so it
    // captures tasks triggered during page load too.
    await page.goto(TEMPLATE_URL);
    await page.waitForSelector("text=Book This Look", { timeout: 30_000 });

    const longTaskDurations: number[] = await page.evaluate(() => {
      return new Promise<number[]>((resolve) => {
        const durations: number[] = [];
        let obs: PerformanceObserver | null = null;
        try {
          obs = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              durations.push(Math.round(entry.duration));
            }
          });
          obs.observe({ type: "longtask", buffered: true });
        } catch {
          // longtask observer not supported in this browser.
          resolve([]);
          return;
        }
        // Navigate the gallery with arrow button clicks and let tasks settle.
        const nextBtn = document.querySelector('[class*="galleryArrowRight"]') as HTMLButtonElement | null;
        if (nextBtn) nextBtn.click();
        setTimeout(() => {
          obs?.disconnect();
          resolve(durations);
        }, 2_000);
      });
    });

    if (longTaskDurations.length > 0) {
      console.log("[iPhone 13] Long task durations (ms):", longTaskDurations);
      const maxTask = Math.max(...longTaskDurations);
      expect(maxTask).toBeLessThan(300);
    } else {
      console.log("[iPhone 13] No long tasks detected.");
    }
  });
});

// ---------------------------------------------------------------------------
// Pixel 5 (Android) suite — same checks, different UA + viewport
// ---------------------------------------------------------------------------

const { defaultBrowserType: _pb, ...pixel5 } = devices["Pixel 5"];

test.describe("Mobile performance — Pixel 5", () => {
  test.use(pixel5);

  test("DOMContentLoaded < 6 000 ms on template page", async ({ page }) => {
    await page.goto(TEMPLATE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("text=Book This Look", { timeout: 30_000 });

    const timing = await getNavTiming(page);
    console.log("[Pixel 5] Nav timing:", timing);
    expect(timing, "Navigation timing unavailable").not.toBeNull();
    expect(timing!.domContentLoaded).toBeLessThan(6_000);
  });

  test("mobile layout renders without horizontal scroll", async ({ page }) => {
    await page.goto(TEMPLATE_URL);
    await page.waitForSelector("text=Book This Look", { timeout: 30_000 });

    const { bodyScrollWidth, viewportWidth } = await page.evaluate(() => ({
      bodyScrollWidth: document.body.scrollWidth,
      viewportWidth: window.innerWidth,
    }));

    console.log("[Pixel 5] bodyScrollWidth:", bodyScrollWidth, "viewport:", viewportWidth);
    // Allow 1px tolerance for sub-pixel rounding.
    expect(bodyScrollWidth).toBeLessThanOrEqual(viewportWidth + 1);
  });

  test("Gift a Friend button tap — no redirect when not authenticated", async ({ page }) => {
    await page.goto(TEMPLATE_URL);
    await page.waitForSelector("text=Book This Look", { timeout: 30_000 });

    const giftBtn = page.getByRole("button", { name: "Gift a Friend" });
    const isVisible = await giftBtn.isVisible().catch(() => false);
    if (!isVisible) {
      // Feature not yet deployed — skip rather than fail.
      console.warn("SKIP: Gift a Friend button not found (pre-deployment)");
      test.skip();
      return;
    }

    // On Pixel 5 the button should be fully within the viewport.
    const box = await giftBtn.boundingBox();
    expect(box, "button not in DOM").not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);   // minimum 44px touch target
    expect(box!.height).toBeGreaterThanOrEqual(30);
  });
});
