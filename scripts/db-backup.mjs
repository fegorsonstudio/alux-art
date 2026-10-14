// Nightly database backup. Cron on the server (02:30 UTC, before the 03:15 cleanup):
//   30 2 * * * cd /home/aluxart/app && /usr/bin/node --env-file=.env.local scripts/db-backup.mjs >> /home/aluxart/db-backup.log 2>&1
//
// 1. pg_dump (custom format, compressed) to /root/db-backups/aluxart-<UTC>.dump
// 2. Check it: pg_restore must read it and list the tables that matter.
// 3. Encrypt a copy (AES-256, openssl, password in /root/.db-backup-pass) and send
//    it to the owner's Telegram without a notification sound. That copy is the
//    off-server one: the R2 key cannot create a bucket, and a backup kept only on
//    the server's own disk does not survive losing the server.
// 4. Keep the newest 14 local dumps.
// Any failure is sent to the owner on Telegram, loudly.
//
// Restore (from the Telegram file, with the password the owner keeps):
//   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass file:PASSWORD.txt -in X.dump.enc -out X.dump
//   pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" X.dump
//
// The database holds customers' numbers and emails, creators' bank details and
// WhatsApp tokens, so the copy that leaves the server is always encrypted.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import crypto from "node:crypto";

const DIR = "/root/db-backups";
const PASS = "/root/.db-backup-pass";
const KEEP = 14;
const MUST_HAVE = ["shoots", "shoot_images", "payments", "template_purchases", "licence_orders", "profiles"];

async function telegram(method, form) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !chat) { console.error("no Telegram settings"); return false; }
  form.append("chat_id", chat);
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", body: form }).then((x) => x.json()).catch((e) => ({ ok: false, description: e.message }));
  if (!r.ok) console.error(`telegram ${method} failed: ${r.description}`);
  return !!r.ok;
}
async function alarm(text) {
  const f = new FormData();
  f.append("text", `⚠️ Database backup FAILED: ${text}`);
  await telegram("sendMessage", f);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15) + "Z";
const dump = `${DIR}/aluxart-${stamp}.dump`;
try {
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(PASS)) throw new Error(`no password file at ${PASS}`);
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

  // 1. Dump
  execFileSync("pg_dump", ["--format=custom", "--compress=9", "--no-owner", `--file=${dump}.part`, process.env.DATABASE_URL], { stdio: ["ignore", "ignore", "pipe"] });
  fs.renameSync(`${dump}.part`, dump);
  fs.chmodSync(dump, 0o600);

  // 2. Check it can be read back and holds the tables that matter
  const list = execFileSync("pg_restore", ["--list", dump], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const missing = MUST_HAVE.filter((t) => !new RegExp(`TABLE DATA public ${t} `).test(list));
  if (missing.length) throw new Error(`dump is missing table data for: ${missing.join(", ")}`);
  const size = fs.statSync(dump).size;
  if (size < 50 * 1024) throw new Error(`dump is suspiciously small (${size} bytes)`);

  // 3. Encrypted off-server copy, checked by decrypting it again
  const enc = `${dump}.enc`;
  execFileSync("openssl", ["enc", "-aes-256-cbc", "-pbkdf2", "-iter", "200000", "-salt", "-pass", `file:${PASS}`, "-in", dump, "-out", enc]);
  const back = execFileSync("openssl", ["enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "200000", "-pass", `file:${PASS}`, "-in", enc], { maxBuffer: 1024 * 1024 * 1024 });
  const same = crypto.createHash("sha256").update(back).digest("hex") === crypto.createHash("sha256").update(fs.readFileSync(dump)).digest("hex");
  if (!same) throw new Error("the encrypted copy does not decrypt to the same dump");
  const encSize = fs.statSync(enc).size;
  let offsite = "not sent";
  if (encSize > 49 * 1024 * 1024) {
    await alarm(`the encrypted backup is ${(encSize / 1048576).toFixed(1)} MB, over Telegram's 50 MB limit — only the local copy was kept. Time to move backups to a storage bucket.`);
  } else {
    const f = new FormData();
    f.append("document", new Blob([fs.readFileSync(enc)]), `aluxart-db-${stamp}.dump.enc`);
    f.append("caption", `🗄 Nightly database backup ${stamp} (encrypted, ${(encSize / 1048576).toFixed(1)} MB). Keep; needs the backup password to open.`);
    f.append("disable_notification", "true");
    offsite = (await telegram("sendDocument", f)) ? "sent to Telegram" : "Telegram upload FAILED";
    if (offsite !== "sent to Telegram") await alarm("the local backup is fine, but the encrypted copy could not be sent to Telegram.");
  }
  fs.unlinkSync(enc);

  // 4. Keep the newest KEEP local dumps
  const old = fs.readdirSync(DIR).filter((n) => /^aluxart-.*\.dump$/.test(n)).sort().reverse().slice(KEEP);
  for (const n of old) fs.unlinkSync(`${DIR}/${n}`);

  console.log(`[${new Date().toISOString()}] backup ok: ${dump} (${(size / 1048576).toFixed(1)} MB, ${list.split("\n").filter((l) => / TABLE DATA /.test(l)).length} tables), off-server copy ${offsite}, removed ${old.length} old`);
} catch (e) {
  try { fs.unlinkSync(`${dump}.part`); } catch {}
  // A failed command's message repeats its arguments, and pg_dump's include the
  // database URL with its password. Never let that reach the log or Telegram.
  const raw = e instanceof Error ? (e.stderr?.toString?.().trim() || e.message) : String(e);
  const msg = raw.replace(/postgres(ql)?:\/\/\S+/gi, "<database url>");
  console.error(`[${new Date().toISOString()}] backup FAILED: ${msg}`);
  await alarm(msg.slice(0, 500));
  process.exitCode = 1;
}
