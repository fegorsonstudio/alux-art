import { chromium } from "playwright";
import { join } from "node:path";

const ctx = await chromium.launchPersistentContext(join(process.cwd(), ".site-profile"), {
  channel: "chrome", headless: false, viewport: { width: 1280, height: 900 },
  args: ["--window-position=40,40"],
});
const page = ctx.pages()[0] ?? await ctx.newPage();
// If this window is closed, stop rather than polling a dead page forever.
let closed = false;
ctx.on("close", () => { closed = true; });
page.on("close", () => { closed = true; });

await page.goto("https://aluxartandframes.shop/login", { waitUntil: "domcontentloaded" }).catch(async () => {
  await page.goto("https://aluxartandframes.shop/", { waitUntil: "domcontentloaded" }).catch(()=>{});
});
console.log("READY — log in INSIDE THIS WINDOW. Do not close it.");

const loggedIn = async () => page.evaluate(async () => {
  const r = await fetch("/api/user/identity-refs", { credentials: "include" });
  return r.status === 200;
}).catch(() => false);

let ok = false;
for (let i = 0; i < 240 && !closed; i++) {
  if (await loggedIn()) { ok = true; break; }
  await new Promise(r => setTimeout(r, 5000));
}
if (closed) { console.log("WINDOW CLOSED before login — nothing tested."); process.exit(0); }
if (!ok) { console.log("TIMED OUT waiting for login."); process.exit(0); }
console.log("LOGGED IN — running the import test");

const api = await page.evaluate(async () => {
  const g = await fetch("/api/creator-dashboard/lighting-library", { credentials: "include" });
  const gj = await g.json().catch(() => ({}));
  const t0 = Date.now();
  const p = await fetch("/api/creator-dashboard/lighting-library", { method: "POST", credentials: "include" });
  const pj = await p.json().catch(() => ({}));
  const groups = pj.groups ?? [];
  return {
    getStatus: g.status, sectionsListed: (gj.sections ?? []).length, looksListed: gj.totalLooks ?? 0,
    postStatus: p.status, sectionsReturned: groups.length, looksReturned: pj.totalLooks ?? 0,
    seconds: +((Date.now() - t0) / 1000).toFixed(1),
    everyLookHasThumb: groups.every(gr => (gr.options ?? []).every(o => !!o.imagePath)),
    everyLookHasRecipe: groups.every(gr => (gr.options ?? []).every(o => !!o.description)),
    everyLookHasFraming: groups.every(gr => (gr.options ?? []).every(o => !!o.framing)),
    sectionNames: groups.map(gr => gr.label.split(" —")[0]),
  };
});
console.log("API RESULT: " + JSON.stringify(api, null, 2));

await page.goto("https://aluxartandframes.shop/creator-dashboard", { waitUntil: "domcontentloaded" }).catch(()=>{});
await page.waitForTimeout(7000);
const btn = page.locator('button:has-text("Import Alux Art lighting")');
console.log("import button present on dashboard: " + ((await btn.count()) > 0 ? "YES" : "no — open or create a template first"));
await page.screenshot({ path: "dashboard.png" }).catch(()=>{});
console.log("DONE — browser stays open, session saved.");
await new Promise(()=>{});
