#!/usr/bin/env node
/**
 * extract.mjs — stage 2. Cut every catalogued asset out of its photograph using
 * Google Flow, which is free on PRO, so a 212-image run costs nothing.
 *
 *   node --experimental-strip-types --env-file=.env.local scripts/wardrobe/extract.mjs --dry-run
 *   node --experimental-strip-types --env-file=.env.local scripts/wardrobe/extract.mjs --limit 6
 *   node --experimental-strip-types --env-file=.env.local scripts/wardrobe/extract.mjs
 *
 * FIRST RUN: a Chrome window opens on the Flow project. It reuses .flow-profile/,
 * which is already signed in, so it should go straight there. Leave the window
 * alone once it starts; do not open that profile elsewhere at the same time.
 *
 * Progress is written after EVERY image, so Ctrl-C is safe and re-running
 * continues rather than starting over.
 *
 * The browser glue below is deliberately copied from flow-thumbnail-runner.mjs
 * rather than shared with it. That runner holds a lot of hard-won knowledge about
 * Flow's UI and is not worth destabilising to save duplication; each comment
 * marked "cost a run" describes something that actually went wrong.
 */

import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { assetKindById, assetAngleById, buildAssetExtractPrompt } from "../../lib/asset-extractor.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const QUEUE_FILE = join(__dirname, "wardrobe-run.json");
const PROFILE_DIR = join(ROOT, ".flow-profile");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const LIMIT = (() => {
  const i = args.indexOf("--limit");
  return i >= 0 ? parseInt(args[i + 1], 10) || Infinity : Infinity;
})();
const FLOW_PROJECT = (() => {
  const i = args.indexOf("--project");
  return i >= 0 && args[i + 1]
    ? args[i + 1]
    : "https://labs.google/fx/tools/flow/project/3a3736de-c199-46e6-b58e-ad0ff1418ff9";
})();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);

const loadQueue = () => JSON.parse(readFileSync(QUEUE_FILE, "utf8"));
const saveQueue = (q) => writeFileSync(QUEUE_FILE, JSON.stringify(q, null, 2));

/**
 * The extraction prompt for one job: the Asset Extractor's own wording, plus a
 * recolour instruction for the garment only.
 *
 * The recolour is folded into the single extraction pass rather than done as a
 * second pass, so 212 generations stay 212 rather than becoming 424 — and the
 * cutout is never degraded by being re-rendered.
 */
function promptFor(job) {
  const kind = assetKindById(job.kind);
  if (!kind) return null;
  // assetAngleById takes the KIND OBJECT, not its id. Passing the string threw
  // "Cannot read properties of undefined (reading 'length')" on every job.
  const angle = assetAngleById(kind, job.angle);
  if (!angle) return null;

  let p = buildAssetExtractPrompt(kind, angle);
  if (job.recolour) {
    p += `\n\nCOLOUR CHANGE — Render this garment in ${job.recolour} instead of its original colour. ` +
         `Change ONLY the colour. The cut, neckline, sleeves, length, drape, beadwork, embroidery, ` +
         `sequins, hardware and every other construction detail must stay exactly as photographed. ` +
         `Keep the material's original sheen and texture, recoloured — a beaded gown stays beaded, ` +
         `a matte crepe stays matte. Do not restyle, simplify or redesign the garment.`;
  }
  return p;
}

// ── Flow UI glue ─────────────────────────────────────────────────────────────

/**
 * Flow shows a "what's new" changelog in an iframe after each product update. It
 * covers the page, swallows every click, and registers as a [role=dialog] — so
 * the picker never opens and the runner grabs the changelog instead. That lost a
 * whole run once. Clear it before touching anything.
 */
async function dismissOverlays(page) {
  const overlay = () => page.locator('iframe[src*="changelog"]');
  if (!(await overlay().count().catch(() => 0))) return;
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(900);
  if (await overlay().count().catch(() => 0)) {
    await page.locator('[aria-label*="lose" i]').first().click({ timeout: 4000 }).catch(() => {});
    await sleep(900);
  }
  if (await overlay().count().catch(() => 0)) {
    await page.mouse.click(20, 500).catch(() => {});
    await sleep(900);
  }
}

const gridIds = (page) => page.evaluate(() =>
  [...document.querySelectorAll('a[href*="/edit/"]')].map((a) => a.getAttribute("href"))
).catch(() => []);

/** The grid's links once they have stopped changing, so a late arrival from the
 *  previous generation is counted before the next one is sent. */
async function gridSettled(page, { quietMs = 12000, maxMs = 180000 } = {}) {
  let last = await gridIds(page);
  let stableFor = 0;
  for (let waited = 0; waited < maxMs && stableFor < quietMs; waited += 3000) {
    await sleep(3000);
    const now = await gridIds(page);
    if (now.length === last.length) stableFor += 3000;
    else stableFor = 0;
    last = now;
  }
  return last;
}

async function openPicker(page) {
  await dismissOverlays(page);
  if (!(await page.locator('[role="dialog"]').count())) {
    await page.locator('button:has-text("add_2")').first().click({ timeout: 15000 }).catch(() => {});
    await sleep(1800);
  }
  let dlg = page.locator('[role="dialog"]').first();
  let tab = dlg.locator('[role="tab"]', { hasText: "Uploads" }).first();
  // No Uploads tab means we grabbed something that is not the picker. Clear and
  // reopen once — the tab itself has never actually gone missing.
  if (!(await tab.count())) {
    await page.keyboard.press("Escape").catch(() => {});
    await sleep(900);
    await dismissOverlays(page);
    await page.locator('button:has-text("add_2")').first().click({ timeout: 15000 }).catch(() => {});
    await sleep(2200);
    dlg = page.locator('[role="dialog"]').last();
    tab = dlg.locator('[role="tab"]', { hasText: "Uploads" }).first();
  }
  if (!(await tab.count())) return { ok: false, why: "no Uploads tab (an overlay is covering the picker)" };
  if ((await tab.getAttribute("aria-selected")) !== "true") {
    await tab.click({ timeout: 10000 }).catch(() => {});
    await sleep(1800);
  }
  return { ok: true, dlg };
}

/** Upload a source photograph into the project, once. */
async function uploadSource(page, file) {
  const p = await openPicker(page);
  if (!p.ok) return p;

  const input = page.locator('input[type="file"]').first();
  if (!(await input.count())) return { ok: false, why: "no file input in the picker" };
  await input.setInputFiles(file);

  // Wait for it to appear in Uploads rather than guessing at a fixed delay.
  const name = basename(file);
  for (let waited = 0; waited < 120000; waited += 3000) {
    await sleep(3000);
    if (await p.dlg.locator('[role="option"]').filter({ hasText: name }).count()) {
      return { ok: true };
    }
  }
  return { ok: false, why: `${name} never appeared in Uploads after upload` };
}

/**
 * Attach a source. Returns true only when the exact expected file reads back as
 * selected — the picker defaults to the MOST RECENT asset, which after the first
 * generation is a previously extracted image, so an unverified attach silently
 * extracts from an extraction.
 */
async function attachSource(page, wantFile) {
  const p = await openPicker(page);
  if (!p.ok) return p;

  const opt = p.dlg.locator('[role="option"]').filter({ hasText: wantFile }).first();
  if (!(await opt.count())) return { ok: false, why: `${wantFile} not in Uploads` };
  if ((await opt.getAttribute("aria-selected")) !== "true") {
    await opt.click();
    await sleep(1400);
  }
  if ((await opt.getAttribute("aria-selected")) !== "true") {
    return { ok: false, why: `could not select ${wantFile}` };
  }

  const add = page.locator('button:has-text("Add to Prompt")').first();
  if (!(await add.count())) return { ok: false, why: "no Add to Prompt button" };
  await add.click();
  await sleep(1400);
  return { ok: true };
}

// The composer shows the aspect as an ICON LIGATURE, not the ratio text: 3:4
// reads "crop_portrait". Verifying against "3:4" alone can never match.
const RATIO_TOKENS = { "3:4": ["3:4", "crop_portrait"], "1:1": ["1:1", "crop_square"] };

async function ensureSettings(page, { ratio = "3:4", variants = "1x" } = {}) {
  const modelBtn = page.locator('button:has-text("Nano Banana")').first();
  if (!(await modelBtn.count())) return { ok: false, why: "no model button" };

  const tokens = RATIO_TOKENS[ratio] ?? [ratio];
  const label = async () => ((await modelBtn.innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim();
  // Some builds render the variant count "1x", others "x1". Accept either, or a
  // correctly configured run gets blocked.
  const variantForms = [variants, variants.split("").reverse().join("")];
  const good = (l) => tokens.some((t) => l.includes(t)) && variantForms.some((v) => l.includes(v));

  if (good(await label())) return { ok: true, label: await label() };

  await modelBtn.click();
  await sleep(1500);

  // Resolve the index in JS but click through Playwright: a synthetic el.click()
  // does not fire React's handler, so the panel reports a click that never lands.
  for (const want of [ratio, variants]) {
    const idx = await page.evaluate((w) => {
      const clean = (el) => (el.innerText || "").split(/\s+/)
        .filter((x) => x && !/^[a-z0-9_]+$/.test(x)).join(" ").trim();
      const all = [...document.querySelectorAll("button")];
      for (let i = all.length - 1; i >= 0; i--) {
        if (clean(all[i]) === w || (all[i].innerText || "").trim() === w) return i;
      }
      return -1;
    }, want);
    if (idx >= 0) {
      await page.locator("button").nth(idx).click({ timeout: 8000 }).catch(() => {});
      await sleep(700);
    }
  }
  await sleep(1400);
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(900);

  const after = await label();
  return good(after) ? { ok: true, label: after } : { ok: false, why: `settings did not stick (${after})` };
}

/**
 * Type the prompt and send. Playwright's own typing is REQUIRED — setting the
 * text via execCommand or innerText updates the DOM but not Flow's editor state,
 * so send submits nothing while reporting success.
 */
async function promptAndSend(page, prompt) {
  const box = page.locator('div[contenteditable="true"]').first();
  if (!(await box.count())) return { ok: false, why: "no prompt box" };
  await box.fill(prompt);
  await sleep(900);

  const send = page.locator('button:has-text("arrow_forward")').first();
  if (!(await send.count())) return { ok: false, why: "no send button" };
  if (await send.isDisabled().catch(() => false)) return { ok: false, why: "send disabled" };
  await send.click();

  await sleep(4000);
  const left = (await box.innerText().catch(() => "")) || "";
  if (left.includes(prompt.slice(0, 40))) return { ok: false, why: "composer did not clear — not sent" };
  return { ok: true };
}

/**
 * Wait for this job's output and record WHICH image it is.
 *
 * Set difference is unsound: the grid is virtualised, so an older image that
 * merely scrolled into view looks brand new. The grid is newest-first and this
 * runner sends strictly one at a time, so the top tile changing to something not
 * previously seen is the reliable signal.
 */
async function captureNewImage(page, beforeIds) {
  const before = new Set(beforeIds ?? []);
  const topBefore = (beforeIds ?? [])[0] ?? null;
  for (let waited = 0; waited < 240000; waited += 5000) {
    await sleep(5000);
    const after = await gridIds(page);
    const top = after[0] ?? null;
    if (top && top !== topBefore && !before.has(top)) return top;
  }
  return null;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const q = loadQueue();
  const usable = q.photos.filter((p) => p.usable);
  const pendingJobs = usable.reduce((n, p) => n + p.jobs.filter((j) => !j.done).length, 0);
  log(`${pendingJobs} extraction(s) pending across ${usable.length} photo(s)`);
  if (!pendingJobs) { log("nothing to do."); return; }

  for (const p of usable) {
    if (!existsSync(p.file)) log(`WARNING: source photo missing from disk: ${p.file}`);
  }

  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: "chrome",
    headless: false,
    viewport: { width: 1400, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
  });
  let page = ctx.pages()[0] ?? (await ctx.newPage());

  // Reaching a signed-in project is the flakiest moment of the run: the first
  // launch can bounce through Google OAuth and that redirect sometimes kills the
  // tab. Poll patiently, recreate the page if it dies, and say plainly when a
  // human needs to sign in.
  const READY = 'button:has-text("add_2")';
  const DEADLINE = Date.now() + 10 * 60 * 1000;
  let announced = false;
  await page.goto(FLOW_PROJECT, { waitUntil: "domcontentloaded" }).catch(() => {});
  log("opened Flow project");

  while (Date.now() < DEADLINE) {
    if (page.isClosed()) page = await ctx.newPage();
    try { if (await page.locator(READY).first().isVisible({ timeout: 4000 })) break; } catch {}
    const url = page.url();
    if (url.includes("accounts.google.com")) {
      if (!announced) { log("→ Google sign-in needed. Sign in in the open window; this waits."); announced = true; }
    } else if (!url.includes("/flow/project/")) {
      await page.goto(FLOW_PROJECT, { waitUntil: "domcontentloaded" }).catch(async () => {
        if (page.isClosed()) page = await ctx.newPage();
      });
    }
    await sleep(5000);
  }

  if (!(await page.locator(READY).first().count())) {
    log("could not reach the project (sign-in not completed?). Re-run when signed in.");
    await ctx.close();
    return;
  }
  log("project ready");

  const st = await ensureSettings(page, { ratio: "3:4", variants: "1x" });
  if (!st.ok) { log(`ABORT: could not set 3:4 / 1x — ${st.why}`); await ctx.close(); return; }
  log(`settings confirmed: ${st.label}`);

  if (DRY_RUN) {
    const first = usable.find((p) => p.jobs.some((j) => !j.done));
    log(`dry-run: uploading ${basename(first.file)}`);
    const u = await uploadSource(page, first.file);
    log("  upload:", u.ok ? "OK" : `FAILED — ${u.why}`);
    if (u.ok) {
      const a = await attachSource(page, basename(first.file));
      log("  attach:", a.ok ? "OK" : `FAILED — ${a.why}`);
      const job = first.jobs.find((j) => !j.done);
      log(`  prompt for ${job.kind}: ${(promptFor(job) ?? "").slice(0, 160)}…`);
    }
    log("dry-run: nothing generated.");
    await sleep(3000);
    await ctx.close();
    return;
  }

  let done = 0, failed = 0;
  outer:
  for (const photo of usable) {
    const jobs = photo.jobs.filter((j) => !j.done);
    if (!jobs.length) continue;

    // Upload the photograph once, then run every asset off it. Re-uploading also
    // makes it the most recent asset, which is what the picker defaults to.
    if (!photo.uploaded) {
      const u = await uploadSource(page, photo.file);
      if (!u.ok) { log(`✗ upload ${basename(photo.file)} — ${u.why}`); failed++; continue; }
      photo.uploaded = true;
      saveQueue(q);
      log(`uploaded ${basename(photo.file)}`);
    }

    for (const job of jobs) {
      if (done >= LIMIT) { log(`--limit ${LIMIT} reached`); break outer; }
      const prompt = promptFor(job);
      if (!prompt) { log(`✗ ${job.kind}: unknown kind/angle`); job.done = true; job.error = "unknown kind"; saveQueue(q); continue; }

      const label = `${basename(photo.file)} → ${job.kind}${job.recolour ? ` (${job.recolour})` : ""}`;
      const beforeIds = await gridSettled(page);

      let ok = false, why = "";
      for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
        const a = await attachSource(page, basename(photo.file));
        if (!a.ok) { why = a.why; await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {}); await sleep(6000); continue; }
        const s = await promptAndSend(page, prompt);
        if (!s.ok) { why = s.why; await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {}); await sleep(6000); continue; }
        ok = true;
      }

      if (!ok) { failed++; log(`✗ ${label} — ${why}`); await sleep(8000); continue; }

      job.flowAsset = await captureNewImage(page, beforeIds);
      job.done = true;
      done++;
      saveQueue(q);   // after EVERY image, so Ctrl-C never loses work
      log(`✓ ${label}${job.flowAsset ? "" : "  (WARN: no image id captured)"}  (${done} this run)`);
    }
  }

  const remaining = usable.reduce((n, p) => n + p.jobs.filter((j) => !j.done).length, 0);
  log(`finished: ${done} generated, ${failed} failed, ${remaining} still pending`);
  log("re-run the same command to continue.");
  await ctx.close();
}

main().catch((e) => { console.error("extract error:", e); process.exit(1); });
