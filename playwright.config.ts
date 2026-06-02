import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  webServer: {
    command: "npx next dev -p 3001",
    url: "http://localhost:3001",
    timeout: 120_000,
    reuseExistingServer: true,
  },
  use: {
    baseURL: "http://localhost:3001",
    headless: true,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
