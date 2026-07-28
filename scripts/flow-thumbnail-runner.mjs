#!/usr/bin/env node
/**
 * flow-thumbnail-runner.mjs — generate the lighting thumbnails in Google Flow
 * WITHOUT Claude. Plain Node + Playwright, driven by a queue file.
 *
 *   npm run thumbnails -- --dry-run   # check setup, generate nothing
 *   npm run thumbnails                # generate until the queue is empty
 *   npm run thumbnails -- --limit 10  # stop after 10 (useful for a first run)
 *
 * FIRST RUN ONLY: a Chrome window opens on the Flow project. Sign into Google if
 * asked, then leave it alone. The login is saved in .flow-profile/ so later runs
 * start straight into the project. Do not open that profile in another window
 * while the runner is going.
 *
 * Progress is written back to the queue file after EVERY image, so this is safe
 * to stop with Ctrl-C and resume — it never regenerates work already done.
 *
 * WHY THE ATTACH IS FUSSY (this cost a whole run once): Flow's asset picker
 * defaults to the MOST RECENT asset, which after the first generation is a
 * previously relit image — so it silently relights relit images and the subject
 * gets darker and darker. The fix is to attach from the picker's Uploads tab
 * (which only ever lists uploaded files) AND refuse to continue unless the exact
 * expected filename reads back as selected.
 */

import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const QUEUE_FILE = join(__dirname, "lighting-thumbnail-run.json");
const PROFILE_DIR = join(ROOT, ".flow-profile");
const SOURCE_DIR = join(ROOT, ".playwright-mcp", "sources");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const LIMIT = (() => {
  const i = args.indexOf("--limit");
  return i >= 0 ? parseInt(args[i + 1], 10) || Infinity : Infinity;
})();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);

function loadQueue() {
  if (!existsSync(QUEUE_FILE)) throw new Error(`Queue file missing: ${QUEUE_FILE}`);
  return JSON.parse(readFileSync(QUEUE_FILE, "utf8"));
}
function saveQueue(q) {
  writeFileSync(QUEUE_FILE, JSON.stringify(q, null, 2));
}

/**
 * Attach the correct source photo. Returns true only when the exact expected
 * file is provably the selected one — otherwise returns false and generates
 * nothing, because a wrong attachment silently ruins the image.
 */
async function attachSource(page, wantFile) {
  // Open the picker if it is not already open.
  if (!(await page.locator('[role="dialog"]').count())) {
    await page.locator('button:has-text("add_2")').first().click();
    await sleep(1800);
  }
  const dlg = page.locator('[role="dialog"]').first();
  if (!(await dlg.count())) return { ok: false, why: "picker did not open" };

  // Uploads tab: generated images can never appear here. Only click it when it is
  // NOT already the active tab — clicking the selected tab is intercepted by the
  // tab bar and times out.
  const tab = dlg.locator('[role="tab"]', { hasText: "Uploads" }).first();
  if (!(await tab.count())) return { ok: false, why: "no Uploads tab" };
  if ((await tab.getAttribute("aria-selected")) !== "true") {
    await tab.click({ timeout: 10000 }).catch(() => {});
    await sleep(1800);
  }

  const opt = dlg.locator('[role="option"]').filter({ hasText: wantFile }).first();
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

/**
 * Force output settings to 3:4 portrait and 1 variant, then VERIFY.
 *
 * The runner uses its own Chrome profile, so it does NOT inherit settings made in
 * any other browser — a fresh profile silently defaults to a different aspect
 * ratio (9:16), which is how a whole run can come out the wrong shape. Set it
 * explicitly on every run and confirm from the composer's own label.
 */
// The composer label shows the aspect as an ICON LIGATURE, not the ratio text:
// 3:4 reads "crop_portrait", 16:9 reads "crop_16_9". Verifying against "3:4"
// alone can therefore never match. Accept either form.
const RATIO_TOKENS = {
  "3:4": ["3:4", "crop_portrait"],
  "9:16": ["9:16", "crop_9_16"],
  "1:1": ["1:1", "crop_square"],
  "4:3": ["4:3", "crop_landscape"],
  "16:9": ["16:9", "crop_16_9"],
};

async function ensureSettings(page, { ratio = "3:4", variants = "1x" } = {}) {
  const modelBtn = page.locator('button:has-text("Nano Banana")').first();
  if (!(await modelBtn.count())) return { ok: false, why: "no model button" };

  const tokens = RATIO_TOKENS[ratio] ?? [ratio];
  const label = async () => ((await modelBtn.innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim();
  const good = (l) => tokens.some((t) => l.includes(t)) && l.includes(variants);

  if (good(await label())) return { ok: true, label: await label(), changed: false };

  await modelBtn.click();
  await sleep(1500);

  // Option buttons render as "<icon ligature> 3:4", so exact-equality on "3:4"
  // fails. Strip lowercase ligature tokens, then compare what remains.
  //
  // Resolve the button INDEX in JS, but do the actual click through Playwright:
  // a synthetic el.click() does not fire React's handler here, so the panel
  // reports the click yet the setting never changes.
  const clicked = [];
  for (const want of [ratio, variants]) {
    const idx = await page.evaluate((w) => {
      const clean = (el) => (el.innerText || "")
        .split(/\s+/)
        .filter((x) => x && !/^[a-z0-9_]+$/.test(x))
        .join(" ")
        .trim();
      const all = [...document.querySelectorAll("button")];
      for (let i = all.length - 1; i >= 0; i--) {
        if (clean(all[i]) === w || (all[i].innerText || "").trim() === w) return i;
      }
      return -1;
    }, want);
    if (idx >= 0) {
      await page.locator("button").nth(idx).click({ timeout: 8000 }).catch(() => {});
      clicked.push(want);
      await sleep(700);
    }
  }

  await sleep(1400);
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(900);

  const after = await label();
  const ok = good(after);
  return { ok, label: after, clicked, why: ok ? "" : `settings did not stick (label: ${after}, clicked: ${clicked.join("+") || "nothing"})` };
}

/**
 * Type the prompt and send. Playwright's own typing is REQUIRED — setting the
 * text via execCommand/innerText updates the DOM but not Flow's editor state,
 * so the send button submits nothing while appearing to work.
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

  // A real send clears the composer. If text is still sitting there, the click
  // did not take — treat that as a failure rather than a silent no-op.
  await sleep(4000);
  const left = (await box.innerText().catch(() => "")) || "";
  if (left.includes(prompt.slice(0, 40))) return { ok: false, why: "composer did not clear — not sent" };
  return { ok: true };
}

async function main() {
  const q = loadQueue();
  const pending = q.queue.filter((x) => !x.done);
  log(`queue: ${pending.length} pending of ${q.queue.length}`);
  if (!pending.length) { log("nothing to do."); return; }

  for (const f of ["source-full.jpeg", "source-medium.jpg", "source-head.jpeg"]) {
    if (!existsSync(join(SOURCE_DIR, f))) log(`WARNING: local source missing (only needed for re-upload): ${f}`);
  }

  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: "chrome",
    headless: false,
    viewport: { width: 1400, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
  });
  let page = ctx.pages()[0] ?? (await ctx.newPage());

  // Getting to a signed-in project is the flakiest moment of the whole run: the
  // first launch bounces through Google OAuth, and that redirect can crash the
  // tab. So poll patiently instead of waiting on one locator, recreate the page
  // if it dies, and say plainly when a human needs to sign in.
  const READY = 'button:has-text("add_2")';
  const DEADLINE = Date.now() + 10 * 60 * 1000;
  let announcedLogin = false;
  await page.goto(q.flowProject, { waitUntil: "domcontentloaded" }).catch(() => {});
  log("opened Flow project");

  while (Date.now() < DEADLINE) {
    if (page.isClosed()) page = await ctx.newPage();
    try {
      if (await page.locator(READY).first().isVisible({ timeout: 4000 })) break;
    } catch { /* not ready yet, or the page is mid-navigation */ }

    const url = page.url();
    if (url.includes("accounts.google.com")) {
      if (!announcedLogin) {
        log("→ Google sign-in needed. Sign in in the open Chrome window; this waits for you.");
        announcedLogin = true;
      }
    } else if (!url.includes("/flow/project/")) {
      // Crashed or wandered off — steer it back.
      await page.goto(q.flowProject, { waitUntil: "domcontentloaded" }).catch(async () => {
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

  // Getting this wrong ruins every image in the run, so refuse to generate unless
  // the composer itself confirms 3:4 / 1x.
  const st = await ensureSettings(page, { ratio: "3:4", variants: "1x" });
  if (!st.ok) {
    log(`ABORT: could not set 3:4 / 1x — ${st.why}`);
    await ctx.close();
    return;
  }
  log(`settings confirmed: ${st.label}`);

  if (DRY_RUN) {
    const probe = await attachSource(page, pending[0].flowSource);
    log("dry-run attach:", probe.ok ? `OK (${pending[0].flowSource})` : `FAILED — ${probe.why}`);
    log("dry-run: nothing generated. Close the window when done.");
    await sleep(4000);
    await ctx.close();
    return;
  }

  let done = 0, failed = 0;
  for (const item of pending) {
    if (done >= LIMIT) { log(`--limit ${LIMIT} reached`); break; }
    const label = `slot ${item.slot} ${item.name} [${item.framing}]`;

    let ok = false, why = "";
    for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
      const a = await attachSource(page, item.flowSource);
      if (!a.ok) { why = a.why; await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {}); await sleep(6000); continue; }
      const s = await promptAndSend(page, item.prompt);
      if (!s.ok) { why = s.why; await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {}); await sleep(6000); continue; }
      ok = true;
    }

    if (ok) {
      item.done = true;
      done++;
      // Persist after EVERY image so a crash or Ctrl-C never loses progress.
      saveQueue(q);
      log(`✓ ${label}  (${done} this run)`);
      await sleep(30000); // let the generation finish before queuing the next
    } else {
      failed++;
      log(`✗ ${label} — ${why}`);
      await sleep(8000);
    }
  }

  const remaining = q.queue.filter((x) => !x.done).length;
  log(`finished: ${done} generated, ${failed} failed, ${remaining} still pending`);
  log("re-run the same command to continue.");
  await ctx.close();
}

main().catch((e) => { console.error("runner error:", e); process.exit(1); });
