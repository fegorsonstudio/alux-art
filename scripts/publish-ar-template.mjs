#!/usr/bin/env node
/**
 * Puts the AR balloon campaign template into the public marketplace.
 *
 *   node --env-file=.env.local scripts/publish-ar-template.mjs [cover.png]
 *
 * Two flags decide whether a template is listed: is_private (link-only) and
 * marketplace_hidden (creator resales). Both have to be false. A cover is
 * uploaded at the same time, because a card with no picture shows "No preview"
 * and sells nothing.
 *
 * The cover is a STILL, not the GIF. /api/media re-encodes anything it is asked
 * for at a width, and an animated GIF through sharp comes out as one frame — a
 * failure that looks like success. A still frame of the loop is honest.
 */
import postgres from "postgres";
import { readFile } from "node:fs/promises";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "node:crypto";

const sql = postgres(process.env.DATABASE_URL, { ssl: false, max: 2 });
const s3 = new S3Client({
  region: "auto", endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const main = async () => {
  const [tpl] = await sql`SELECT id, title, cover_storage_path FROM templates
    WHERE category = 'ar_experience' ORDER BY created_at DESC LIMIT 1`;
  if (!tpl) { console.error("no ar_experience template"); process.exit(1); }

  const coverFile = process.argv[2];
  if (coverFile) {
    const body = await readFile(coverFile);
    const path = `ar/cover-${crypto.randomUUID()}.png`;
    await s3.send(new PutObjectCommand({
      Bucket: "template-images", Key: path, Body: body, ContentType: "image/png",
    }));
    await sql`UPDATE templates SET cover_storage_path = ${path}, cover_bucket = 'template-images',
      updated_at = NOW() WHERE id = ${tpl.id}`;
    console.log(`cover uploaded  template-images/${path}  ${(body.length / 1024).toFixed(0)} KB`);
  }

  await sql`UPDATE templates SET is_private = false, marketplace_hidden = false,
    status = 'published', updated_at = NOW() WHERE id = ${tpl.id}`;

  const [row] = await sql`SELECT id, title, category, status, is_private, marketplace_hidden,
    price_1_ngn, cover_bucket, cover_storage_path FROM templates WHERE id = ${tpl.id}`;
  console.log(row);
  console.log(`\nlisted at  https://aluxartandframes.shop/marketplace`);
  console.log(`direct     https://aluxartandframes.shop/marketplace/${row.id}`);
  await sql.end();
};

main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
