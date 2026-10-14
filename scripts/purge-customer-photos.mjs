// Deletes customers' own uploaded photos 48 hours after they stop being needed,
// which is what the privacy page promises ("automatically and permanently deleted
// within 48 hours of shoot completion or expiry"). Until 14 Oct 2026 they were
// kept forever.
//
//   node --env-file=.env.local scripts/purge-customer-photos.mjs --dry-run   report only
//   node --env-file=.env.local scripts/purge-customer-photos.mjs             delete
// Cron, hourly, so nothing outlives its 48 hours by more than an hour.
//
// SCOPE: only the two buckets that hold customers' uploads, identity-images and
// inspiration-images. Generated results are cleanup-expired's job (7 days).
// template-images (creators' published assets) and character-bases are never
// listed, never touched.
//
// A file is KEPT if any of these is true:
//   - it was uploaded less than 48 hours ago;
//   - a shoot that uses it is still running, or finished/went unpaid less than
//     48 hours ago (shoots stuck in a running state keep their photos);
//   - a WhatsApp or Instagram chat holding it was active in the last 48 hours;
//   - its library row was used in the last 48 hours;
//   - anything permanent points at it: a template, a character base or Soul ID
//     sheet, a carousel post, a creator avatar, a shared setup, a retouched file.
// Everything else in those two buckets is deleted, including files no row points
// at any more. Then the rows that pointed at deleted files go too (library rows,
// shoot references, chat holding lists), so nothing advertises a missing file.
// Every deleted path and row id is written to /root/purge-logs first.
import postgres from "postgres";
import fs from "node:fs";
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";

const DRY = process.argv.includes("--dry-run");
const HOURS = 48;
const BUCKETS = ["identity-images", "inspiration-images"];
const LOG_DIR = "/root/purge-logs";

const sql = postgres(process.env.DATABASE_URL, { ssl: false, max: 2 });
const r2 = new S3Client({ region: "auto", endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" });
const k = (bucket, path) => `${bucket} ${path}`;
const cutoff = new Date(Date.now() - HOURS * 3600e3);

async function telegram(text) {
  const t = process.env.TELEGRAM_BOT_TOKEN, c = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!t || !c) return;
  await fetch(`https://api.telegram.org/bot${t}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: c, text }) }).catch(() => {});
}

try {
  // ── 1. Every file in the two buckets ──
  const files = [];
  for (const bucket of BUCKETS) {
    let token;
    do {
      const r = await r2.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
      for (const o of r.Contents ?? []) files.push({ bucket, path: o.Key, at: o.LastModified, size: o.Size ?? 0 });
      token = r.NextContinuationToken;
    } while (token);
  }

  // ── 2. What must be kept ──
  const keep = new Map(); // key -> reason
  const hold = (bucket, path, why) => { if (bucket && path && !keep.has(k(bucket, path))) keep.set(k(bucket, path), why); };
  const holdAnyBucket = (path, why) => { for (const b of BUCKETS) hold(b, path, why); };

  for (const f of files) if (f.at > cutoff) hold(f.bucket, f.path, "uploaded < 48h ago");

  // Shoots still running, or finished/unpaid less than 48h ago.
  for (const r of await sql`
    SELECT r.storage_bucket, r.storage_path FROM shoot_references r JOIN shoots s ON s.id = r.shoot_id
    WHERE s.status NOT IN ('COMPLETE', 'FAILED', 'PENDING_PAYMENT') OR s.updated_at > ${cutoff}`)
    hold(r.storage_bucket, r.storage_path, "a shoot still needs it");
  // References whose shoot row no longer exists are not "in use".

  // Chats active in the last 48h.
  for (const r of await sql`SELECT selfie_paths, inspiration_path FROM whatsapp_sessions WHERE updated_at > ${cutoff}`) {
    for (const p of r.selfie_paths ?? []) holdAnyBucket(p, "an active WhatsApp chat");
    if (r.inspiration_path) holdAnyBucket(r.inspiration_path, "an active WhatsApp chat");
  }
  for (const r of await sql`SELECT source_paths FROM instagram_sessions WHERE updated_at > ${cutoff}`)
    for (const p of r.source_paths ?? []) holdAnyBucket(p, "an active Instagram chat");

  // Library rows used in the last 48h.
  for (const r of await sql`
    SELECT storage_bucket, storage_path FROM identity_images WHERE coalesce(last_used_at, created_at) > ${cutoff}
    UNION ALL SELECT storage_bucket, storage_path FROM inspiration_images WHERE coalesce(last_used_at, created_at) > ${cutoff}`)
    hold(r.storage_bucket, r.storage_path, "library photo used < 48h ago");

  // Anything permanent.
  const permanent = await sql`
    SELECT storage_bucket AS b, storage_path AS p FROM template_images
    UNION ALL SELECT cover_bucket, cover_storage_path FROM templates
    UNION ALL SELECT storage_bucket, storage_path FROM shared_setups
    UNION ALL SELECT storage_bucket, storage_path FROM shoot_retouched_images
    UNION ALL SELECT avatar_bucket, avatar_storage_path FROM creators WHERE avatar_storage_path IS NOT NULL`;
  for (const r of permanent) { hold(r.b, r.p, "permanent (template / setup / retouch / avatar)"); if (!r.b) holdAnyBucket(r.p, "permanent"); }
  const textBlobs = await sql`
    SELECT concat_ws(' ', base_storage_path, base_4k_storage_path, array_to_string(identity_image_paths, ' '), outfit_ref_path,
                     hairstyle_ref_path, makeup_ref_path, nail_ref_path, array_to_string(accessory_ref_paths, ' ')) AS t FROM character_bases
    UNION ALL SELECT sheet_paths::text FROM character_loras
    UNION ALL SELECT concat_ws(' ', before_path, after_path, scene_paths::text) FROM carousel_posts
    UNION ALL SELECT slide_paths::text FROM scheduled_carousels`;
  const blob = textBlobs.map((r) => r.t ?? "").join("\n");
  for (const f of files) if (!keep.has(k(f.bucket, f.path)) && blob.includes(f.path)) hold(f.bucket, f.path, "permanent (character base / Soul ID / carousel)");

  // ── 3. Decide ──
  const doomed = files.filter((f) => !keep.has(k(f.bucket, f.path)));
  const reasons = {};
  for (const why of keep.values()) reasons[why] = (reasons[why] ?? 0) + 1;
  const byBucket = {};
  for (const f of doomed) byBucket[f.bucket] = (byBucket[f.bucket] ?? 0) + 1;
  const doomedPaths = doomed.map((f) => f.path);
  const rowsIdentity = doomedPaths.length ? await sql`SELECT id, storage_bucket, storage_path FROM identity_images WHERE storage_bucket = ANY(${BUCKETS}) AND storage_path = ANY(${doomedPaths})` : [];
  const rowsInspiration = doomedPaths.length ? await sql`SELECT id, storage_bucket, storage_path FROM inspiration_images WHERE storage_bucket = ANY(${BUCKETS}) AND storage_path = ANY(${doomedPaths})` : [];
  const rowsRefs = doomedPaths.length ? await sql`SELECT id, shoot_id, storage_bucket, storage_path FROM shoot_references WHERE storage_bucket = ANY(${BUCKETS}) AND storage_path = ANY(${doomedPaths})` : [];
  const inBucket = (rows) => rows.filter((r) => doomed.some((f) => f.bucket === r.storage_bucket && f.path === r.storage_path));
  const delIdentity = inBucket(rowsIdentity), delInspiration = inBucket(rowsInspiration), delRefs = inBucket(rowsRefs);

  const summary = {
    when: new Date().toISOString(), dryRun: DRY, hours: HOURS,
    files: files.length, keep: keep.size, delete: doomed.length,
    deleteMB: Math.round(doomed.reduce((a, f) => a + f.size, 0) / 1048576), byBucket,
    rows: { identity_images: delIdentity.length, inspiration_images: delInspiration.length, shoot_references: delRefs.length },
    kept: reasons,
  };

  if (DRY || !doomed.length) {
    console.log(JSON.stringify(summary));
  } else {
    // Record first, so anything deleted can be traced.
    fs.mkdirSync(LOG_DIR, { recursive: true, mode: 0o700 });
    fs.writeFileSync(`${LOG_DIR}/purge-${summary.when.replace(/[:.]/g, "")}.json`,
      JSON.stringify({ summary, files: doomed, delIdentity, delInspiration, delRefs }, null, 1), { mode: 0o600 });

    // Delete files, bucket by bucket; rows follow only what was really deleted.
    const gone = [];
    const failures = [];
    for (const bucket of BUCKETS) {
      const keys = doomed.filter((f) => f.bucket === bucket).map((f) => f.path);
      for (let i = 0; i < keys.length; i += 900) {
        const batch = keys.slice(i, i + 900);
        const r = await r2.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true } }));
        const bad = new Set((r.Errors ?? []).map((e) => e.Key));
        for (const e of r.Errors ?? []) failures.push(`${bucket}/${e.Key}: ${e.Code}`);
        for (const p of batch) if (!bad.has(p)) gone.push({ bucket, path: p });
      }
    }
    for (const bucket of BUCKETS) {
      const paths = gone.filter((g) => g.bucket === bucket).map((g) => g.path);
      if (!paths.length) continue;
      await sql`DELETE FROM identity_images WHERE storage_bucket = ${bucket} AND storage_path = ANY(${paths})`;
      await sql`DELETE FROM inspiration_images WHERE storage_bucket = ${bucket} AND storage_path = ANY(${paths})`;
      await sql`DELETE FROM shoot_references WHERE storage_bucket = ${bucket} AND storage_path = ANY(${paths})`;
    }
    // Chats idle for 48h+ stop holding photos that no longer exist.
    const goneAll = gone.map((g) => g.path);
    if (goneAll.length) {
      await sql`
        UPDATE whatsapp_sessions SET
          selfie_paths = ARRAY(SELECT p FROM unnest(selfie_paths) p WHERE p <> ALL(${goneAll})),
          selfie_count = coalesce(array_length(ARRAY(SELECT p FROM unnest(selfie_paths) p WHERE p <> ALL(${goneAll})), 1), 0),
          inspiration_path = CASE WHEN inspiration_path = ANY(${goneAll}) THEN NULL ELSE inspiration_path END
        WHERE updated_at <= ${cutoff} AND (selfie_paths && ${goneAll}::text[] OR inspiration_path = ANY(${goneAll}))`;
      await sql`
        UPDATE instagram_sessions SET source_paths = ARRAY(SELECT p FROM unnest(source_paths) p WHERE p <> ALL(${goneAll}))
        WHERE updated_at <= ${cutoff} AND source_paths && ${goneAll}::text[]`;
    }
    console.log(JSON.stringify({ ...summary, deleted: gone.length, failures: failures.slice(0, 10) }));
    if (failures.length) await telegram(`⚠️ Customer photo cleanup: ${failures.length} file(s) could not be deleted. First: ${failures[0]}`);
  }
} catch (e) {
  const msg = (e instanceof Error ? e.message : String(e)).replace(/postgres(ql)?:\/\/\S+/gi, "<database url>");
  console.error(JSON.stringify({ when: new Date().toISOString(), error: msg }));
  await telegram(`⚠️ Customer photo cleanup FAILED: ${msg.slice(0, 400)}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
