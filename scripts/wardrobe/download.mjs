#!/usr/bin/env node
/**
 * download.mjs — stage 3a. Pull the 212 extracted assets out of Google Flow.
 *
 *   node --experimental-strip-types --env-file=.env.local scripts/wardrobe/download.mjs --dry-run
 *   node --experimental-strip-types --env-file=.env.local scripts/wardrobe/download.mjs
 *
 * Identity is a FACT here, not a guess: extract.mjs recorded which grid tile each
 * job produced at the moment it appeared, so this opens that exact link. There
 * is no matching step and therefore nothing to get wrong. The earlier thumbnail
 * run lost a whole batch three separate ways by inferring identity afterwards —
 * reading prompts off the page, grid position, and filename timestamps all
 * failed.
 *
 * 2K IS PREFERRED HERE, unlike the thumbnail downloader which prefers 1K.
 * Those images were only ever shown at 240px. These become reference images fed
 * to the generator, where beadwork and embroidery detail is exactly what the
 * Outfit Fidelity Rule demands be reproduced element for element. 1K remains the
 * fallback because Flow prepares 2K on demand and has been seen to stall on it
 * after a few hundred exports.
 *
 * Saves after every file, so Ctrl-C is safe and re-running skips what is done.
 */

import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const QUEUE_FILE = join(__dirname, "wardrobe-run.json");
const PROFILE_DIR = join(ROOT, ".flow-profile");
const OUT_DIR = join(ROOT, ".wardrobe-assets");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const LIMIT = (() => {
  const i = args.indexOf("--limit");
  return i >= 0 ? parseInt(args[i + 1], 10) || Infinity : Infinity;
})();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);
const loadQueue = () => JSON.parse(readFileSync(QUEUE_FILE, "utf8"));
const saveQueue = (q) => writeFileSync(QUEUE_FILE, JSON.stringify(q, null, 2));

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

/** A stable, human-readable name so the folder can be understood without the queue. */
function fileNameFor(photo, job, ext = ".png") {
  const stem = basename(photo.file, extname(photo.file));
  return `${slug(stem)}--${job.kind}${job.recolour ? "-" + slug(job.recolour) : ""}${ext}`;
}

async function main() {
  const q = loadQueue();
  const usable = q.photos.filter((p) => p.usable);

  const todo = [];
  for (const p of usable) {
    for (const j of p.jobs) {
      if (!j.flowAsset) continue;             // nothing to open
      if (j.localFile && existsSync(join(OUT_DIR, j.localFile))) continue;   // already have it
      todo.push({ photo: p, job: j });
    }
  }

  const noId = usable.flatMap(p => p.jobs.filter(j => !j.flowAsset)).length;
  log(`${todo.length} asset(s) to download${noId ? `, ${noId} have no image id and are skipped` : ""}`);
  if (!todo.length) { log("nothing to do."); return; }

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: "chrome",
    headless: false,
    viewport: { width: 1400, height: 900 },
    acceptDownloads: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  let page = ctx.pages()[0] ?? (await ctx.newPage());

  // If the browser itself goes away there is nothing left to retry against.
  // Without this the loop ran on for 207 assets in six minutes, marking every
  // one failed against a dead context and turning one crash into a whole
  // failed run.
  let browserGone = false;
  ctx.on("close", () => { browserGone = true; });

  const ensurePage = async () => {
    if (browserGone) throw new Error("browser closed");
    return page.isClosed() ? (page = await ctx.newPage()) : page;
  };

  let done = 0, failed = 0;
  for (const { photo, job } of todo) {
    if (done >= LIMIT) { log(`--limit ${LIMIT} reached`); break; }
    const label = `${basename(photo.file)} → ${job.kind}`;

    try {
      const url = "https://labs.google" + job.flowAsset;
      page = await ensurePage();
      let loaded = false;
      for (let attempt = 1; attempt <= 2 && !loaded; attempt++) {
        try {
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
          loaded = true;
        } catch {
          try { await page.close(); } catch {}
          page = await ensurePage();
        }
      }
      if (!loaded) { failed++; log(`✗ ${label} — page would not load`); continue; }
      await sleep(1800);

      // Flow throttles exports: after a run of them it simply stops preparing
      // the file and the download never starts. Backing off and asking again
      // recovers, where moving straight on loses the asset. Two extra attempts
      // with a widening pause, then give up and let a later run retry it.
      let dl = null, usedSize = null;
      for (let attempt = 1; attempt <= 3 && !dl; attempt++) {
      if (attempt > 1) { log(`  … throttled, waiting ${attempt * 20}s before retry ${attempt}`); await sleep(attempt * 20000); }
      for (const size of ["2K", "1K"]) {
        // Match the LABEL word "Download", not the lowercase icon ligature. The
        // button reads "download Download"; a lowercase has-text plus .first()
        // resolved to a different element entirely and every download silently
        // failed to start. Capital D pins it to the real control.
        await page.locator('button:has-text("Download")').click({ timeout: 10000 }).catch(() => {});
        // The size menu renders into a portal and can take a couple of seconds.
        // A fixed 1.2s sleep then a count() found nothing and every download
        // failed; wait for the option to actually appear instead of guessing.
        const opt = page.locator(`text="${size}"`).first();
        const appeared = await opt.waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false);
        if (!appeared) { await page.keyboard.press("Escape").catch(() => {}); await sleep(600); continue; }
        [dl] = await Promise.all([
          page.waitForEvent("download", { timeout: 90000 }).catch(() => null),
          opt.click().catch(() => {}),
        ]);
        if (dl) { usedSize = size; break; }
        await page.keyboard.press("Escape").catch(() => {});
        await sleep(800);
      }
      }
      // Count failures toward --limit too. Without this a --limit 2 test ran on
      // through five assets, because only successes advanced the counter.
      if (!dl) { failed++; done++; log(`✗ ${label} — download did not start at 2K or 1K`); continue; }

      const name = fileNameFor(photo, job, extname(dl.suggestedFilename()) || ".png");
      if (DRY_RUN) {
        await dl.cancel().catch(() => {});
        log(`· would save ${name} (${usedSize})`);
      } else {
        await dl.saveAs(join(OUT_DIR, name));
        job.localFile = name;
        job.downloadedSize = usedSize;
        saveQueue(q);       // after EVERY file
        log(`✓ ${name} (${usedSize})  (${done + 1})`);
      }
      done++;
      await sleep(700);
    } catch (e) {
      const msg = String(e.message ?? e);
      failed++;
      log(`✗ ${label} — ${msg.slice(0, 80)}`);
      if (browserGone || /browser has been closed|browser closed|Target crashed/i.test(msg)) {
        log("browser is gone — stopping. Re-run to continue; nothing done so far is lost.");
        break;
      }
      try { page = await ensurePage(); } catch { break; }
    }
  }

  const remaining = usable.flatMap(p => p.jobs.filter(j => j.flowAsset && !j.localFile)).length;
  log(`finished: ${done} downloaded, ${failed} failed, ${remaining} still pending`);
  if (!DRY_RUN) log(`files in ${OUT_DIR}`);
  await ctx.close();
}

main().catch((e) => { console.error("download error:", e); process.exit(1); });
