#!/usr/bin/env node
/**
 * flow-download-thumbnails.mjs — pull the 2K thumbnails out of Google Flow and
 * name them by lighting-style slot. No Claude involved.
 *
 *   npm run thumbs:download -- --dry-run   # open each image, download nothing
 *   npm run thumbs:download                # download every recorded image
 *
 * HOW IMAGES ARE IDENTIFIED — this is the whole story of this file.
 *
 * Identity is now a FACT, not an inference: flow-thumbnail-runner.mjs snapshots
 * the grid's edit links before each send and records the newly appeared one as
 * item.editHref. This script simply opens that link. There is no matching step,
 * so there is nothing to get wrong.
 *
 * That replaced three approaches that all failed on a full run:
 *   - reading each image's prompt off the page — the page hands back stale or
 *     shared text, so 42 images collapsed onto 17 styles;
 *   - position in the grid — one off-by-one silently mislabels every style, and
 *     the grid is virtualised so a single DOM read can never see them all;
 *   - the filename's timestamp — it is the DOWNLOAD time, not the generation
 *     time, so it corroborates nothing (this one produced 45 files that looked
 *     verified and were wrong; a spot check found a "cool ripple" slot holding a
 *     warm amber portrait with no ripple, and all 45 were deleted).
 *
 * Anything without a recorded editHref is reported and skipped, never guessed.
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

async function main() {
  const q = JSON.parse(readFileSync(QUEUE_FILE, "utf8"));
  const ready = q.queue.filter((x) => x.done && x.editHref);
  const missing = q.queue.filter((x) => !x.done || !x.editHref);

  log(`${ready.length} of ${q.queue.length} styles have a recorded image id`);
  if (missing.length) {
    log(`${missing.length} have none and will be SKIPPED (re-run npm run thumbnails for these):`);
    for (const m of missing) log(`  slot ${m.slot} ${m.name}`);
  }
  if (!ready.length) { log("nothing to download."); return; }

  // Two styles pointing at one image would mean the runner's capture failed
  // silently. Refuse rather than save the same picture under two names.
  const byHref = new Map();
  for (const item of ready) {
    if (byHref.has(item.editHref)) {
      log(`STOP: slot ${item.slot} and slot ${byHref.get(item.editHref)} share an image id.`);
      log("Re-generate both with npm run thumbnails — do not download from here.");
      return;
    }
    byHref.set(item.editHref, item.slot);
  }

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const saved = existsSync(MAP_FILE) ? JSON.parse(readFileSync(MAP_FILE, "utf8")) : {};

  let ctx, page;

  async function launch(warm) {
    ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
      channel: "chrome", headless: false,
      viewport: { width: 1400, height: 900 }, acceptDownloads: true,
    });
    page = ctx.pages()[0] ?? (await ctx.newPage());
    if (warm) {
      // Load the project once so the session is warm, then go straight to each
      // image. The grid is never scrolled here — that is what crashed the tab
      // on the previous design.
      await page.goto(q.flowProject, { waitUntil: "domcontentloaded" }).catch(() => {});
      await page.locator('button:has-text("add_2")').first().waitFor({ timeout: 300000 });
      log("signed in, project ready");
      await page.goto("about:blank", { waitUntil: "domcontentloaded" }).catch(() => {});
      await sleep(800);
    }
  }

  /**
   * A usable page, whatever happened to the last one. Chrome died mid-run with
   * "Failed to open a new tab" and, because the recovery itself called newPage()
   * unguarded, the throw escaped and killed a 45-image run after one file. When
   * the tab cannot be replaced the whole browser is gone, so relaunch it.
   */
  async function ensurePage() {
    try {
      if (page && !page.isClosed()) return page;
      page = await ctx.newPage();
      return page;
    } catch {
      log("browser died — relaunching and carrying on");
      try { await ctx.close(); } catch { /* already gone */ }
      await launch(true);
      return page;
    }
  }

  await launch(true);

  const done = [], failed = [];
  let sinceRecycle = 0;

  for (const style of ready) {
    // Trust the disk, not the bookkeeping: a recorded file that was later deleted
    // must be fetched again rather than silently skipped.
    if (saved[style.slot] && existsSync(join(OUT_DIR, saved[style.slot]))) {
      done.push({ ...style, file: saved[style.slot], skipped: true });
      continue;
    }

    // Every failure here is per-image. One bad page must never end the run — the
    // whole point of recording ids is that this is resumable and order-free.
    try {
      const url = new URL(style.editHref, "https://labs.google").toString();
      page = await ensurePage();

      // These /edit/ pages are heavy; recycling the tab periodically keeps Chrome
      // from running out of memory halfway through 45 of them.
      if (++sinceRecycle >= 10) {
        sinceRecycle = 0;
        try { await page.close(); } catch { /* fine */ }
        page = await ensurePage();
      }

      let loaded = false;
      for (let attempt = 0; attempt < 2 && !loaded; attempt++) {
        try {
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
          loaded = true;
        } catch {
          try { await page.close(); } catch { /* fine */ }
          page = await ensurePage();
        }
      }
      if (!loaded) { failed.push({ slot: style.slot, why: "page would not load" }); continue; }
      await sleep(1800);

      await page.locator('button:has-text("download")').first().click().catch(() => {});
      await sleep(1000);
      const twoK = page.locator('text="2K"').first();
      if (!(await twoK.count())) { failed.push({ slot: style.slot, why: "no 2K option on the page" }); continue; }

      const [dl] = await Promise.all([
        page.waitForEvent("download", { timeout: 120000 }).catch(() => null),
        twoK.click().catch(() => {}),
      ]);
      if (!dl) { failed.push({ slot: style.slot, why: "download did not start" }); continue; }

      const file = `${String(style.slot).padStart(2, "0")}-${slug(style.name)}.png`;
      if (DRY_RUN) {
        await dl.cancel().catch(() => {});
      } else {
        await dl.saveAs(join(OUT_DIR, file));
        saved[style.slot] = file;
        writeFileSync(MAP_FILE, JSON.stringify(saved, null, 2));
      }
      done.push({ ...style, file, suggested: dl.suggestedFilename() });
      log(`${DRY_RUN ? "· would save" : "✓ saved"} slot ${style.slot} ${style.name} [${style.framing}]`);
      await sleep(900);
    } catch (err) {
      failed.push({ slot: style.slot, why: String(err.message ?? err).slice(0, 80) });
      try { page = await ensurePage(); } catch { /* next iteration retries */ }
    }
  }

  log(`${done.length} of ${ready.length} downloaded; ${failed.length} failed; ${missing.length} had no id`);
  for (const f of failed) log(`  ✗ slot ${f.slot}: ${f.why}`);
  if (!DRY_RUN) log(`files are in .playwright-mcp/thumbnails/`);
  await ctx.close();
}

main().catch((e) => { console.error("downloader error:", e); process.exit(1); });
