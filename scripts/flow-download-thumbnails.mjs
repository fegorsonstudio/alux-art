#!/usr/bin/env node
/**
 * flow-download-thumbnails.mjs — pull the 2K upscaled thumbnails out of Google
 * Flow and name them by lighting-style slot. No Claude involved.
 *
 *   npm run thumbs:download -- --dry-run   # map + verify only, download nothing
 *   npm run thumbs:download                # download every verified image
 *
 * HOW IMAGES ARE IDENTIFIED — and why it is verified rather than assumed.
 *
 * Reading each image's prompt off the page was tried and failed: the page hands
 * back stale or shared text, so several different images collapsed onto one
 * style (slot 14 claimed three times). Position alone is no better - one
 * off-by-one silently puts the wrong look on all 47 styles, invisible until a
 * buyer sees it.
 *
 * So this uses order AND checks it. The grid is reverse-chronological and the
 * generator ran in strict queue order, so the N newest images are that run in
 * reverse. Every download then arrives carrying Flow's own filename, which ends
 * in YYYYMMDDHHMM - and that minute MUST equal the generation minute recorded in
 * the runner log (scripts/lighting-thumbnail-timestamps.json). If it does not,
 * the file is rejected. A wrong mapping fails loudly instead of shipping.
 */

import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const QUEUE_FILE = join(__dirname, "lighting-thumbnail-run.json");
const STAMP_FILE = join(__dirname, "lighting-thumbnail-timestamps.json");
const OUT_DIR = join(ROOT, ".playwright-mcp", "thumbnails");
const MAP_FILE = join(__dirname, "lighting-thumbnail-files.json");
const PROFILE_DIR = join(ROOT, ".flow-profile");

const DRY_RUN = process.argv.includes("--dry-run");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

/** Flow names exports "<Title>_<2K>_YYYYMMDDHHMM.jpeg" — pull out the HHMM. */
function stampOf(filename) {
  const m = String(filename).match(/(\d{8})(\d{4})/);
  return m ? { date: m[1], hhmm: m[2] } : null;
}

async function main() {
  const { rows, date } = JSON.parse(readFileSync(STAMP_FILE, "utf8"));
  log(`${rows.length} generated styles on record (${date}, ${rows[0].time}–${rows[rows.length - 1].time})`);

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const saved = existsSync(MAP_FILE) ? JSON.parse(readFileSync(MAP_FILE, "utf8")) : {};

  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: "chrome", headless: false,
    viewport: { width: 1400, height: 900 }, acceptDownloads: true,
  });
  let page = ctx.pages()[0] ?? (await ctx.newPage());

  const q = JSON.parse(readFileSync(QUEUE_FILE, "utf8"));
  await page.goto(q.flowProject, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.locator('button:has-text("add_2")').first().waitFor({ timeout: 300000 });
  log("project ready");
  await sleep(2500);

  // The grid lazy-loads. Guessing the scroll container from the DOM did not work
  // (it kept stalling at 30), so drive it with real wheel events over the grid —
  // a virtualised list responds to those the way it responds to a user.
  // ...and it is VIRTUALISED: nodes are recycled, so links disappear once they
  // scroll out of view (the count was seen going 48 -> 21). Reading the DOM once
  // at the end can never see all 47. Accumulate across scroll steps instead,
  // preserving first-seen order, which stays newest-first as we scroll down.
  const seenHrefs = new Set();
  const order = [];
  const harvest = async () => {
    const batch = await page.evaluate(() =>
      [...document.querySelectorAll('a[href*="/edit/"]')].map((a) => a.getAttribute("href"))
    );
    for (const h of batch) if (h && !seenHrefs.has(h)) { seenHrefs.add(h); order.push(h); }
  };

  await page.mouse.move(900, 450);
  await harvest();
  for (let i = 0, last = 0, stalls = 0; i < 150; i++) {
    await page.mouse.wheel(0, 1200);
    await sleep(650);
    await harvest();
    if (order.length === last) { if (++stalls >= 8) break; } else { stalls = 0; }
    last = order.length;
    if (i % 10 === 0) log(`  scrolling… ${order.length} unique images seen`);
  }
  const hrefs = order;
  log(`grid loaded: ${hrefs.length} unique images`);

  if (hrefs.length < rows.length) {
    log(`STOP: only ${hrefs.length} images loaded but ${rows.length} are expected.`);
    log("Scroll the Flow grid to the bottom manually, then re-run — a short grid would mis-align the order mapping.");
    await ctx.close();
    return;
  }

  // Newest-first grid vs the log in reverse: newest image == last generated style.
  const expected = [...rows].reverse();
  const results = [], rejected = [];

  // Drop the fully-scrolled grid before the download loop — holding 139 rendered
  // tiles in memory while navigating 45 times crashed the tab.
  await page.goto("about:blank", { waitUntil: "domcontentloaded" }).catch(() => {});
  await sleep(1200);

  for (let i = 0; i < expected.length; i++) {
    const style = expected[i];
    if (saved[style.slot]) { results.push({ ...style, file: saved[style.slot], skipped: true }); continue; }

    // A crashed tab must not end the run — recreate and carry on.
    if (page.isClosed()) page = await ctx.newPage();
    try {
      await page.goto(new URL(hrefs[i], "https://labs.google").toString(), { waitUntil: "domcontentloaded", timeout: 60000 });
    } catch {
      try { await page.close().catch(() => {}); } catch {}
      page = await ctx.newPage();
      try {
        await page.goto(new URL(hrefs[i], "https://labs.google").toString(), { waitUntil: "domcontentloaded", timeout: 60000 });
      } catch { rejected.push({ slot: style.slot, why: "page would not load" }); continue; }
    }
    await sleep(1800);

    await page.locator('button:has-text("download")').first().click().catch(() => {});
    await sleep(1000);
    const twoK = page.locator('text="2K"').first();
    if (!(await twoK.count())) { rejected.push({ slot: style.slot, why: "no 2K option" }); continue; }

    const [dl] = await Promise.all([
      page.waitForEvent("download", { timeout: 120000 }).catch(() => null),
      twoK.click().catch(() => {}),
    ]);
    if (!dl) { rejected.push({ slot: style.slot, why: "download did not start" }); continue; }

    // Flow's filename timestamp turned out to be the DOWNLOAD time, not the
    // generation time, so it cannot confirm identity. What the filename DOES
    // carry is Flow's own description of the image ("..._with_purple_lighting"),
    // which is derived from the prompt. Use that to corroborate the order-based
    // mapping: agreement raises confidence, disagreement is flagged for review
    // rather than silently accepted.
    const suggested = dl.suggestedFilename();
    const words = (s) => new Set(String(s).toLowerCase().match(/[a-z]{4,}/g) ?? []);
    const STOP = new Set(["relight", "relighting", "image", "with", "jpeg", "subject", "lighting", "light"]);
    const styleWords = [...words(style.name)].filter((w) => !STOP.has(w));
    const fileWords = words(suggested);
    // Treat well-known synonyms as agreement (magenta/purple, overhead/above...).
    const SYN = { magenta: "purple", purple: "magenta", overhead: "above", above: "overhead", clamshell: "soft", paramount: "soft", chiaroscuro: "contrast" };
    const agree = styleWords.some((w) => fileWords.has(w) || (SYN[w] && fileWords.has(SYN[w])));

    const file = `${String(style.slot).padStart(2, "0")}-${slug(style.name)}.png`;
    if (!DRY_RUN) {
      await dl.saveAs(join(OUT_DIR, file));
      saved[style.slot] = file;
      writeFileSync(MAP_FILE, JSON.stringify(saved, null, 2));
    } else {
      await dl.cancel().catch(() => {});
    }
    results.push({ ...style, file, suggested, corroborated: agree });
    log(`${DRY_RUN ? "· would save" : "✓ saved"} slot ${style.slot} ${style.name} ${agree ? "✔" : "⚠ check"} ← ${suggested}`);
    await sleep(900);
  }

  log(`verified ${results.length} of ${expected.length}; ${rejected.length} rejected`);
  for (const r of rejected.slice(0, 12)) log(`  ✗ slot ${r.slot}: ${r.why}`);
  writeFileSync(join(__dirname, "lighting-thumbnail-mapping-preview.json"), JSON.stringify({ results, rejected }, null, 2));
  log(DRY_RUN
    ? "dry-run: nothing written. Check scripts/lighting-thumbnail-mapping-preview.json."
    : `downloaded into .playwright-mcp/thumbnails/`);
  await ctx.close();
}

main().catch((e) => { console.error("downloader error:", e); process.exit(1); });
