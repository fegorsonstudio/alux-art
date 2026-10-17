// A Chrome window driven step by step over localhost, so a person can sign in
// and the agent can then click through the Google Cloud console. Credentials
// are never typed by the agent; the window is the owner's to sign in with.
//
//   node driver.mjs            (keeps running; POST JSON ops to 127.0.0.1:47120)
//   ops: goto{url} click{selector|text} fill{selector,value} press{key} shot{} url{} text{selector?} eval{js} wait{ms} quit{}
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
const { chromium } = createRequire("C:/Users/FUJITSU/Documents/claude apps/package.json")("playwright");

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const profile = path.join(here, "profile");
const ctx = await chromium.launchPersistentContext(profile, {
  channel: "chrome",
  headless: false,
  viewport: { width: 1280, height: 860 },
  args: ["--disable-blink-features=AutomationControlled", "--start-maximized"],
  ignoreDefaultArgs: ["--enable-automation"],
});
let page = ctx.pages()[0] ?? (await ctx.newPage());
ctx.on("page", (p) => { page = p; });
let shots = 0;

async function run(op) {
  switch (op.op) {
    case "goto": await page.goto(op.url, { waitUntil: "domcontentloaded", timeout: 60000 }); await page.waitForTimeout(op.settle ?? 2500); return { url: page.url() };
    case "click": {
      const loc = op.text ? page.getByText(op.text, { exact: op.exact ?? false }).first()
        : op.role ? page.getByRole(op.role, { name: op.name, exact: op.exact ?? false }).first()
        : page.locator(op.selector).first();
      await loc.click({ timeout: op.timeout ?? 15000 });
      await page.waitForTimeout(op.settle ?? 1500);
      return { url: page.url() };
    }
    case "fill": {
      const loc = op.label ? page.getByLabel(op.label).first() : op.placeholder ? page.getByPlaceholder(op.placeholder).first() : page.locator(op.selector).first();
      await loc.fill(op.value, { timeout: op.timeout ?? 15000 });
      return { ok: true };
    }
    case "press": await page.keyboard.press(op.key); await page.waitForTimeout(op.settle ?? 1000); return { ok: true };
    case "shot": {
      const file = path.join(here, `shot-${String(++shots).padStart(3, "0")}.png`);
      await page.screenshot({ path: file, fullPage: !!op.full });
      return { file, url: page.url() };
    }
    case "url": return { url: page.url(), title: await page.title() };
    case "text": {
      const t = op.selector ? await page.locator(op.selector).first().innerText({ timeout: 10000 }) : await page.locator("body").innerText();
      return { text: t.slice(0, op.max ?? 4000) };
    }
    case "eval": return { value: await page.evaluate(op.js) };
    case "wait": await page.waitForTimeout(op.ms ?? 1000); return { ok: true };
    case "waitfor": await page.waitForSelector(op.selector, { timeout: op.timeout ?? 60000 }); return { ok: true };
    case "pages": return { pages: ctx.pages().map((p) => p.url()) };
    case "quit": setTimeout(() => process.exit(0), 200); await ctx.close(); return { ok: true };
    default: return { error: "unknown op" };
  }
}

http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    let out;
    try { out = await run(JSON.parse(body || "{}")); }
    catch (e) { out = { error: String(e?.message ?? e).slice(0, 600), url: page?.url() }; }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(out));
  });
}).listen(47120, "127.0.0.1", () => console.log("driver ready on 47120"));
