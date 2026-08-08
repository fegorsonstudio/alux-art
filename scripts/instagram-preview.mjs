#!/usr/bin/env node
/**
 * instagram-preview.mjs — send the next post to Telegram BEFORE it goes out.
 *
 * A Call to Bar carousel went live carrying photographs of a man in agbada,
 * because the same "here are the results" grid was reused across 27 carousels
 * without checking it suited each subject. It had to be archived after posting.
 * Nothing in the pipeline looked at a post before Instagram did.
 *
 * This runs two hours before each account's slot and sends the whole carousel —
 * every slide, plus the exact caption — to Telegram, so a mismatch is caught
 * while it can still be fixed.
 *
 *   node --env-file=.env.local scripts/instagram-preview.mjs
 *   node --env-file=.env.local scripts/instagram-preview.mjs --account aolivetv
 *
 * Holding a post: if something is wrong, run
 *   node --env-file=.env.local scripts/instagram-hold.mjs <carousel-id>
 * and the scheduler skips it and moves to the next one.
 */

import { readFile, readdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.INSTAGRAM_DATA_DIR || "/home/aluxart/instagram-data";
const APP_DIR = process.env.APP_DIR || "/home/aluxart/app";
const QUEUE = path.join(APP_DIR, "scripts/carousel/queue.json");
const STATE = path.join(DATA_DIR, "schedule.json");
const HOLDS = path.join(DATA_DIR, "holds.json");
const SLIDES = path.join(DATA_DIR, "slides");
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_ADMIN = process.env.TELEGRAM_ADMIN_CHAT_ID;

const args = process.argv.slice(2);
const ONLY = (() => { const i = args.indexOf("--account"); return i >= 0 ? args[i + 1] : null; })();

const log = (...a) => console.log(new Date().toISOString(), "[ig-preview]", ...a);

async function tellAdmin(text) {
  if (!TG_TOKEN || !TG_ADMIN) return;
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TG_ADMIN, text, parse_mode: "HTML", disable_web_page_preview: true }),
  }).catch(() => {});
}

/**
 * Send the slides as one album. Telegram caps a media group at 10, which is
 * comfortably above the 5 a carousel uses. The caption rides on the first item
 * so it appears above the album rather than as a separate message.
 */
async function sendAlbum(files, caption) {
  const form = new FormData();
  const media = files.map((f, i) => ({
    type: "photo",
    media: `attach://s${i}`,
    ...(i === 0 ? { caption, parse_mode: "HTML" } : {}),
  }));
  form.append("chat_id", TG_ADMIN);
  form.append("media", JSON.stringify(media));
  for (let i = 0; i < files.length; i++) {
    form.append(`s${i}`, new Blob([readFileSync(files[i])], { type: "image/jpeg" }), path.basename(files[i]));
  }
  const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMediaGroup`, { method: "POST", body: form })
    .then(x => x.json()).catch(e => ({ ok: false, description: e.message }));
  return r;
}

async function main() {
  if (!TG_TOKEN || !TG_ADMIN) { log("Telegram not configured — nothing to send"); return; }

  const queue = JSON.parse(await readFile(QUEUE, "utf8"));
  const state = existsSync(STATE) ? JSON.parse(await readFile(STATE, "utf8")) : { posted: {} };
  const holds = existsSync(HOLDS) ? JSON.parse(await readFile(HOLDS, "utf8")) : { held: [] };
  const held = new Set(holds.held ?? []);

  const byAccount = {};
  for (const c of queue) {
    if (ONLY && c.account !== ONLY) continue;
    (byAccount[c.account] ??= []).push(c);
  }

  for (const [account, items] of Object.entries(byAccount)) {
    const done = new Set(state.posted?.[account] ?? []);
    // Exactly what the scheduler will choose: the first not posted and not held.
    const next = items.find(c => !done.has(c.id) && !held.has(c.id));
    if (!next) { log(`${account}: nothing queued`); continue; }

    const dir = path.join(SLIDES, next.id);
    if (!existsSync(dir)) { log(`${account}: slides missing for ${next.id}`); continue; }
    const files = (await readdir(dir)).filter(f => f.endsWith(".jpg")).sort().map(f => path.join(dir, f));
    if (!files.length) { log(`${account}: no slide files for ${next.id}`); continue; }

    const header =
      `🔍 <b>Posting in 2 hours — @${account}</b>\n` +
      `<code>${next.id}</code>\n\n` +
      `<b>Caption:</b>\n${next.caption.replace(/</g, "&lt;")}\n\n` +
      `Check the photos actually suit the subject.\n` +
      `To stop it: <code>hold ${next.id}</code>`;

    const res = await sendAlbum(files, header.slice(0, 1024));
    if (res.ok) log(`${account}: previewed ${next.id} (${files.length} slides)`);
    else {
      log(`${account}: album failed — ${res.description}`);
      // Falling back to text is better than silence: at least the caption and
      // the id arrive, so the post can still be held.
      await tellAdmin(header);
    }
  }
}

main().catch(async (e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(new Date().toISOString(), "[ig-preview] ERROR:", msg);
  await tellAdmin(`❌ <b>Instagram preview failed</b>\n\n<code>${msg.slice(0, 300)}</code>\n\nPosts will still go out unreviewed.`);
  process.exitCode = 1;
});
