#!/usr/bin/env node
/**
 * The loop template, booked the way a customer books it.
 *
 *   node --env-file=.env.local scripts/test-gif-loop-booking.mjs
 *
 * Goes through /api/marketplace/[id]/book — the real door, with the internal
 * secret standing in for a browser session — so what is tested is the code a
 * paying customer runs: ownership checks on the uploaded paths, the tagged
 * reference rows, the enhance column, the slot count.
 *
 * Payment is the one thing skipped. Paystack is proven by every other template
 * and cannot be driven from a script, so the shoot is moved to QUEUED directly,
 * exactly as the webhook would, and then started.
 */
import postgres from "postgres";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

const sql = postgres(process.env.DATABASE_URL, { ssl: false, max: 2 });
const SITE = process.env.SITE_URL || "http://127.0.0.1:3000";
const SECRET = process.env.INTERNAL_API_SECRET;
const s3 = new S3Client({
  region: "auto", endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };

const main = async () => {
  const [tpl] = await sql`SELECT id, title, price_1_ngn FROM templates WHERE category = 'gif_loop' ORDER BY created_at DESC LIMIT 1`;
  if (!tpl) { console.error("no gif_loop template — run scripts/create-gif-loop-template.mjs first"); process.exit(1); }

  const [me] = await sql`SELECT id FROM profiles WHERE email = 'fegorsonphotography@gmail.com' LIMIT 1`;
  if (!me) { console.error("owner profile not found"); process.exit(1); }

  // Two pictures the buyer already owns, taken from R2 itself rather than from
  // the database. A shoot_references row can outlive the object it points at,
  // and a booking built on a dead path fails for a reason that has nothing to
  // do with the code under test.
  const list = await s3.send(new ListObjectsV2Command({
    Bucket: "identity-images", Prefix: `${me.id}/`, MaxKeys: 40,
  }));
  const objects = (list.Contents ?? [])
    .filter(o => (o.Size ?? 0) > 50_000 && /\.(jpe?g|png)$/i.test(o.Key ?? ""))
    .slice(0, 2);
  if (objects.length < 2) { console.error("need two live objects under the owner's prefix"); process.exit(1); }
  const [before, after] = objects.map(o => o.Key);
  console.log(`using
  before ${before}
  after  ${after}`);

  const stolen = await fetch(`${SITE}/api/marketplace/${tpl.id}/book`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-secret": SECRET, "x-act-as-user": me.id },
    body: JSON.stringify({
      identityRefs: [], packageSize: 1, currency: "NGN",
      gifLoop: {
        headline: "Not mine", beforeRef: { storagePath: "00000000-0000-0000-0000-000000000000/x.jpg" },
        afterRef: { storagePath: after },
      },
    }),
  });
  console.log(`someone else's file → ${stolen.status} ${stolen.ok ? "ACCEPTED" : "refused"}`);
  if (stolen.ok) fail("a booking was allowed to name a file it does not own");

  const res = await fetch(`${SITE}/api/marketplace/${tpl.id}/book`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-secret": SECRET, "x-act-as-user": me.id,
    },
    body: JSON.stringify({
      identityRefs: [],                       // a loop has no face in it
      packageSize: 1, currency: "NGN",
      gifLoop: {
        headline: "Same room. One light.",
        kicker: "Look 197",
        beforeRef: { storagePath: before },
        afterRef: { storagePath: after },
      },
    }),
  });
  const body = await res.json().catch(() => ({}));
  console.log(`book → ${res.status}`, JSON.stringify(body).slice(0, 240));
  if (!res.ok) { fail("booking refused"); await sql.end(); return; }

  const shootId = body.shootId ?? body.shoot?.id ?? body.id;
  if (!shootId) { fail("no shoot id came back"); await sql.end(); return; }

  const refs = await sql`SELECT tag, storage_bucket, storage_path FROM shoot_references WHERE shoot_id = ${shootId}`;
  const slots = await sql`SELECT COUNT(*)::int AS n FROM shoot_images WHERE shoot_id = ${shootId}`;
  const [sh] = await sql`SELECT status, enhance FROM shoots WHERE id = ${shootId}`;
  console.log(`  refs   ${refs.map(r => r.tag).join(", ") || "none"}`);
  console.log(`  slots  ${slots[0].n}`);
  console.log(`  status ${sh.status}`);
  console.log(`  enhance ${JSON.stringify(sh.enhance)}`);
  if (slots[0].n !== 1) fail(`expected 1 slot, got ${slots[0].n}`);
  if (!refs.some(r => r.tag === "GIF_BEFORE") || !refs.some(r => r.tag === "GIF_AFTER")) fail("tagged refs missing");
  if (!sh.enhance?.headline) fail("headline never reached the shoot");

  // What the Paystack webhook does on a successful charge.
  await sql`UPDATE shoots SET status = 'QUEUED' WHERE id = ${shootId}`;
  const start = await fetch(`${SITE}/api/shoots/${shootId}/start`, {
    method: "POST", body: "{}",
    headers: { "content-type": "application/json", "x-internal-secret": SECRET },
  });
  console.log(`start → ${start.status}`, (await start.text()).slice(0, 200));

  const [img] = await sql`SELECT status, provider, file_size, download_storage_bucket AS b,
                                 download_storage_path AS p, download_token, provider_error
                          FROM shoot_images WHERE shoot_id = ${shootId}`;
  console.log(`\nslot ${img.status}  ${img.provider ?? ""}  ${img.file_size ? (img.file_size / 1048576).toFixed(2) + " MB" : ""}`);
  console.log(`file ${img.b}/${img.p}`);
  if (img.provider_error) fail(img.provider_error);
  if (img.status !== "COMPLETE") fail("slot did not complete");
  console.log(`\nshoot ${shootId}`);
  await sql.end();
};

main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
