#!/usr/bin/env node
/**
 * empty-supabase-storage.mjs — mirror Supabase Storage into R2, then empty it.
 *
 *   node --env-file=.env.local scripts/empty-supabase-storage.mjs --plan
 *   node --env-file=.env.local scripts/empty-supabase-storage.mjs --run
 *
 * BACKGROUND. Supabase restricts EVERY service on a project when storage is over
 * quota — auth included — so a pile of stale files took customer logins down.
 * Nothing writes to Supabase Storage any more (the only three calls left in the
 * app are `download` fallbacks in /api/media, download-zip and the image route),
 * so once R2 holds everything, this bucket set can be emptied for good.
 *
 * SAFETY. For MIRROR buckets a file is deleted only after it has been copied to
 * R2 AND re-read from R2 at the identical byte length. A copy that cannot be
 * verified is left in place. DROP buckets are deleted without mirroring — that
 * is a deliberate, per-bucket decision recorded below, not a default.
 */

import fs from "node:fs";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

const args = process.argv.slice(2);
const PLAN = args.includes("--plan");
const RUN = args.includes("--run");

const env = process.env.NEXT_PUBLIC_SUPABASE_URL ? process.env : Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter(l => /^[A-Z0-9_]+=/.test(l))
    .map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));

const U = env.NEXT_PUBLIC_SUPABASE_URL;
const K = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
const H = { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json" };

const r2 = new S3Client({
  region: "auto", endpoint: env.R2_ENDPOINT,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
  requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED",
});

/**
 * MIRROR — copy to R2, verify, then delete from Supabase.
 * DROP   — delete without copying. Chosen by the owner on 11 Aug 2026:
 *          identity-images is 890 MB of buyers' face photos from shoots that
 *          are already delivered; keeping customers' selfies in a second
 *          provider is a liability with no remaining purpose.
 */
const MIRROR = ["template-images", "inspiration-images", "character-bases", "custom-references", "generated-4k", "shoot-zips"];
const DROP = ["identity-images"];

const MB = (n) => (n / 1048576).toFixed(1) + " MB";
const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);

async function listAll(bucket, prefix = "", depth = 0) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${U}/storage/v1/object/list/${bucket}`, {
      method: "POST", headers: H,
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
    });
    if (!r.ok) break;
    const rows = await r.json();
    if (!rows.length) break;
    for (const row of rows) {
      if (row.id === null) {
        if (depth < 6) out.push(...await listAll(bucket, `${prefix}${row.name}/`, depth + 1));
      } else {
        out.push({ path: `${prefix}${row.name}`, size: Number(row.metadata?.size ?? 0) });
      }
    }
    if (rows.length < 1000) break;
  }
  return out;
}

const download = async (bucket, path) => {
  const r = await fetch(`${U}/storage/v1/object/${bucket}/${encodeURI(path)}`, { headers: H });
  if (!r.ok) throw new Error(`download ${r.status}`);
  return { buf: Buffer.from(await r.arrayBuffer()), type: r.headers.get("content-type") || "application/octet-stream" };
};

/** Supabase deletes in batches of paths per bucket. */
async function remove(bucket, paths) {
  const r = await fetch(`${U}/storage/v1/object/${bucket}`, {
    method: "DELETE", headers: H, body: JSON.stringify({ prefixes: paths }),
  });
  if (!r.ok) throw new Error(`delete ${r.status} ${(await r.text()).slice(0, 120)}`);
  return paths.length;
}

async function main() {
  if (!PLAN && !RUN) { console.error("choose --plan or --run"); process.exitCode = 2; return; }

  let mirrored = 0, dropped = 0, failed = 0, freed = 0;

  for (const bucket of [...MIRROR, ...DROP]) {
    const files = await listAll(bucket);
    const total = files.reduce((a, f) => a + f.size, 0);
    const mode = DROP.includes(bucket) ? "DROP" : "MIRROR";
    console.log(`\n${bucket}  ${files.length} file(s)  ${MB(total)}  → ${mode}`);
    if (!files.length) continue;
    if (PLAN) continue;

    if (mode === "DROP") {
      for (let i = 0; i < files.length; i += 50) {
        const batch = files.slice(i, i + 50);
        try { await remove(bucket, batch.map(f => f.path)); dropped += batch.length; freed += batch.reduce((a, f) => a + f.size, 0); }
        catch (e) { failed += batch.length; console.log(`  FAIL delete batch — ${e.message}`); }
      }
      log(`${bucket}: deleted ${dropped}`);
      continue;
    }

    const ok = [];
    for (const f of files) {
      try {
        const { buf, type } = await download(bucket, f.path);
        await r2.send(new PutObjectCommand({ Bucket: bucket, Key: f.path, Body: buf, ContentType: type }));
        const head = await r2.send(new HeadObjectCommand({ Bucket: bucket, Key: f.path }));
        if (Number(head.ContentLength) !== buf.length) throw new Error(`size ${head.ContentLength} vs ${buf.length}`);
        ok.push(f); mirrored++; freed += f.size;
      } catch (e) {
        failed++;
        console.log(`  KEPT (not verified in R2) ${f.path} — ${e.message}`);
      }
    }
    // Only the verified ones go.
    for (let i = 0; i < ok.length; i += 50) {
      const batch = ok.slice(i, i + 50);
      try { await remove(bucket, batch.map(f => f.path)); }
      catch (e) { console.log(`  FAIL delete batch — ${e.message}`); }
    }
    log(`${bucket}: mirrored+deleted ${ok.length}/${files.length}`);
  }

  console.log(`\n${PLAN ? "PLAN ONLY — nothing changed" : `mirrored ${mirrored}, dropped ${dropped}, failed ${failed}, freed ${MB(freed)}`}`);
  if (RUN) console.log("Re-check Usage in the dashboard; the counter can lag by up to an hour.");
}

main().catch(e => { console.error("error:", e); process.exitCode = 1; });
