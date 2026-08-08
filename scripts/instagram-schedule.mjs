/**
 * The daily Instagram scheduler.
 *
 * Runs once a day from cron and posts the next queued carousel for each account.
 * Same shape as the Telegram lesson poster, which has run unattended for weeks:
 * a queue in the repo, state on disk, one item per run.
 *
 * Three deliberate rules, each learned from something that went wrong:
 *
 *   - State advances ONLY after Instagram confirms the post. A crash halfway
 *     leaves the queue where it was rather than silently skipping a carousel.
 *   - Each account is independent. One account failing must not stop the other
 *     two from posting.
 *   - When an account's queue empties it says so on Telegram. The lesson poster
 *     ran dry for four days before anyone noticed, and silence looked identical
 *     to working.
 *
 *   node --env-file=.env.local scripts/instagram-schedule.mjs [--dry-run]
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const DRY = process.argv.includes("--dry-run");
// Post one named account rather than all of them, so the three accounts can be
// spaced hours apart on separate cron entries instead of firing back to back.
// Omitted means every account, which is the original behaviour.
const ONLY = (process.argv.find(a => a.startsWith("--account=")) ?? "").split("=")[1] || null;
const DATA_DIR = process.env.INSTAGRAM_DATA_DIR || "/home/aluxart/instagram-data";
const STATE = path.join(DATA_DIR, "schedule.json");
const APP_DIR = process.env.APP_DIR || "/home/aluxart/app";
// One merged queue rather than per-week files: the scheduler should never need
// to know which week it is, and a missing week file would stop posting silently.
const QUEUE = path.join(APP_DIR, "scripts/carousel/queue.json");
const SLIDES = path.join(DATA_DIR, "slides");
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_ADMIN = process.env.TELEGRAM_ADMIN_CHAT_ID;

const log = (...a) => console.log(new Date().toISOString(), "[ig-schedule]", ...a);

async function tellAdmin(text) {
  if (!TG_TOKEN || !TG_ADMIN) return;
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TG_ADMIN, text, parse_mode: "HTML", disable_web_page_preview: true }),
  }).catch(() => {});
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  const queue = JSON.parse(await readFile(QUEUE, "utf8"));

  const state = existsSync(STATE) ? JSON.parse(await readFile(STATE, "utf8")) : { posted: {} };
  state.posted ??= {};

  // Group by account so each is handled independently.
  const byAccount = {};
  for (const c of queue) {
    if (ONLY && c.account !== ONLY) continue;
    (byAccount[c.account] ??= []).push(c);
  }
  if (ONLY && !byAccount[ONLY]) {
    log(`no carousels queued for account "${ONLY}" — check the spelling against queue.json`);
    return;
  }

  const posted = [], failed = [], empty = [];

  // Posts held after a preview review. A Call to Bar carousel went out carrying
  // photographs of a man in agbada and had to be archived; holding is how that
  // gets stopped once the preview shows it.
  const holdsFile = path.join(DATA_DIR, "holds.json");
  const held = new Set(
    existsSync(holdsFile) ? (JSON.parse(await readFile(holdsFile, "utf8")).held ?? []) : []
  );
  if (held.size) log(`${held.size} post(s) on hold — skipping them`);

  for (const [account, items] of Object.entries(byAccount)) {
    const done = new Set(state.posted[account] ?? []);
    const next = items.find(c => !done.has(c.id) && !held.has(c.id));

    if (!next) { empty.push(account); log(`${account}: queue empty — nothing left to post`); continue; }

    const dir = path.join(SLIDES, next.id);
    if (!existsSync(dir)) {
      failed.push(`${account}: slides missing for ${next.id}`);
      log(`${account}: slides not found at ${dir}`);
      continue;
    }

    if (DRY) { log(`${account}: DRY RUN — would post ${next.id}`); continue; }

    try {
      // Reuse the poster rather than duplicating the publish logic. It takes a
      // spec file, so write a one-item spec for this carousel.
      const one = path.join(DATA_DIR, `.posting-${next.id}.json`);
      await writeFile(one, JSON.stringify([next]));
      const { stdout } = await run("node", ["--env-file=.env.local", "scripts/instagram-poster.mjs", one, SLIDES], {
        cwd: APP_DIR, maxBuffer: 1024 * 1024,
      });
      const link = (stdout.match(/live at: (\S+)/) || [])[1] ?? "(no permalink)";
      // Only now is it safe to record it as done.
      (state.posted[account] ??= []).push(next.id);
      await writeFile(STATE, JSON.stringify(state, null, 2));
      posted.push(`@${account} — ${next.id}\n  ${link}`);
      log(`${account}: posted ${next.id} -> ${link}`);
    } catch (e) {
      // stderr is not the error. The AWS SDK prints a Node-version warning
      // there on every run, and taking the first 200 characters of stderr
      // reported that warning as the failure — the real cause of the first
      // aluxartandframes failure was never visible anywhere.
      const noise = /NodeVersionSupportWarning|The AWS SDK for JavaScript|versions published after|will require node|^\s*$|^To co/;
      const lines = [e.stdout, e.stderr, e.message]
        .filter(Boolean).join("\n").split("\n")
        .map(l => l.trim())
        .filter(l => l && !noise.test(l));
      // Instagram's own error text is the useful part when it is present.
      const best = lines.find(l => /error|fail|invalid|expired|limit|denied/i.test(l)) ?? lines.at(-1) ?? String(e);
      const msg = best.slice(0, 300);
      failed.push(`${account}: ${next.id} failed — ${msg}`);
      log(`${account}: FAILED`, msg);
    }
  }

  if (DRY) return;

  const parts = [];
  if (posted.length) parts.push("📸 <b>Posted to Instagram</b>\n\n" + posted.join("\n"));
  if (failed.length) parts.push("❌ <b>Failed</b>\n\n" + failed.map(f => "• " + f).join("\n"));
  if (empty.length) {
    parts.push("📭 <b>Out of carousels</b>\n\n" + empty.map(a => "• @" + a).join("\n") +
      "\n\nThese accounts have nothing left to post. Add more to scripts/carousel/queue.json.");
  }
  if (parts.length) await tellAdmin(parts.join("\n\n"));
}

main().catch(async (e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(new Date().toISOString(), "[ig-schedule] ERROR:", msg);
  await tellAdmin(`❌ <b>Instagram scheduler crashed</b>\n\n<code>${msg.slice(0, 300)}</code>\n\nNothing posted today.`);
  process.exit(1);
});
