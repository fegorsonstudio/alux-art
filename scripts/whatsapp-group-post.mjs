#!/usr/bin/env node
/**
 * whatsapp-group-post.mjs — post a rendered carousel into one WhatsApp group.
 *
 *   node scripts/whatsapp-group-post.mjs --login
 *   node scripts/whatsapp-group-post.mjs --dir out/wa-intro/wa-intro-aluxart --group "Fegorson Studio Tutorials" --dry-run
 *   node scripts/whatsapp-group-post.mjs --dir out/... --group "..."
 *
 * WHY NOT THE API. The WhatsApp Cloud API has no group endpoint at all — it
 * sends 1:1 to a phone number and nothing else. lib/whatsapp.ts (the booking
 * bot) uses exactly that, and it cannot reach a group. Driving WhatsApp Web is
 * the only route, and it is against WhatsApp's terms; the booking bot shares
 * this account. The mitigations are deliberate and should stay: ONE named
 * group, a couple of posts a day, human-paced gaps, and no contact reading.
 *
 * FAILING SAFELY. WhatsApp Web silently de-authenticates when the paired phone
 * drops off the network or WhatsApp expires the session, and Playwright will
 * then sit on a selector until the cron worker is killed. So the first thing
 * this does is a 5-second logged-in check; if that fails it exits immediately
 * and says so on Telegram rather than hanging.
 */

import { chromium } from "playwright";
import { readdirSync, existsSync, statSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PROFILE = join(ROOT, ".whatsapp-profile");

const args = process.argv.slice(2);
const LOGIN = args.includes("--login");
const DRY = args.includes("--dry-run");
const arg = (n, d = null) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const DIR = arg("--dir");
const GROUP = arg("--group", process.env.WHATSAPP_GROUP_NAME);

const env = process.env.TELEGRAM_BOT_TOKEN ? process.env : (() => {
  try {
    return Object.fromEntries(readFileSync(join(ROOT, ".env.local"), "utf8").split(/\r?\n/)
      .filter(l => /^[A-Z0-9_]+=/.test(l)).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
  } catch { return process.env; }
})();

const log = (...a) => console.log(new Date().toISOString(), "[wa-post]", ...a);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
/** Human-ish pause. A fixed delay is itself a signature. */
const pause = () => sleep(4000 + Math.floor(Math.random() * 5000));

async function alertAdmin(text) {
  const t = env.TELEGRAM_BOT_TOKEN, c = env.TELEGRAM_ADMIN_CHAT_ID;
  if (!t || !c) { log("no Telegram admin configured — cannot alert"); return; }
  await fetch(`https://api.telegram.org/bot${t}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: c, text, parse_mode: "HTML" }),
  }).catch(() => {});
}

/** Slides in order, validated. A half-posted carousel is worse than none. */
function slidesIn(dir) {
  const abs = resolve(ROOT, dir);
  if (!existsSync(abs)) throw new Error(`slide folder not found: ${abs}`);
  const files = readdirSync(abs).filter(f => /\.(jpe?g|png)$/i.test(f)).sort().map(f => join(abs, f));
  if (!files.length) throw new Error(`no slides in ${abs}`);
  const bad = files.filter(f => !statSync(f).size);
  if (bad.length) throw new Error(`zero-byte slides: ${bad.join(", ")}`);
  return files;
}

/**
 * Is this session actually logged in? Five seconds, then give up.
 * The search box is the reliable tell — the chat list renders lazily, and the
 * QR canvas is absent both when logged in and while the page is still booting.
 */
async function isLoggedIn(page) {
  const probes = [
    '[aria-label="Search or start new chat"]',
    '[data-testid="chat-list-search"]',
    'div[contenteditable="true"][data-tab]',
  ];
  for (const sel of probes) {
    const found = await page.waitForSelector(sel, { timeout: 5000 }).then(() => true).catch(() => false);
    if (found) return true;
  }
  return false;
}

async function main() {
  if (!LOGIN && (!DIR || !GROUP)) {
    console.error("usage: --login  |  --dir <slides> --group \"<exact group name>\" [--dry-run]");
    process.exitCode = 2; return;
  }

  const files = LOGIN ? [] : slidesIn(DIR);
  if (!LOGIN) log(`${files.length} slide(s) validated`);

  const ctx = await chromium.launchPersistentContext(PROFILE, {
    channel: "chrome", headless: false, viewport: { width: 1280, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const page = ctx.pages()[0] ?? await ctx.newPage();
  await page.goto("https://web.whatsapp.com", { waitUntil: "domcontentloaded" }).catch(() => {});

  if (LOGIN) {
    console.log("\nScan the QR code with your phone. The session is saved to .whatsapp-profile,");
    console.log("so this is a one-off. Press Ctrl+C once your chats have loaded.\n");
    await page.waitForTimeout(180000);
    await ctx.close();
    return;
  }

  // Pre-flight. Fail fast and loudly rather than hanging a cron worker.
  if (!(await isLoggedIn(page))) {
    await ctx.close();
    const msg = "❌ <b>WhatsApp group post failed</b>\n\nThe WhatsApp Web session is not logged in " +
      "(phone offline, or WhatsApp ended the session).\n\nNothing was posted. Re-pair with:\n" +
      "<code>node scripts/whatsapp-group-post.mjs --login</code>";
    log("NOT LOGGED IN — aborting");
    await alertAdmin(msg);
    process.exitCode = 1; return;
  }
  log("session ok");

  // Open the group by exact name. A partial match could post a client's photos
  // into the wrong chat, so anything less than exact aborts.
  const search = page.locator('[aria-label="Search or start new chat"], div[contenteditable="true"][data-tab="3"]').first();
  await search.click().catch(() => {});
  await page.keyboard.type(GROUP, { delay: 90 });
  await sleep(2500);

  const hit = page.locator(`span[title="${GROUP}"]`).first();
  if (!(await hit.count())) {
    await ctx.close();
    log(`group not found: ${GROUP}`);
    await alertAdmin(`❌ <b>WhatsApp group post failed</b>\n\nNo chat titled exactly “${GROUP}”. Nothing was posted.`);
    process.exitCode = 1; return;
  }
  await hit.click();
  await pause();

  if (DRY) {
    log(`DRY RUN — would send ${files.length} slide(s) to “${GROUP}”`);
    await ctx.close(); return;
  }

  // Attach all slides in one go so WhatsApp groups them as an album.
  const attach = page.locator('[data-testid="attach-menu-plus"], [aria-label="Attach"], span[data-icon="plus-rounded"]').first();
  await attach.click().catch(() => {});
  await sleep(1200);
  const input = page.locator('input[type="file"][accept*="image"]').first();
  await input.setInputFiles(files);
  await sleep(4000);

  const caption = page.locator('div[contenteditable="true"][data-tab]').last();
  const capFile = join(resolve(ROOT, DIR), "caption.txt");
  if (existsSync(capFile)) {
    const text = readFileSync(capFile, "utf8").trim();
    // Enter would send early: WhatsApp needs shift+enter for a newline.
    for (const line of text.split("\n")) {
      await caption.type(line, { delay: 12 });
      await page.keyboard.down("Shift"); await page.keyboard.press("Enter"); await page.keyboard.up("Shift");
    }
  }
  await pause();

  const send = page.locator('[aria-label="Send"], span[data-icon="send"], span[data-icon="wds-ic-send-filled"]').first();
  await send.click();
  await sleep(6000);

  log(`posted ${files.length} slide(s) to “${GROUP}”`);
  await ctx.close();
}

main().catch(async (e) => {
  log("ERROR:", e.message);
  await alertAdmin(`❌ <b>WhatsApp group post failed</b>\n\n<code>${String(e.message).slice(0, 300)}</code>\n\nNothing was posted.`);
  process.exitCode = 1;
});
