#!/usr/bin/env node
/**
 * One real AR campaign booking, end to end, as the admin (admins book free,
 * so no money moves and no gateway is touched).
 *
 *   node --env-file=.env.local scripts/test-ar-booking.mjs [lat] [lng] [radius]
 *
 * Uploads public/logo.png as the brand logo, books the private template through
 * the book route exactly as the checkout would (internal call acting as the
 * admin), waits for the worker, then prints the campaign row, its links and
 * the checks: logo served from template-images, an event counted.
 *
 * Leaves the campaign in place: it is the owner's test link. Suspend it from
 * /admin/ar when done.
 */
import postgres from "postgres";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const sql = postgres(process.env.DATABASE_URL, { ssl: false, max: 2 });
const s3 = new S3Client({
  region: "auto", endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});
const BASE = process.env.AR_TEST_BASE || "http://127.0.0.1:3000";
const lat = Number(process.argv[2] ?? 6.4541), lng = Number(process.argv[3] ?? 3.3947), radiusM = Number(process.argv[4] ?? 1000);

const main = async () => {
  const adminEmail = (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "").split(",")[0].trim();
  const [admin] = await sql`SELECT id, email FROM profiles WHERE email = ${adminEmail}`;
  if (!admin) throw new Error(`no profile for ${adminEmail}`);
  const [tpl] = await sql`SELECT id, price_1_ngn FROM templates WHERE category = 'ar_experience' ORDER BY created_at DESC LIMIT 1`;
  if (!tpl) throw new Error("no ar_experience template; run create-ar-template.mjs first");
  if (!process.env.INTERNAL_API_SECRET) throw new Error("INTERNAL_API_SECRET not set");

  // 1. the logo, where the checkout's uploader would put it
  const logo = await readFile("public/logo.png");
  const logoPath = `${admin.id}/ar-test-${crypto.randomUUID().slice(0, 8)}.png`;
  await s3.send(new PutObjectCommand({ Bucket: "identity-images", Key: logoPath, Body: logo, ContentType: "image/png" }));
  console.log("logo uploaded", logoPath);

  // 2. the booking
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  const res = await fetch(`${BASE}/api/marketplace/${tpl.id}/book`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": process.env.INTERNAL_API_SECRET,
      "x-act-as-user": admin.id,
    },
    body: JSON.stringify({
      packageSize: 1, currency: "NGN", identityRefs: [],
      arExperience: {
        brandName: "Alux Art", tagline: "Photos that look like you, only better",
        logoRef: { storagePath: logoPath },
        colors: ["#2f8e9a", "#ffd166"],
        lat, lng, radiusM, startsAt: today,
      },
    }),
  });
  const j = await res.json().catch(() => ({}));
  console.log("book:", res.status, JSON.stringify(j).slice(0, 300));
  if (!res.ok) throw new Error("booking refused");
  const shootId = j.shootId ?? j.shoot_id ?? j.id;
  if (!shootId) throw new Error("no shoot id in the reply");

  // 3. the worker
  let shoot;
  for (let i = 0; i < 30; i++) {
    [shoot] = await sql`SELECT status, pipeline_stage FROM shoots WHERE id = ${shootId}`;
    if (shoot.status === "COMPLETE" || shoot.status === "FAILED") break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log("shoot:", shoot);
  const [c] = await sql`SELECT * FROM ar_campaigns WHERE shoot_id = ${shootId}`;
  if (!c) throw new Error("no campaign row");
  const [imgs] = await sql`SELECT count(*)::int AS n FROM shoot_images WHERE shoot_id = ${shootId}`;
  console.log("campaign:", { id: c.id, status: c.status, logo: `${c.logo_bucket}/${c.logo_path}`, starts: c.starts_at, ends: c.ends_at, radius: c.radius_m, imageRows: imgs.n });

  // 4. the logo is public, same-origin
  const media = await fetch(`${BASE}/api/media?b=template-images&p=${encodeURIComponent(c.logo_path)}`);
  console.log("logo via /api/media:", media.status, media.headers.get("content-type"), media.headers.get("content-length"));

  // 5. the page and its header
  const page = await fetch(`${BASE}/d/ar/${c.token}`);
  console.log("page:", page.status, "permissions-policy:", page.headers.get("permissions-policy"));
  const html = await page.text();
  console.log("page has brand:", html.includes("Alux Art"), "has preview token leaked:", html.includes(c.preview_token));

  // 6. an event
  const ev = await fetch(`${BASE}/api/ar/${c.token}/event`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "open", os: "android" }),
  });
  const [n] = await sql`SELECT count(*)::int AS n FROM ar_campaign_events WHERE campaign_id = ${c.id}`;
  console.log("event:", ev.status, "rows:", n.n);
  const bad = await fetch(`${BASE}/api/ar/${c.token}/event`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "nonsense" }) });
  const [n2] = await sql`SELECT count(*)::int AS n FROM ar_campaign_events WHERE campaign_id = ${c.id}`;
  console.log("unknown type:", bad.status, "rows still:", n2.n);

  console.log(`\npublic   https://aluxartandframes.shop/d/ar/${c.token}`);
  console.log(`preview  https://aluxartandframes.shop/d/ar/${c.token}?p=${c.preview_token}`);
  console.log(`debug    https://aluxartandframes.shop/d/ar/${c.token}?p=${c.preview_token}&debug=1`);
  console.log(`studio   https://aluxartandframes.shop/studio?shoot_id=${shootId}`);
  await sql.end();
};

main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
