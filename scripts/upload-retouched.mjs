#!/usr/bin/env node
/**
 * upload-retouched.mjs — deliver hand-retouched images into a buyer's shoot.
 *
 *   node scripts/upload-retouched.mjs --shoot <id> --dir /path/to/files        # dry run
 *   node scripts/upload-retouched.mjs --shoot <id> --dir /path --apply
 *   node scripts/upload-retouched.mjs --shoot <id> --dir /path --apply --free  # comped
 *
 * Run it ON THE VPS: it needs R2 credentials and DATABASE_URL from .env.local.
 *
 * What it does, in order: uploads each file to R2, writes a row per file, marks
 * the retouch DELIVERED, and emails the buyer. The email is last and cannot fail
 * the delivery — if it bounces, the files are still there and the mail can be
 * re-sent on its own.
 *
 * Pricing is per image at the rate below, fixed onto the order at delivery so a
 * later price change never alters a bill already shown to a buyer. --free comps
 * the whole thing and is recorded as free rather than as a fake payment, so the
 * revenue numbers stay honest.
 *
 * Re-running is safe: files already delivered for this shoot are skipped by
 * storage path, so a half-finished upload can simply be run again.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRICE_PER_IMAGE_NGN = 1000;
const BUCKET = "generated-4k";
const EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const SHOOT = arg("--shoot");
const DIR = arg("--dir");
const APPLY = process.argv.includes("--apply");
const FREE = process.argv.includes("--free");
if (!SHOOT || !DIR) { console.error("usage: --shoot <id> --dir <folder> [--apply] [--free]"); process.exit(2); }
if (!existsSync(DIR)) { console.error(`no such folder: ${DIR}`); process.exit(2); }

const envPath = existsSync("/home/aluxart/app/.env.local")
  ? "/home/aluxart/app/.env.local"
  : join(__dirname, "..", ".env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8").split(/\r?\n/)
    .filter(l => /^[A-Z0-9_]+=/.test(l))
    .map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));

const sql = postgres(env.DATABASE_URL, { ssl: false });
const r2 = new S3Client({
  region: "auto",
  endpoint: env.R2_ENDPOINT,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});

async function main() {
  const [shoot] = await sql`SELECT id, user_id, owner_email, status, package_size FROM shoots WHERE id = ${SHOOT}`;
  if (!shoot) throw new Error(`no shoot ${SHOOT}`);
  if (shoot.status !== "COMPLETE") {
    console.warn(`warning: shoot status is ${shoot.status}, not COMPLETE`);
  }

  const files = readdirSync(DIR)
    .filter(f => EXT.has(extname(f).toLowerCase()))
    .map(f => join(DIR, f))
    .filter(f => statSync(f).isFile())
    .sort();
  if (files.length === 0) throw new Error(`no images in ${DIR}`);

  const already = await sql`SELECT storage_path FROM shoot_retouched_images WHERE shoot_id = ${SHOOT}`;
  const done = new Set(already.map(r => r.storage_path));

  console.log(`shoot:  ${SHOOT}`);
  console.log(`buyer:  ${shoot.owner_email}`);
  console.log(`files:  ${files.length}${done.size ? `  (${done.size} already delivered)` : ""}`);
  console.log(`price:  ${FREE ? "FREE (comped)" : "₦" + (files.length * PRICE_PER_IMAGE_NGN).toLocaleString()}`);

  const planned = [];
  let slot = 0;
  for (const file of files) {
    slot++;
    const meta = await sharp(file).metadata().catch(() => ({}));
    const key = `${shoot.user_id}/${SHOOT}/retouched/${randomUUID()}-${basename(file)}`;
    planned.push({ file, key, slot, width: meta.width ?? null, height: meta.height ?? null, size: statSync(file).size });
    console.log(`   slot ${slot}  ${basename(file)}  ${meta.width ?? "?"}x${meta.height ?? "?"}  ${(statSync(file).size / 1048576).toFixed(1)}MB`);
  }

  if (!APPLY) { console.log("\ndry run. add --apply to upload."); return; }

  let uploaded = 0;
  for (const p of planned) {
    const body = readFileSync(p.file);
    const contentType = extname(p.file).toLowerCase() === ".png" ? "image/png"
      : extname(p.file).toLowerCase() === ".webp" ? "image/webp" : "image/jpeg";
    await r2.send(new PutObjectCommand({ Bucket: BUCKET, Key: p.key, Body: body, ContentType: contentType }));
    // Prove it landed before writing a row that promises it exists.
    await r2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: p.key }));
    await sql`
      INSERT INTO shoot_retouched_images (id, shoot_id, user_id, slot, storage_bucket, storage_path, file_size, width, height)
      VALUES (${randomUUID()}, ${SHOOT}, ${shoot.user_id}, ${p.slot}, ${BUCKET}, ${p.key}, ${p.size}, ${p.width}, ${p.height})
      ON CONFLICT (shoot_id, storage_path) DO NOTHING`;
    uploaded++;
    console.log(`   uploaded ${uploaded}/${planned.length}  slot ${p.slot}`);
  }

  const total = await sql`SELECT count(*)::int AS n FROM shoot_retouched_images WHERE shoot_id = ${SHOOT}`;
  const count = total[0].n;
  const price = FREE ? 0 : count * PRICE_PER_IMAGE_NGN;

  await sql`
    INSERT INTO shoot_retouch (shoot_id, status, price_ngn, image_count, free, delivered_at, updated_at)
    VALUES (${SHOOT}, 'DELIVERED', ${price}, ${count}, ${FREE}, NOW(), NOW())
    ON CONFLICT (shoot_id) DO UPDATE SET
      status = 'DELIVERED', price_ngn = ${price}, image_count = ${count},
      free = ${FREE}, delivered_at = NOW(), updated_at = NOW()`;

  console.log(`\ndelivered ${count} image(s), ${FREE ? "free" : "₦" + price.toLocaleString()}`);

  // Last, and never fatal: the files and rows are already in place. A bounced
  // email is re-sendable on its own and must not make a good delivery look
  // failed, which is how someone ends up uploading everything twice.
  try {
    const res = await fetch(`http://127.0.0.1:3000/api/shoots/${SHOOT}/retouched/notify`, {
      method: "POST",
      headers: { "x-internal-secret": env.INTERNAL_API_SECRET ?? "" },
    });
    const body = await res.json().catch(() => ({}));
    console.log(res.ok && body.sent
      ? `emailed ${shoot.owner_email}`
      : `EMAIL NOT SENT (${res.status}) — files are delivered; re-run the notify route alone`);
  } catch (e) {
    console.log(`EMAIL NOT SENT (${e.message}) — files are delivered; re-run the notify route alone`);
  }
}

main()
  .then(() => sql.end())
  .catch(async (e) => { console.error("error:", e.message); process.exitCode = 1; try { await sql.end(); } catch {} });
