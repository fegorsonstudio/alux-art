#!/usr/bin/env node
/**
 * One-time migration: copy all files from Supabase Storage → Cloudflare R2.
 *
 * Run AFTER adding R2 env vars to .env.local:
 *   node scripts/migrate-storage-to-r2.mjs
 *
 * Safe to re-run — skips files that already exist in R2 (uses HEAD check).
 * Pass --dry-run to list files without copying.
 */

import { createClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { config } from "dotenv";

config({ path: ".env.local" });

const DRY_RUN = process.argv.includes("--dry-run");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKETS = [
  "identity-images",
  "inspiration-images",
  "template-images",
  "character-bases",
  "generated-4k",
  "shoot-zips",
];

async function r2Exists(bucket, path) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: bucket, Key: path }));
    return true;
  } catch {
    return false;
  }
}

async function listSupabaseFiles(bucket, prefix = "") {
  const all = [];
  let offset = 0;
  const limit = 100;
  for (;;) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      console.error(`  [list error] ${bucket}/${prefix}: ${error.message}`);
      break;
    }
    if (!data || data.length === 0) break;

    for (const item of data) {
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) {
        // folder — recurse
        const children = await listSupabaseFiles(bucket, fullPath);
        all.push(...children);
      } else {
        all.push(fullPath);
      }
    }

    if (data.length < limit) break;
    offset += limit;
  }
  return all;
}

async function migrateBucket(bucket) {
  console.log(`\n=== ${bucket} ===`);
  const files = await listSupabaseFiles(bucket);
  console.log(`  Found ${files.length} files`);

  let copied = 0;
  let skipped = 0;
  let failed = 0;

  for (const path of files) {
    if (await r2Exists(bucket, path)) {
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [dry-run] would copy: ${path}`);
      copied++;
      continue;
    }

    try {
      const { data, error } = await supabase.storage.from(bucket).download(path);
      if (error || !data) {
        console.error(`  [download error] ${path}: ${error?.message}`);
        failed++;
        continue;
      }

      const bytes = Buffer.from(await data.arrayBuffer());
      const ext = path.split(".").pop()?.toLowerCase() ?? "";
      const contentTypeMap = {
        png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
        gif: "image/gif", webp: "image/webp", zip: "application/zip",
      };
      const contentType = contentTypeMap[ext] ?? "application/octet-stream";

      await r2.send(new PutObjectCommand({
        Bucket: bucket,
        Key: path,
        Body: bytes,
        ContentType: contentType,
      }));

      console.log(`  [copied] ${path} (${bytes.byteLength} bytes)`);
      copied++;
    } catch (err) {
      console.error(`  [error] ${path}: ${err.message}`);
      failed++;
    }
  }

  console.log(`  Done: ${copied} copied, ${skipped} skipped (already in R2), ${failed} failed`);
  return { copied, skipped, failed };
}

async function main() {
  console.log("Supabase Storage → Cloudflare R2 migration");
  console.log(DRY_RUN ? "(DRY RUN — no files will be written)\n" : "\n");

  let total = { copied: 0, skipped: 0, failed: 0 };
  for (const bucket of BUCKETS) {
    const result = await migrateBucket(bucket);
    total.copied += result.copied;
    total.skipped += result.skipped;
    total.failed += result.failed;
  }

  console.log("\n=== Migration complete ===");
  console.log(`Total: ${total.copied} copied, ${total.skipped} skipped, ${total.failed} failed`);
  if (total.failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
