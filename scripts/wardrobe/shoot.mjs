#!/usr/bin/env node
/**
 * shoot.mjs — stage 4. Photograph each template's outfit on a real face.
 *
 * A template with no gallery is unsellable: a buyer cannot judge a style from a
 * flat garment cut-out. This generates four images per template in Google Flow —
 * one cover and three gallery shots — from three references at once:
 *
 *   identity   the buyer-facing face, from the male or female folder
 *   outfit     that template's own recoloured garment
 *   pose       the photograph the template was built from, so the stance and
 *              energy of the original shot carry over
 *
 *   node --experimental-strip-types --env-file=.env.local scripts/wardrobe/shoot.mjs --dry-run
 *   node --experimental-strip-types --env-file=.env.local scripts/wardrobe/shoot.mjs --limit 4
 *
 * Free on PRO, resume-safe, and saves after every image like the other stages.
 * Identity is matched to the garment automatically: gowns and women's outfits
 * get the female identity, suits and men's outfits the male one.
 */

import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const QUEUE_FILE = join(__dirname, "wardrobe-run.json");
const PROFILE_DIR = join(ROOT, ".flow-profile");
const ASSET_DIR = join(ROOT, ".wardrobe-assets");

const IDENTITY = {
  female: "C:/Users/FUJITSU/Desktop/identity images",
  male: "C:/Users/FUJITSU/Desktop/fegor",
};

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const LIMIT = (() => { const i = args.indexOf("--limit"); return i >= 0 ? parseInt(args[i + 1], 10) || Infinity : Infinity; })();
const FLOW_PROJECT = "https://labs.google/fx/tools/flow/project/3a3736de-c199-46e6-b58e-ad0ff1418ff9";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);
const loadQueue = () => JSON.parse(readFileSync(QUEUE_FILE, "utf8"));
const saveQueue = (q) => writeFileSync(QUEUE_FILE, JSON.stringify(q, null, 2));

/** Decided from what the scanner already recorded, so nobody has to label 40 photos. */
const genderOf = (p) => {
  const s = `${p.subject} ${p.garmentDescription}`;
  if (/\b(woman|women|female|lady|she|her)\b/i.test(s)) return "female";
  if (/\b(man|men|male|gentleman|he|his)\b/i.test(s)) return "male";
  return "female";
};

/**
 * The four shots. Variety comes from framing, pose and camera — never from
 * changing the outfit, which the Outfit Fidelity Rule forbids.
 */
const SHOTS = [
  { id: "cover", framing: "full-length standing portrait, head to below the hem, subject centred",
    pose: "the exact stance and attitude of the person in IMAGE 3" },
  { id: "three-quarter", framing: "three-quarter length, cropped mid-thigh",
    pose: "turned slightly off-axis, weight on one leg, hands relaxed" },
  { id: "waist-up", framing: "waist-up portrait",
    pose: "squared to camera, chin level, confident and still" },
  { id: "detail", framing: "full-length from a slightly lower angle",
    pose: "mid-stride or turning, so the garment moves" },
];

function shootPrompt(photo, shot) {
  return [
    "EDITORIAL FASHION PHOTOGRAPH built from the attached images.",
    "REFERENCE IMAGE MAP — IMAGE 1: identity reference, the real person whose face and " +
    "body this must be. IMAGE 2: the garment to be worn, a product cut-out. IMAGE 3: a " +
    "pose and composition reference only.",

    "IDENTITY LOCK — the person in the output must be the SAME individual as IMAGE 1: " +
    "same face shape, eye spacing, nose, lips, jawline, skin tone, hairline and body " +
    "build. Preserve a recognisable likeness. Never alter core facial structure. Take " +
    "NOTHING else from IMAGE 1 — not its clothing, background, lighting or framing.",

    "WARDROBE — the subject wears the garment from IMAGE 2, reproduced element for " +
    "element: same colour, print, embroidery, beadwork, seams, neckline, sleeve length, " +
    "hemline, buttons and trim, in the same places and proportions. Do not add, remove, " +
    "recolour, simplify or restyle any part of it, and never substitute a different " +
    "garment. Fit it to the subject's real body from IMAGE 1, never to a hollow " +
    "mannequin shape.",

    `POSE AND FRAMING — ${shot.framing}. Pose: ${shot.pose}. Take ONLY pose, camera ` +
    "angle and composition from IMAGE 3 — never its face, its clothing or its identity.",

    `Scene: professional studio, ${photo.occasion || "editorial"} setting, clean seamless ` +
    "backdrop, soft directional key with gentle falloff and a subtle rim for separation.",
    "Subject: the person from IMAGE 1, relaxed and self-possessed.",
    "Important Details: realistic skin texture, natural asymmetry, realistic fabric folds " +
    "and drape, editorial lens feel, physically plausible light direction, subtle film grain.",
    "Use Case: fashion portrait for a booking page.",
    "Constraints: one person only, no text, no watermark, no logo, no extra limbs, " +
    "hands and fingers correct, no distortion of the garment's construction.",
  ].join(" ");
}

// ── Flow glue (same hard-won behaviour as extract.mjs) ───────────────────────

async function dismissOverlays(page) {
  const overlay = () => page.locator('iframe[src*="changelog"]');
  if (!(await overlay().count().catch(() => 0))) return;
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(900);
  if (await overlay().count().catch(() => 0)) {
    await page.locator('[aria-label*="lose" i]').first().click({ timeout: 4000 }).catch(() => {});
    await sleep(900);
  }
}

const gridIds = (page) => page.evaluate(() =>
  [...document.querySelectorAll('a[href*="/edit/"]')].map((a) => a.getAttribute("href"))
).catch(() => []);

async function gridSettled(page, { quietMs = 12000, maxMs = 180000 } = {}) {
  let last = await gridIds(page), stable = 0;
  for (let w = 0; w < maxMs && stable < quietMs; w += 3000) {
    await sleep(3000);
    const now = await gridIds(page);
    if (now.length === last.length) stable += 3000; else stable = 0;
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
  if (!(await tab.count())) {
    await page.keyboard.press("Escape").catch(() => {});
    await sleep(900);
    await dismissOverlays(page);
    await page.locator('button:has-text("add_2")').first().click({ timeout: 15000 }).catch(() => {});
    await sleep(2200);
    dlg = page.locator('[role="dialog"]').last();
    tab = dlg.locator('[role="tab"]', { hasText: "Uploads" }).first();
  }
  if (!(await tab.count())) return { ok: false, why: "no Uploads tab" };
  if ((await tab.getAttribute("aria-selected")) !== "true") {
    await tab.click({ timeout: 10000 }).catch(() => {});
    await sleep(1800);
  }
  return { ok: true, dlg };
}

async function uploadOnce(page, file, uploaded) {
  const name = basename(file);
  if (uploaded.has(name)) return { ok: true };
  const p = await openPicker(page);
  if (!p.ok) return p;
  const input = page.locator('input[type="file"]').first();
  if (!(await input.count())) return { ok: false, why: "no file input" };
  await input.setInputFiles(file);
  for (let w = 0; w < 120000; w += 3000) {
    await sleep(3000);
    if (await p.dlg.locator('[role="option"]').filter({ hasText: name }).count()) {
      uploaded.add(name);
      return { ok: true };
    }
  }
  return { ok: false, why: `${name} never appeared in Uploads` };
}

/**
 * Attach SEVERAL references in one go — identity, garment and pose.
 *
 * Each is verified as selected before adding, because the picker defaults to
 * the most recent asset and an unverified attach silently photographs the wrong
 * garment on the wrong face.
 */
async function attachAll(page, names) {
  const p = await openPicker(page);
  if (!p.ok) return p;
  for (const name of names) {
    const opt = p.dlg.locator('[role="option"]').filter({ hasText: name }).first();
    if (!(await opt.count())) return { ok: false, why: `${name} not in Uploads` };
    if ((await opt.getAttribute("aria-selected")) !== "true") {
      await opt.click();
      await sleep(1000);
    }
    if ((await opt.getAttribute("aria-selected")) !== "true") return { ok: false, why: `could not select ${name}` };
  }
  const add = page.locator('button:has-text("Add to Prompt")').first();
  if (!(await add.count())) return { ok: false, why: "no Add to Prompt button" };
  await add.click();
  await sleep(1600);
  return { ok: true };
}

const RATIO_TOKENS = { "4:5": ["4:5", "crop_portrait"], "3:4": ["3:4", "crop_portrait"] };

async function ensureSettings(page, { ratio = "3:4", variants = "1x" } = {}) {
  const btn = page.locator('button:has-text("Nano Banana")').first();
  if (!(await btn.count())) return { ok: false, why: "no model button" };
  const tokens = RATIO_TOKENS[ratio] ?? [ratio];
  const label = async () => ((await btn.innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim();
  const forms = [variants, variants.split("").reverse().join("")];
  const good = (l) => tokens.some((t) => l.includes(t)) && forms.some((v) => l.includes(v));
  if (good(await label())) return { ok: true, label: await label() };
  await btn.click();
  await sleep(1500);
  for (const want of [ratio, variants]) {
    const idx = await page.evaluate((w) => {
      const clean = (el) => (el.innerText || "").split(/\s+/).filter((x) => x && !/^[a-z0-9_]+$/.test(x)).join(" ").trim();
      const all = [...document.querySelectorAll("button")];
      for (let i = all.length - 1; i >= 0; i--) if (clean(all[i]) === w || (all[i].innerText || "").trim() === w) return i;
      return -1;
    }, want);
    if (idx >= 0) { await page.locator("button").nth(idx).click({ timeout: 8000 }).catch(() => {}); await sleep(700); }
  }
  await sleep(1400);
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(900);
  const after = await label();
  return good(after) ? { ok: true, label: after } : { ok: false, why: `settings did not stick (${after})` };
}

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
  if (left.includes(prompt.slice(0, 40))) return { ok: false, why: "composer did not clear" };
  return { ok: true };
}

async function captureNew(page, beforeIds) {
  const before = new Set(beforeIds ?? []);
  const topBefore = (beforeIds ?? [])[0] ?? null;
  for (let w = 0; w < 300000; w += 5000) {
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
  const ready = q.photos.filter(p => p.usable && p.templateId);
  if (!ready.length) {
    log("no templates built yet — run build.mjs --templates first");
    return;
  }

  for (const [g, dir] of Object.entries(IDENTITY)) {
    if (!existsSync(dir)) { log(`identity folder missing for ${g}: ${dir}`); return; }
  }
  const identityFiles = Object.fromEntries(
    Object.entries(IDENTITY).map(([g, dir]) => [
      g, readdirSync(dir).filter(f => /\.(jpe?g|png|webp)$/i.test(f)).map(f => join(dir, f)),
    ])
  );
  log(`identity photos — female ${identityFiles.female.length}, male ${identityFiles.male.length}`);

  const pending = [];
  for (const p of ready) {
    p.shots ??= {};
    for (const shot of SHOTS) if (!p.shots[shot.id]?.flowAsset) pending.push({ p, shot });
  }
  log(`${pending.length} shot(s) pending across ${ready.length} template(s)`);
  if (!pending.length) { log("nothing to do."); return; }

  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: "chrome", headless: false, viewport: { width: 1400, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
  });
  let page = ctx.pages()[0] ?? (await ctx.newPage());
  let browserGone = false;
  ctx.on("close", () => { browserGone = true; });

  await page.goto(FLOW_PROJECT, { waitUntil: "domcontentloaded" }).catch(() => {});
  const READY = 'button:has-text("add_2")';
  for (let w = 0; w < 600000; w += 5000) {
    if (page.isClosed()) page = await ctx.newPage();
    try { if (await page.locator(READY).first().isVisible({ timeout: 4000 })) break; } catch {}
    await sleep(5000);
  }
  if (!(await page.locator(READY).first().count())) { log("could not reach the project"); await ctx.close(); return; }
  log("project ready");

  const st = await ensureSettings(page, { ratio: "3:4", variants: "1x" });
  if (!st.ok) { log(`ABORT: ${st.why}`); await ctx.close(); return; }
  log(`settings confirmed: ${st.label}`);

  const uploaded = new Set();
  let done = 0, failed = 0;

  for (const { p, shot } of pending) {
    if (done >= LIMIT) { log(`--limit ${LIMIT} reached`); break; }
    if (browserGone) { log("browser is gone — stopping. Re-run to continue."); break; }

    const gender = genderOf(p);
    const identity = identityFiles[gender][0];
    const garmentJob = p.jobs.find(j => j.kind === p.garmentKind && j.localFile);
    if (!identity || !garmentJob) { log(`· skip ${basename(p.file)} — no identity or garment`); continue; }
    const garment = join(ASSET_DIR, garmentJob.localFile);
    const pose = p.file;

    const label = `${basename(p.file)} ${shot.id} [${gender}]`;
    if (DRY_RUN) {
      log(`· would shoot ${label}`);
      log(`    identity ${basename(identity)} · garment ${basename(garment)} · pose ${basename(pose)}`);
      done++;
      continue;
    }

    let ok = true;
    for (const f of [identity, garment, pose]) {
      const u = await uploadOnce(page, f, uploaded);
      if (!u.ok) { log(`✗ ${label} — upload ${basename(f)}: ${u.why}`); ok = false; break; }
    }
    if (!ok) { failed++; continue; }

    const beforeIds = await gridSettled(page);
    const a = await attachAll(page, [basename(identity), basename(garment), basename(pose)]);
    if (!a.ok) { failed++; log(`✗ ${label} — ${a.why}`); await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {}); await sleep(6000); continue; }

    const s = await promptAndSend(page, shootPrompt(p, shot));
    if (!s.ok) { failed++; log(`✗ ${label} — ${s.why}`); await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {}); await sleep(6000); continue; }

    const asset = await captureNew(page, beforeIds);
    p.shots[shot.id] = { flowAsset: asset, gender, garment: garmentJob.localFile };
    saveQueue(q);
    done++;
    log(`✓ ${label}${asset ? "" : "  (WARN: no image id captured)"}  (${done})`);
  }

  log(`finished: ${done} generated, ${failed} failed`);
  await ctx.close();
}

main().catch((e) => { console.error("shoot error:", e); process.exitCode = 1; });
