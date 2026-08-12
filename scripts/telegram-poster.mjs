// Telegram tutorial auto-poster for the Alux Art Academy channel.
//
// Posts ONE lesson per run. A daily cron calls this each morning; a state file
// tracks which lesson was last posted so every run advances to the next one.
// Lessons live in scripts/telegram-lessons.json (version-controlled). Optional
// per-lesson screenshots live in $TELEGRAM_DATA_DIR/shots/<image>. Progress state
// also lives under $TELEGRAM_DATA_DIR so a git redeploy never resets it.
//
// Secrets come from .env.local — run with:  node --env-file=.env.local scripts/telegram-poster.mjs
// Add --dry-run to preview the next lesson WITHOUT posting or advancing.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DRY_RUN = process.argv.includes("--dry-run");
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_CHANNEL_ID;
// Optional: the admin's private chat id. When set, the bot DMs the admin a
// reminder whenever a lesson due to post needs a screenshot that isn't in yet
// (the lesson is held, not posted, until the image arrives).
const ADMIN = process.env.TELEGRAM_ADMIN_CHAT_ID;
const DATA_DIR = process.env.TELEGRAM_DATA_DIR || "/home/aluxart/telegram-data";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LESSONS_FILE = path.join(__dirname, "telegram-lessons.json");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const SHOTS_DIR = path.join(DATA_DIR, "shots");
const API = (m) => `https://api.telegram.org/bot${TOKEN}/${m}`;
const PHOTO_CAPTION_MAX = 1024; // Telegram limit for a photo caption

const log = (...a) => console.log(new Date().toISOString(), "[telegram-poster]", ...a);

if (!TOKEN || !CHAT) {
  console.error("[telegram-poster] missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL_ID");
  process.exit(1);
}

async function tgSendMessage(text, chatId = CHAT) {
  const r = await fetch(API("sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: false }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error("sendMessage failed: " + JSON.stringify(j));
  return j;
}

async function tgSendPhoto(text, imgPath) {
  const buf = await readFile(imgPath);
  const fd = new FormData();
  fd.append("chat_id", String(CHAT));
  fd.append("parse_mode", "HTML");
  const captionFits = text.length <= PHOTO_CAPTION_MAX;
  if (captionFits) fd.append("caption", text);
  fd.append("photo", new Blob([buf]), path.basename(imgPath));
  const r = await fetch(API("sendPhoto"), { method: "POST", body: fd });
  const j = await r.json();
  if (!j.ok) throw new Error("sendPhoto failed: " + JSON.stringify(j));
  // Long lessons: caption won't fit, so send the full text as a follow-up message.
  if (!captionFits) await tgSendMessage(text);
  return j;
}

/**
 * A lesson that ships as a carousel rather than one screenshot.
 *
 * sendMediaGroup is ALL OR NOTHING: if any single item in the array fails to
 * load or breaks a size limit, Telegram rejects the entire batch and the lesson
 * silently does not post. So every file is checked for existence and non-zero
 * length BEFORE the request is built, and anything missing aborts early with a
 * message naming the file — a held lesson the owner can fix beats a batch that
 * vanishes.
 */
async function tgSendAlbum(text, files) {
  const bad = [];
  const bufs = [];
  for (const f of files) {
    if (!existsSync(f)) { bad.push(`${path.basename(f)} (missing)`); continue; }
    const buf = await readFile(f);
    if (!buf.length) { bad.push(`${path.basename(f)} (zero bytes)`); continue; }
    if (buf.length > 10 * 1024 * 1024) { bad.push(`${path.basename(f)} (over 10MB)`); continue; }
    bufs.push({ buf, name: path.basename(f) });
  }
  if (bad.length) throw new Error(`album not sent, bad slides: ${bad.join(", ")}`);
  if (!bufs.length) throw new Error("album has no slides");

  // Telegram caps a media group at 10; a carousel is 5, so this only guards
  // against a future lesson with more.
  const batch = bufs.slice(0, 10);
  const captionFits = text.length <= PHOTO_CAPTION_MAX;
  const fd = new FormData();
  fd.append("chat_id", String(CHAT));
  fd.append("media", JSON.stringify(batch.map((b, i) => ({
    type: "photo", media: `attach://s${i}`,
    ...(i === 0 && captionFits ? { caption: text, parse_mode: "HTML" } : {}),
  }))));
  batch.forEach((b, i) => fd.append(`s${i}`, new Blob([b.buf], { type: "image/jpeg" }), b.name));

  const r = await fetch(API("sendMediaGroup"), { method: "POST", body: fd });
  const j = await r.json();
  if (!j.ok) throw new Error("sendMediaGroup failed: " + JSON.stringify(j));
  if (!captionFits) await tgSendMessage(text);
  return j;
}

async function main() {
  await mkdir(SHOTS_DIR, { recursive: true });
  const lessons = JSON.parse(await readFile(LESSONS_FILE, "utf8"));

  let state = { lastPostedIndex: -1 };
  if (existsSync(STATE_FILE)) {
    try { state = JSON.parse(await readFile(STATE_FILE, "utf8")); } catch { /* start fresh */ }
  }
  const next = (state.lastPostedIndex ?? -1) + 1;

  if (next >= lessons.length) {
    log(`no lesson to post — all ${lessons.length} lessons already sent. Add more to telegram-lessons.json.`);
    return;
  }

  const lesson = lessons[next];
  const img = lesson.image ? path.join(SHOTS_DIR, lesson.image) : null;
  const hasPhoto = !!(img && existsSync(img));
  // A lesson that names an image but whose file isn't in yet is "waiting on a visual".
  const waitingOnVisual = !!(lesson.image && !hasPhoto);

  if (DRY_RUN) {
    log(`DRY RUN — would post lesson ${next + 1}/${lessons.length}: "${lesson.title || "(untitled)"}"${hasPhoto ? " [with photo " + lesson.image + "]" : waitingOnVisual ? " [HELD — photo MISSING: " + lesson.image + "]" : ""}`);
    console.log("\n----- LESSON PREVIEW -----\n" + lesson.text + "\n--------------------------\n");
    return;
  }

  // Hold the lesson (don't post, don't advance) until its screenshot arrives, and
  // DM the admin what's needed. One nudge per day so it isn't spammy.
  if (waitingOnVisual) {
    log(`HELD lesson ${next + 1}/${lessons.length} "${lesson.title}" — missing image ${lesson.image}. Not posting.`);
    const today = new Date().toISOString().slice(0, 10);
    const reminderKey = `${next}:${today}`;
    if (ADMIN && state.lastReminderKey !== reminderKey) {
      const need = lesson.needs || `a screenshot named "${lesson.image}"`;
      await tgSendMessage(
        `📸 <b>Alux Art Academy — heads up</b>\n\nToday's lesson (Day ${next + 1}: "${lesson.title}") is waiting for a visual: ${need}.\n\nSend it over and it'll post on the next run. Nothing went to the channel today.`,
        ADMIN,
      ).catch((e) => log("admin DM failed:", e.message));
      state.lastReminderKey = reminderKey;
      await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
      log("reminder DM sent to admin.");
    } else if (!ADMIN) {
      log("no TELEGRAM_ADMIN_CHAT_ID set — cannot DM a reminder.");
    }
    return;
  }

  // A lesson can now ship as a carousel (`slides`), a single screenshot
  // (`image`, unchanged), or plain text. `image` is checked first only when
  // there are no slides, so all 21 existing lessons behave exactly as before.
  const slideFiles = Array.isArray(lesson.slides) && lesson.slides.length
    ? lesson.slides.map(s => (path.isAbsolute(s) ? s : path.join(SHOTS_DIR, s)))
    : null;

  log(`posting lesson ${next + 1}/${lessons.length}: "${lesson.title || "(untitled)"}"` +
      (slideFiles ? ` [carousel, ${slideFiles.length} slides]` : hasPhoto ? " [with photo]" : ""));

  if (slideFiles) await tgSendAlbum(lesson.text, slideFiles);
  else if (hasPhoto) await tgSendPhoto(lesson.text, img);
  else await tgSendMessage(lesson.text);

  state.lastPostedIndex = next;
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
  log("done — state saved.");
}

main().catch((e) => {
  console.error(new Date().toISOString(), "[telegram-poster] ERROR:", e.message);
  process.exit(1);
});
