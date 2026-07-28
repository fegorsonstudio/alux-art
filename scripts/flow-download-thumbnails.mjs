#!/usr/bin/env node
/**
 * flow-download-thumbnails.mjs — pull the 2K upscaled thumbnails out of Google
 * Flow and name them by lighting-style slot. No Claude involved.
 *
 *   npm run thumbs:download -- --dry-run   # show the slot mapping, download nothing
 *   npm run thumbs:download                # download every matched 2K image
 *
 * WHY IT MATCHES BY PROMPT, NOT BY POSITION: mapping grid order to style slots
 * would be a silent-failure machine — one off-by-one and all 47 thumbnails end up
 * on the wrong styles, which is exactly the class of bug that has bitten this job
 * twice. Each image's own prompt is read back and matched to the queue, so a
 * mismatch is reported instead of guessed. Run --dry-run first and eyeball the
 * mapping before committing to downloads.
 */

import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const QUEUE_FILE = join(__dirname, "lighting-thumbnail-run.json");
const OUT_DIR = join(ROOT, ".playwright-mcp", "thumbnails");
const MAP_FILE = join(__dirname, "lighting-thumbnail-files.json");
const PROFILE_DIR = join(ROOT, ".flow-profile");

const DRY_RUN = process.argv.includes("--dry-run");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

/** Normalise a prompt so a truncated/reflowed copy still matches. */
const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
/** The recipe body after the shared "Relight this image..." preamble — the part
 *  that actually differs between styles. */
const bodyKey = (s) => norm(s).replace(/^relight this image\.?\s*change nothing else except the lighting\.?\s*/i, "").slice(0, 120);

async function main() {
  const q = JSON.parse(readFileSync(QUEUE_FILE, "utf8"));
  const styles = q.queue.map((x) => ({ slot: x.slot, name: x.name, framing: x.framing, key: bodyKey(x.prompt) }));
  log(`${styles.length} styles in the queue`);

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const done = existsSync(MAP_FILE) ? JSON.parse(readFileSync(MAP_FILE, "utf8")) : {};

  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: "chrome",
    headless: false,
    viewport: { width: 1400, height: 900 },
    acceptDownloads: true,
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());

  await page.goto(q.flowProject, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.locator('button:has-text("add_2")').first().waitFor({ timeout: 300000 });
  log("project ready");
  await sleep(2500);

  // The grid lazy-loads — a first pass only sees ~30 of 47. Scroll its own
  // container until the link count stops growing.
  const ids = await (async () => {
    let seen = 0;
    for (let i = 0; i < 40; i++) {
      const n = await page.evaluate(() => {
        const grid = [...document.querySelectorAll("*")]
          .filter((e) => e.scrollHeight > e.clientHeight + 200 && e.clientHeight > 300)
          .sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
        (grid || document.scrollingElement).scrollBy(0, 1200);
        return document.querySelectorAll('a[href*="/edit/"]').length;
      });
      if (n === seen && i > 2) break;
      seen = n;
      await sleep(900);
    }
    return page.evaluate(() =>
      [...new Set([...document.querySelectorAll('a[href*="/edit/"]')].map((a) => a.getAttribute("href")))]
    );
  })();
  log(`found ${ids.length} generated images in the project (after scrolling)`);

  const mapping = [];
  const unmatched = [];

  for (const href of ids) {
    await page.goto(new URL(href, "https://labs.google").toString(), { waitUntil: "domcontentloaded" }).catch(() => {});
    await sleep(2200);

    // Read this image's own prompt. The info affordance next to the title exposes
    // it; fall back to any long "Relight this image" text on the page.
    const prompt = await page.evaluate(() => {
      const hit = [...document.querySelectorAll("*")]
        .map((e) => (e.textContent || "").trim())
        .filter((t) => /^relight this image/i.test(t) && t.length > 80)
        .sort((a, b) => b.length - a.length)[0];
      return hit || "";
    });

    if (!prompt) { unmatched.push({ href, why: "no prompt text found" }); continue; }
    const key = bodyKey(prompt);

    // Several recipes open with near-identical wording ("the key light is a large,
    // soft source positioned directly in front of the subject..."), so a short
    // prefix match assigns one image to several styles. Score every style by how
    // far it agrees with this prompt and take the clear winner only.
    const score = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };
    const ranked = styles.map((s) => ({ s, n: score(key, s.key) })).sort((a, b) => b.n - a.n);
    const best = ranked[0], runnerUp = ranked[1];
    if (!best || best.n < 60) { unmatched.push({ href, why: "no style matched", head: key.slice(0, 70) }); continue; }
    if (runnerUp && best.n - runnerUp.n < 15) {
      unmatched.push({ href, why: `ambiguous: ${best.s.name} vs ${runnerUp.s.name}`, head: key.slice(0, 70) });
      continue;
    }
    const style = best.s;
    if (mapping.some((m) => m.slot === style.slot)) {
      unmatched.push({ href, why: `slot ${style.slot} already claimed (${style.name})` });
      continue;
    }

    const file = `${String(style.slot).padStart(2, "0")}-${slug(style.name)}.png`;
    mapping.push({ slot: style.slot, name: style.name, framing: style.framing, href, file });

    if (DRY_RUN || done[style.slot]) continue;

    // Download menu -> "2K Upscaled".
    await page.locator('button:has-text("download")').first().click().catch(() => {});
    await sleep(1200);
    const twoK = page.locator('text="2K"').first();
    if (!(await twoK.count())) { unmatched.push({ href, why: "no 2K option" }); continue; }
    const [dl] = await Promise.all([
      page.waitForEvent("download", { timeout: 120000 }).catch(() => null),
      twoK.click().catch(() => {}),
    ]);
    if (!dl) { unmatched.push({ href, why: "download did not start" }); continue; }
    await dl.saveAs(join(OUT_DIR, file));
    done[style.slot] = file;
    writeFileSync(MAP_FILE, JSON.stringify(done, null, 2));
    log(`✓ slot ${style.slot} ${style.name} -> ${file}`);
    await sleep(1500);
  }

  log(`matched ${mapping.length} of ${ids.length} images to styles; ${unmatched.length} unmatched`);
  for (const u of unmatched.slice(0, 10)) log(`  ? ${u.why}${u.head ? " :: " + u.head : ""}`);

  if (DRY_RUN) {
    writeFileSync(join(__dirname, "lighting-thumbnail-mapping-preview.json"), JSON.stringify(mapping, null, 2));
    log("dry-run: mapping written to scripts/lighting-thumbnail-mapping-preview.json — check it before downloading.");
  } else {
    log(`downloaded ${Object.keys(done).length} files into .playwright-mcp/thumbnails/`);
  }
  await ctx.close();
}

main().catch((e) => { console.error("downloader error:", e); process.exit(1); });
