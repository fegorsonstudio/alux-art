import { chromium } from "playwright";
/** Reopens the Meta dashboard using the profile that already holds the Facebook login. */
const PROFILE = "C:/Users/FUJITSU/AppData/Local/Temp/claude/meta-setup-profile";
const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false, channel: "chrome", viewport: null,
  args: ["--start-maximized", "--remote-debugging-port=9223", "--no-first-run"],
});
const page = ctx.pages()[0] ?? await ctx.newPage();
await page.goto("https://developers.facebook.com/apps/934063273049258/dashboard/", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
console.log("Meta dashboard reopened on the Facebook-logged-in profile.");
await new Promise((r) => ctx.on("close", r));
