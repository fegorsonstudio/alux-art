#!/usr/bin/env node
/**
 * telegram-post-carousel.mjs — send a rendered carousel to Telegram.
 *
 *   node --env-file=.env.local scripts/telegram-post-carousel.mjs --dir <folder> --to admin
 *   node --env-file=.env.local scripts/telegram-post-carousel.mjs --dir <folder> --to channel
 *
 * Two jobs from one script: sending a set to the owner for approval (--to
 * admin), and dropping the approved set into the group (--to channel). They are
 * the same operation pointed at a different chat, so they stay the same code.
 *
 * The folder holds NN.jpg slides and an optional caption.txt.
 *
 * sendMediaGroup is ALL OR NOTHING: one unreadable or oversized item and
 * Telegram rejects the entire batch, so the post silently does not happen.
 * Every file is therefore checked — exists, non-zero, under the size cap, and
 * ends with a real JPEG end-of-image marker — BEFORE the request is built. A
 * truncated slide has already reached a live carousel once in this project;
 * existence was never the property that mattered.
 */

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, basename, resolve } from "node:path";

const args = process.argv.slice(2);
const arg = (n, d = null) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const DIR = arg("--dir");
const TO = (arg("--to", "admin") || "admin").toLowerCase();
const DRY = args.includes("--dry-run");
const NOTE = arg("--note", "");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHANNEL = process.env.TELEGRAM_CHANNEL_ID;
const ADMIN = process.env.TELEGRAM_ADMIN_CHAT_ID;
const API = (m) => `https://api.telegram.org/bot${TOKEN}/${m}`;
const CAPTION_MAX = 1024;
const MAX_BYTES = 10 * 1024 * 1024;

const log = (...a) => console.log(new Date().toISOString(), "[tg-carousel]", ...a);

if (!TOKEN) { console.error("TELEGRAM_BOT_TOKEN not set"); process.exit(2); }
if (!DIR) { console.error("usage: --dir <folder> [--to admin|channel] [--note text] [--dry-run]"); process.exit(2); }

const chatId = TO === "channel" ? CHANNEL : ADMIN;
if (!chatId) { console.error(`no chat id for --to ${TO}`); process.exit(2); }

/** Slides in order, each proven whole. */
function slidesIn(dir) {
  const abs = resolve(dir);
  if (!existsSync(abs)) throw new Error(`folder not found: ${abs}`);
  const files = readdirSync(abs).filter(f => /^\d+\.(jpe?g)$/i.test(f)).sort().map(f => join(abs, f));
  if (!files.length) throw new Error(`no NN.jpg slides in ${abs}`);

  const bad = [];
  for (const f of files) {
    const size = statSync(f).size;
    if (!size) { bad.push(`${basename(f)} (zero bytes)`); continue; }
    if (size > MAX_BYTES) { bad.push(`${basename(f)} (over 10MB)`); continue; }
    const buf = readFileSync(f);
    const whole = buf[0] === 0xff && buf[1] === 0xd8 &&
                  buf[buf.length - 2] === 0xff && buf[buf.length - 1] === 0xd9;
    if (!whole) bad.push(`${basename(f)} (truncated — no JPEG end marker)`);
  }
  if (bad.length) throw new Error(`not sent, bad slides: ${bad.join(", ")}`);
  return files;
}

async function main() {
  const files = slidesIn(DIR);
  const capFile = join(resolve(DIR), "caption.txt");
  let caption = existsSync(capFile) ? readFileSync(capFile, "utf8").trim() : "";
  if (NOTE) caption = `${NOTE}\n\n${caption}`.trim();

  if (DRY) {
    log(`DRY RUN — ${files.length} slide(s) to ${TO}`);
    console.log(caption.slice(0, 300));
    return;
  }

  const fd = new FormData();
  fd.append("chat_id", String(chatId));
  const fits = caption.length <= CAPTION_MAX;
  fd.append("media", JSON.stringify(files.slice(0, 10).map((f, i) => ({
    type: "photo", media: `attach://s${i}`,
    ...(i === 0 && fits && caption ? { caption } : {}),
  }))));
  files.slice(0, 10).forEach((f, i) =>
    fd.append(`s${i}`, new Blob([readFileSync(f)], { type: "image/jpeg" }), basename(f)));

  const r = await fetch(API("sendMediaGroup"), { method: "POST", body: fd });
  const j = await r.json();
  if (!j.ok) throw new Error(`sendMediaGroup failed: ${JSON.stringify(j).slice(0, 240)}`);

  // A caption too long for a media group rides as a follow-up message rather
  // than being silently dropped.
  if (!fits && caption) {
    await fetch(API("sendMessage"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: caption }),
    });
  }
  log(`sent ${files.length} slide(s) from ${basename(resolve(DIR))} to ${TO}`);
}

main().catch(e => { console.error("[tg-carousel] ERROR:", e.message); process.exitCode = 1; });
