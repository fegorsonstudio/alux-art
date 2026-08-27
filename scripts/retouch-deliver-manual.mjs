#!/usr/bin/env node
/**
 * Put a hand-retouched file into the system for a customer whose request never
 * created an order.
 *
 *   node --env-file=.env.local scripts/retouch-deliver-manual.mjs <shootId> <file>
 *
 * Written for @dlush_hairs, whose "Retouched" fell through an anchored matcher
 * into silence, so no shoot_retouch row was ever created and the studio did the
 * work by hand outside the system. This puts that work back inside it: the
 * order, the file, the price, and the payment link the customer is owed.
 *
 * It does NOT release the file. The routes behind /d/<token> refuse a retouched
 * token whose order is unpaid, so the link only becomes worth anything once
 * Paystack confirms — which is the same rule every future customer gets.
 */
import postgres from "postgres";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const sql = postgres(process.env.DATABASE_URL, { ssl: false, max: 2 });
const SITE = process.env.SITE_URL || "http://127.0.0.1:3000";
const PRICE_PER_IMAGE = 1000;

const s3 = new S3Client({
  region: "auto", endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

/** The Instagram credentials for the account that owns this conversation. */
const credsFor = (accountId) => {
  for (const handle of (process.env.IG_ACCOUNTS ?? "").split(",").map(s => s.trim()).filter(Boolean)) {
    const key = handle.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    if (process.env[`IG_${key}_ID`] === accountId) {
      const token = process.env[`IG_${key}_TOKEN`];
      return token ? { accountId, token, handle } : null;
    }
  }
  return null;
};

const main = async () => {
  const [, , shootId, filePath] = process.argv;
  if (!shootId || !filePath) {
    console.error("usage: retouch-deliver-manual.mjs <shootId> <file>");
    process.exit(1);
  }

  const [shoot] = await sql`
    SELECT sh.id, sh.user_id, sh.ig_user_id, sh.ig_account_id, s.ig_username, s.last_inbound_at
    FROM shoots sh
    LEFT JOIN instagram_sessions s
      ON s.ig_user_id = sh.ig_user_id AND s.ig_account_id = sh.ig_account_id
    WHERE sh.id = ${shootId}`;
  if (!shoot) { console.error("no such shoot"); process.exit(1); }

  const hours = shoot.last_inbound_at
    ? (Date.now() - new Date(shoot.last_inbound_at).getTime()) / 3_600_000 : 999;
  console.log(`customer @${shoot.ig_username}  window ${hours < 24 ? "OPEN" : "CLOSED"} (${hours.toFixed(1)}h)`);
  if (hours >= 24) { console.error("window closed - Instagram will refuse the message"); process.exit(1); }

  // ── the file ──────────────────────────────────────────────────────────────
  const bytes = await readFile(filePath);
  const key = `${shoot.user_id}/${shootId}/retouched/${basename(filePath)}`;
  await s3.send(new PutObjectCommand({
    Bucket: "generated-4k", Key: key, Body: bytes, ContentType: "image/jpeg",
  }));
  console.log(`uploaded ${(bytes.length / 1048576).toFixed(1)}MB -> generated-4k/${key}`);

  // ── the order, priced the same as every other ─────────────────────────────
  const [slot] = await sql`
    SELECT id, slot FROM shoot_images WHERE shoot_id = ${shootId} AND status = 'COMPLETE'
    ORDER BY slot LIMIT 1`;
  await sql`
    INSERT INTO shoot_retouch (shoot_id, status, price_ngn, image_count, created_at, updated_at)
    VALUES (${shootId}, 'DELIVERED', ${PRICE_PER_IMAGE}, 1, NOW(), NOW())
    ON CONFLICT (shoot_id) DO UPDATE SET status = 'DELIVERED', updated_at = NOW()`;
  if (slot) {
    await sql`INSERT INTO shoot_retouch_items (shoot_id, image_id) VALUES (${shootId}, ${slot.id})
              ON CONFLICT (shoot_id, image_id) DO NOTHING`;
  }
  // Idempotent: a run that uploads and then fails later must be safe to repeat.
  // storage_path carries a unique index, so a bare ON CONFLICT DO NOTHING covers
  // it without needing to name which index caught it.
  await sql`
    INSERT INTO shoot_retouched_images (id, shoot_id, user_id, slot, storage_bucket, storage_path, file_size, created_at)
    VALUES (${crypto.randomUUID()}, ${shootId}, ${shoot.user_id}, ${slot?.slot ?? 1},
            'generated-4k', ${key}, ${bytes.length}, NOW())
    ON CONFLICT DO NOTHING`;
  console.log("order recorded, unpaid");

  // ── the payment link, from the ordinary route ─────────────────────────────
  const pay = await fetch(`${SITE}/api/shoots/${shootId}/retouched/pay`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
      "x-act-as-user": shoot.user_id,
    },
  });
  const body = await pay.json().catch(() => ({}));
  if (!pay.ok || !body?.authorizationUrl) {
    console.error("could not start payment:", body?.error ?? pay.status);
    process.exit(1);
  }
  console.log("payment link:", body.authorizationUrl);

  // ── tell her ──────────────────────────────────────────────────────────────
  const creds = credsFor(shoot.ig_account_id);
  if (!creds) { console.error("no credentials for", shoot.ig_account_id); process.exit(1); }

  const text =
    "Your retouched photo is ready ✨\n\n" +
    "Sorry for the wait on this one — your message came in and our system " +
    "missed it. That's fixed now.\n\n" +
    `₦${PRICE_PER_IMAGE.toLocaleString("en-NG")} for the retouch. Pay here and ` +
    `the full-quality file unlocks straight away:\n${body.authorizationUrl}`;

  const res = await fetch(`https://graph.instagram.com/v21.0/me/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${creds.token}` },
    body: JSON.stringify({ recipient: { id: shoot.ig_user_id }, message: { text } }),
  });
  const out = await res.text();
  console.log(`message -> ${res.status} ${out.slice(0, 200)}`);
  await sql.end();
};

main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
