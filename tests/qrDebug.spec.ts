import { test } from "@playwright/test";

const TEMPLATE_URL = "/marketplace/51fddb50-228e-417a-9b68-8c3600d91735";

test("debug: trace download click network + console", async ({ page }) => {
  const consoleLogs: string[] = [];
  const networkRequests: string[] = [];

  page.on("console", m => consoleLogs.push(`[${m.type()}] ${m.text()}`));
  page.on("pageerror", e => consoleLogs.push(`[pageerror] ${e.message}`));
  page.on("request", req => {
    if (req.resourceType() === "script" || req.url().includes("_next")) {
      networkRequests.push(`REQ ${req.url()}`);
    }
  });
  page.on("response", res => {
    if (res.url().includes("_next") || res.url().includes("html2canvas")) {
      networkRequests.push(`RES ${res.status()} ${res.url()}`);
    }
  });
  page.on("requestfailed", req => {
    networkRequests.push(`FAIL ${req.url()} — ${req.failure()?.errorText}`);
  });

  await page.goto(TEMPLATE_URL);
  await page.waitForSelector("text=Book This Look", { timeout: 30_000 });

  await page.getByRole("button", { name: "QR Code" }).click();
  await page.waitForSelector("text=Download Card", { timeout: 10_000 });

  // Now click download and monitor what happens
  await page.getByRole("button", { name: /Download Card/ }).click();

  // Wait 8 seconds to capture activity
  await page.waitForTimeout(8000);

  // Check if "Saving..." state appeared (proves html2canvas was at least called)
  const savingVisible = await page.locator("text=Saving").isVisible();

  console.log("Saving state appeared:", savingVisible);
  console.log("Network (html2canvas phase):", JSON.stringify(networkRequests.slice(-20), null, 2));
  console.log("Console logs:", JSON.stringify(consoleLogs, null, 2));
});
