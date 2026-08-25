#!/usr/bin/env node
/**
 * Smoke test for the gif_loop fork — no fal call, no money.
 *
 *   node --env-file=.env.local scripts/test-gif-loop.mjs
 *
 * Builds a real booking by hand (template, shoot, slot, tagged references),
 * runs it through the live /api/shoots/[id]/start door with the internal
 * secret, and reports what landed. The before/after pair is a real relight the
 * studio already produced, so the output can be looked at rather than merely
 * counted.
 */
import postgres from "postgres";
import crypto from "node:crypto";

const sql = postgres(process.env.DATABASE_URL, { ssl: false, max: 2 });
const SITE = process.env.SITE_URL || "http://127.0.0.1:3000";

const pick = async () => {
  // A finished photo_upgrade: its identity reference is the "before" and its
  // rendered output is the "after" — a genuine pair, already on disk.
  const [row] = await sql`
    SELECT sh.id, sh.user_id,
           r.storage_bucket AS before_bucket, r.storage_path AS before_path,
           i.preview_storage_bucket AS after_bucket,
           COALESCE(i.download_storage_path, i.preview_storage_path) AS after_path
    FROM shoots sh
    JOIN shoot_references r ON r.shoot_id = sh.id AND r.purpose = 'identity'
    JOIN shoot_images i ON i.shoot_id = sh.id AND i.status = 'COMPLETE'
    WHERE sh.status = 'COMPLETE'
      AND COALESCE(i.download_storage_path, i.preview_storage_path) IS NOT NULL
    ORDER BY sh.created_at DESC LIMIT 1`;
  return row;
};

const main = async () => {
  const src = await pick();
  if (!src) { console.error("no finished shoot to borrow a before/after from"); process.exit(1); }
  console.log(`borrowing from shoot ${src.id.slice(0, 8)} (user ${src.user_id.slice(0, 8)})`);

  // templates.creator_id points at `creators`, not `profiles` — a template is
  // owned by a studio, and the founder's own studio row is the one to borrow.
  const [creator] = await sql`SELECT id FROM creators ORDER BY created_at LIMIT 1`;
  if (!creator) { console.error("no creator row to hang a test template on"); process.exit(1); }

  const templateId = crypto.randomUUID();
  await sql`INSERT INTO templates (id, creator_id, title, description, category, status, is_private, package_size, created_at, updated_at)
    VALUES (${templateId}, ${creator.id}, 'Loop test (delete me)', 'gif_loop smoke test',
            'gif_loop', 'DRAFT', true, 1, NOW(), NOW())`;

  const shootId = crypto.randomUUID();
  const selection = {
    headline: "One light changed this",
    kicker: "Look 197",
    // Paths deliberately omitted: this exercises the tagged-reference fallback,
    // which is the path a real booking uses when the two live in different
    // buckets.
  };
  await sql`INSERT INTO shoots (id, user_id, template_id, status, package_size, enhance, created_at, updated_at)
    VALUES (${shootId}, ${src.user_id}, ${templateId}, 'QUEUED', 1,
            ${sql.json(selection)}, NOW(), NOW())`;
  await sql`INSERT INTO shoot_images (id, shoot_id, user_id, slot, status, created_at, updated_at)
    VALUES (${crypto.randomUUID()}, ${shootId}, ${src.user_id}, 1, 'PENDING', NOW(), NOW())`;

  const ref = (tag, bucket, path) => sql`
    INSERT INTO shoot_references (id, shoot_id, user_id, purpose, tag, name, type, size,
                                  storage_bucket, storage_path, created_at)
    VALUES (${crypto.randomUUID()}, ${shootId}, ${src.user_id}, 'tagged', ${tag},
            ${tag.toLowerCase()}, 'image/jpeg', 1, ${bucket}, ${path}, NOW())`;
  await ref("GIF_BEFORE", src.before_bucket, src.before_path);
  await ref("GIF_AFTER", src.after_bucket, src.after_path);

  console.log(`shoot ${shootId} queued — starting…`);
  const t0 = Date.now();
  const res = await fetch(`${SITE}/api/shoots/${shootId}/start`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-secret": process.env.INTERNAL_API_SECRET },
    body: "{}",
  });
  console.log(`start → ${res.status}`, (await res.text()).slice(0, 300));

  const [img] = await sql`SELECT status, stage, provider, file_size, download_storage_bucket AS b,
                                 download_storage_path AS p, provider_error
                          FROM shoot_images WHERE shoot_id = ${shootId}`;
  const [sh] = await sql`SELECT status FROM shoots WHERE id = ${shootId}`;
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)}s  shoot=${sh.status}  slot=${img.status}`);
  console.log(`  provider  ${img.provider}`);
  console.log(`  stage     ${img.stage}`);
  console.log(`  size      ${img.file_size ? (img.file_size / 1048576).toFixed(2) + " MB" : "—"}`);
  console.log(`  file      ${img.b}/${img.p}`);
  if (img.provider_error) console.log(`  error     ${img.provider_error}`);
  console.log(`\ncleanup:  node --env-file=.env.local scripts/test-gif-loop.mjs --clean ${shootId} ${templateId}`);
  await sql.end();
};

const clean = async () => {
  const [, , , shootId, templateId] = process.argv;
  await sql`DELETE FROM shoot_references WHERE shoot_id = ${shootId}`;
  await sql`DELETE FROM shoot_images WHERE shoot_id = ${shootId}`;
  await sql`DELETE FROM shoots WHERE id = ${shootId}`;
  await sql`DELETE FROM templates WHERE id = ${templateId}`;
  console.log("cleaned");
  await sql.end();
};

(process.argv.includes("--clean") ? clean() : main()).catch(async (e) => {
  console.error(e); await sql.end(); process.exit(1);
});
