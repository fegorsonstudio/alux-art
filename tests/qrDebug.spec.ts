import { test } from "@playwright/test";

const TEMPLATE_URL = "/marketplace/51fddb50-228e-417a-9b68-8c3600d91735";

test("debug: capture QR overlay state", async ({ page }) => {
  const errors: string[] = [];
  const failedRequests: string[] = [];

  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(e.message));
  page.on("requestfailed", req => failedRequests.push(`${req.url()} — ${req.failure()?.errorText}`));

  await page.goto(TEMPLATE_URL);
  await page.waitForSelector("text=Book This Look", { timeout: 30_000 });

  // Capture all JS requests after clicking
  const jsChunks: string[] = [];
  page.on("response", res => {
    if (res.url().includes(".js") && res.status() !== 200) {
      jsChunks.push(`${res.status()} ${res.url()}`);
    }
  });

  await page.getByRole("button", { name: "QR Code" }).click();
  await page.waitForTimeout(5000);

  const overlayInner = await page.evaluate(() => {
    const fixed = [...document.querySelectorAll("*")]
      .find(el => getComputedStyle(el).position === "fixed");
    return fixed ? fixed.innerHTML.slice(0, 1500) : "NO OVERLAY";
  });

  console.log("Overlay innerHTML:", overlayInner);
  console.log("Failed JS chunks:", JSON.stringify(jsChunks));
  console.log("Failed requests:", JSON.stringify(failedRequests));
  console.log("Console errors:", JSON.stringify(errors));
});
