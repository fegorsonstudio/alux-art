#!/usr/bin/env node
/**
 * migrate-supabase-leftovers.mjs — finish the R2 migration, then let Supabase go.
 *
 *   node --env-file=.env.local scripts/migrate-supabase-leftovers.mjs --report
 *   node --env-file=.env.local scripts/migrate-supabase-leftovers.mjs --migrate
 *   node --env-file=.env.local scripts/migrate-supabase-leftovers.mjs --migrate --limit 50
 *
 * WHY. The original migration was partial. Supabase Storage sat at 4.76 GB
 * against a 1 GB free-tier limit, and Supabase restricts EVERY service on the
 * project when storage is over quota — auth included. So a dead pile of old
 * files took customer logins down. Nothing writes to Supabase Storage any more
 * (the only three calls left in the app are `download` fallbacks), so once
 * every file is in R2 the bucket can be emptied and this cannot happen again.
 *
 * The catch that shaped this script: while the project is restricted the
 * Storage API returns 402, so files cannot be copied out. Migrating REQUIRES an
 * unrestricted project. Run this while on Pro, then empty Supabase, then
 * downgrade — in that order.
 *
 * --report is read-only and safe to run any time.
 * --migrate copies Supabase → R2. It NEVER deletes from Supabase; emptying is a
 * separate, deliberate step once you have seen a clean report.
 */

import postgres from "postgres";
import { readFileSync, writeFileSync } from "node:fs";
import { S3Client, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const args = process.argv.slice(2);
const REPORT = args.includes("--report");
const MIGRATE = args.includes("--migrate");
const LIMIT = (() => { const i = args.indexOf("--limit"); return i >= 0 ? parseInt(args[i + 1], 10) || Infinity : Infinity; })();
const OUT = "supabase-leftovers.json";

const env = process.env.DATABASE_URL ? process.env : Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter(l => /^[A-Z0-9_]+=/.test(l))
    .map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));

const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
const DEFAULT_BUCKET = "template-images";

const r2 = new S3Client({
  region: "auto", endpoint: env.R2_ENDPOINT,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
  requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED",
});

/**
 * Every column pair in the database that points at a stored object.
 *
 * Built from information_schema rather than memory, because the first pass at
 * this checked only four of them and reported a backlog less than half the real
 * size. shoot_images alone keeps THREE separate copies of every image.
 */
const SOURCES = [
  ["template_images",        "storage_bucket",           "storage_path"],
  ["templates",              "cover_bucket",             "cover_storage_path"],
  ["shoot_references",       "storage_bucket",           "storage_path"],
  ["identity_images",        "storage_bucket",           "storage_path"],
  ["inspiration_images",     "storage_bucket",           "storage_path"],
  ["shared_setups",          "storage_bucket",           "storage_path"],
  ["creators",               "avatar_bucket",            "avatar_storage_path"],
  ["shoots",                 "zip_storage_bucket",       "zip_storage_path"],
  ["shoot_images",           "download_storage_bucket",  "download_storage_path"],
  ["shoot_images",           "instagram_storage_bucket", "instagram_storage_path"],
  ["shoot_images",           "preview_storage_bucket",   "preview_storage_path"],
  // character_bases stores paths without a bucket column; they live in the
  // character-bases bucket by convention.
  ["character_bases",        null,                       "base_storage_path",    "character-bases"],
  ["character_bases",        null,                       "base_4k_storage_path", "character-bases"],
];

const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);

async function collect(sql) {
  const objects = new Map();          // "bucket|path" -> [sources]
  for (const [table, bucketCol, pathCol, fixedBucket] of SOURCES) {
    const bucketExpr = bucketCol
      ? sql`COALESCE(${sql(bucketCol)}, ${fixedBucket ?? DEFAULT_BUCKET})`
      : sql`${fixedBucket ?? DEFAULT_BUCKET}`;
    try {
      const rows = await sql`
        SELECT DISTINCT ${bucketExpr} AS b, ${sql(pathCol)} AS p
        FROM ${sql(table)} WHERE ${sql(pathCol)} IS NOT NULL AND ${sql(pathCol)} <> ''`;
      for (const r of rows) {
        const k = `${r.b}|${r.p}`;
        (objects.get(k) ?? objects.set(k, []).get(k)).push(`${table}.${pathCol}`);
      }
      console.log(`  ${(table + "." + pathCol).padEnd(42)} ${rows.length}`);
    } catch (e) {
      console.log(`  ${(table + "." + pathCol).padEnd(42)} SKIP — ${e.message.split("\n")[0].slice(0, 60)}`);
    }
  }
  return objects;
}

const inR2 = async (Bucket, Key) => {
  try { await r2.send(new HeadObjectCommand({ Bucket, Key })); return true; } catch { return false; }
};

async function supaDownload(bucket, path) {
  const r = await fetch(`${SUPA_URL}/storage/v1/object/${bucket}/${encodeURI(path)}`,
    { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } });
  if (!r.ok) throw new Error(`supabase ${r.status}`);
  return { buf: Buffer.from(await r.arrayBuffer()), type: r.headers.get("content-type") || "application/octet-stream" };
}

async function main() {
  if (!REPORT && !MIGRATE) { console.error("choose --report or --migrate"); process.exitCode = 2; return; }
  const sql = postgres(env.DATABASE_URL, { ssl: false });

  console.log("Objects referenced by the database:");
  const objects = await collect(sql);
  await sql.end();
  console.log(`\n${objects.size} distinct object(s)\n`);

  console.log("Checking which are already in R2...");
  const keys = [...objects.keys()];
  const missing = [];
  const CONC = 24;
  for (let i = 0; i < keys.length; i += CONC) {
    const batch = keys.slice(i, i + CONC);
    const res = await Promise.all(batch.map(async k => {
      const [b, ...rest] = k.split("|");
      return { k, b, p: rest.join("|"), ok: await inR2(b, rest.join("|")) };
    }));
    for (const r of res) if (!r.ok) missing.push({ bucket: r.b, path: r.p, from: objects.get(r.k) });
    process.stdout.write(`\r  ${Math.min(i + CONC, keys.length)}/${keys.length}`);
  }
  console.log("");

  const byBucket = missing.reduce((a, m) => (a[m.bucket] = (a[m.bucket] ?? 0) + 1, a), {});
  console.log(`\nin R2:   ${keys.length - missing.length}`);
  console.log(`MISSING: ${missing.length}`);
  for (const [b, n] of Object.entries(byBucket).sort((x, y) => y[1] - x[1])) console.log(`  ${b.padEnd(22)} ${n}`);
  writeFileSync(OUT, JSON.stringify(missing, null, 2));
  console.log(`\nfull list: ${OUT}`);

  if (!MIGRATE) {
    console.log("\nRead-only report. Re-run with --migrate to copy these into R2.");
    return;
  }

  console.log(`\nCopying ${Math.min(missing.length, LIMIT)} file(s) Supabase → R2...`);
  let done = 0, failed = 0, bytes = 0;
  for (const m of missing.slice(0, LIMIT)) {
    try {
      const { buf, type } = await supaDownload(m.bucket, m.path);
      await r2.send(new PutObjectCommand({ Bucket: m.bucket, Key: m.path, Body: buf, ContentType: type }));
      // Verify it landed at the right size before counting it as migrated.
      const head = await r2.send(new HeadObjectCommand({ Bucket: m.bucket, Key: m.path }));
      if (Number(head.ContentLength) !== buf.length) throw new Error(`size mismatch ${head.ContentLength} vs ${buf.length}`);
      done++; bytes += buf.length;
      if (done % 25 === 0) log(`${done} copied (${(bytes / 1073741824).toFixed(2)} GB)`);
    } catch (e) {
      failed++;
      console.log(`  FAIL ${m.bucket}/${m.path} — ${e.message}`);
    }
  }
  log(`${done} copied, ${failed} failed, ${(bytes / 1073741824).toFixed(2)} GB moved`);
  console.log(failed === 0
    ? "\nAll clear. Re-run --report to confirm 0 missing, THEN empty Supabase Storage."
    : "\nSome files failed. Do NOT empty Supabase Storage until the report is clean.");
}

main().catch(e => { console.error("migrate error:", e); process.exitCode = 1; });
