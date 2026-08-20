import { chromium } from "playwright";

/**
 * Controllable Chrome on the user's real profile.
 *
 * Copying the session out of the profile does not work: Chrome 127+ binds cookie
 * encryption to the profile and the browser binary, so a copied cookie store is
 * unreadable by design. Opening the real profile is the only way to inherit an
 * existing Google session, and Google refuses sign-in inside automated browsers,
 * so inheriting is the only route to a signed-in page.
 *
 * Chrome must be fully closed first — it locks the profile while running.
 */
const USER_DATA = "C:/Users/FUJITSU/AppData/Local/Google/Chrome/User Data";

const ctx = await chromium.launchPersistentContext(USER_DATA, {
  headless: false,
  channel: "chrome",
  viewport: null,
  args: [
    "--profile-directory=Profile 4",   // Ebele <fegorsonphotography@gmail.com>
    "--start-maximized",
    "--remote-debugging-port=9222",
    "--no-first-run",
    "--no-default-browser-check",
  ],
});

const page = ctx.pages()[0] ?? await ctx.newPage();
await page.goto("https://aluxartandframes.shop/studio", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
console.log("Chrome open on Profile 4 (Ebele).");
await new Promise((resolve) => ctx.on("close", resolve));
