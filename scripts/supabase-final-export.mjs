// Final copy of everything still held by Supabase, so the project can be deleted
// (owner, 2026-10-20: "remove it from Supabase ... not cost me money").
//
//   node --env-file=.env.local scripts/supabase-final-export.mjs              export only (read-only on Supabase)
//   node --env-file=.env.local scripts/supabase-final-export.mjs --import     + accounts into auth_users (same ids)
//   node --env-file=.env.local scripts/supabase-final-export.mjs --copy-files + storage files into R2 (same bucket/path)
//
// Run from /home/aluxart/app on the VPS. Re-runnable: nothing is overwritten.
// Writes the export to /root/supabase-export-<date>/ (users.json holds emails:
// the folder is 700). Prints counts only, never emails or keys. Plain fetch, so
// it works on Node 20 (supabase-js realtime needs a WebSocket there).
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { S3Client, HeadBucketCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error("Supabase URL / service key missing from the environment"); process.exit(1); }
const args = new Set(process.argv.slice(2));
const day = new Date().toISOString().slice(0, 10);
const OUT = `/root/supabase-export-${day}`;
fs.mkdirSync(path.join(OUT, "storage"), { recursive: true, mode: 0o700 });
fs.chmodSync(OUT, 0o700);
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

// ── Accounts ────────────────────────────────────────────────────────────────
const users = [];
for (let page = 1; page < 100; page++) {
  const res = await fetch(`${URL_}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: H });
  if (!res.ok) throw new Error(`users page ${page}: HTTP ${res.status}`);
  const body = await res.json();
  const batch = body.users ?? [];
  users.push(...batch);
  if (batch.length < 200) break;
}
fs.writeFileSync(path.join(OUT, "users.json"), JSON.stringify(users, null, 1), { mode: 0o600 });
// The admin list leaves identities out; Google's account id ("sub") is in user_metadata.
const isGoogle = (u) => (u.app_metadata?.providers ?? [u.app_metadata?.provider]).includes("google");
const googleSub = (u) => (isGoogle(u) ? u.user_metadata?.sub ?? u.user_metadata?.provider_id ?? null : null);
const google = users.filter(isGoogle).length;
console.log(`accounts exported: ${users.length} (${google} with Google sign-in)`);

// ── Storage ─────────────────────────────────────────────────────────────────
const files = [];
const bres = await fetch(`${URL_}/storage/v1/bucket`, { headers: H });
if (!bres.ok) throw new Error(`buckets: HTTP ${bres.status}`);
const buckets = await bres.json();
async function list(bucket, prefix) {
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${URL_}/storage/v1/object/list/${bucket}`, {
      method: "POST", headers: { ...H, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
    });
    if (!res.ok) throw new Error(`list ${bucket}/${prefix}: HTTP ${res.status}`);
    const items = await res.json();
    for (const it of items) {
      const full = prefix ? `${prefix}${it.name}` : it.name;
      if (it.id === null) await list(bucket, `${full}/`);
      else files.push({ bucket, path: full, size: it.metadata?.size ?? 0, type: it.metadata?.mimetype ?? "application/octet-stream" });
    }
    if (items.length < 1000) break;
  }
}
for (const b of buckets) await list(b.name, "");
let bytes = 0;
for (const f of files) {
  const dest = path.join(OUT, "storage", f.bucket, f.path);
  if (!fs.existsSync(dest)) {
    const res = await fetch(`${URL_}/storage/v1/object/${f.bucket}/${f.path.split("/").map(encodeURIComponent).join("/")}`, { headers: H });
    if (!res.ok) { console.log(`  could not download ${f.bucket}/${f.path}: HTTP ${res.status}`); f.missing = true; continue; }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  }
  bytes += fs.statSync(dest).size;
}
fs.writeFileSync(path.join(OUT, "storage.json"), JSON.stringify(files, null, 1));
console.log(`buckets: ${buckets.map((b) => b.name).join(", ") || "(none)"}; files: ${files.length}, ${(bytes / 1048576).toFixed(1)} MB saved in ${OUT}`);

// ── Into our own database ───────────────────────────────────────────────────
if (args.has("--import")) {
  const sql = postgres(process.env.DATABASE_URL, { ssl: false, max: 1 });
  let added = 0;
  for (const u of users) {
    if (!u.email) continue;
    const meta = u.user_metadata ?? {};
    const rows = await sql`
      INSERT INTO auth_users (id, email, google_sub, full_name, avatar_url, source, meta, created_at, last_sign_in_at)
      VALUES (${u.id}, ${u.email}, ${googleSub(u)},
              ${meta.full_name ?? meta.name ?? null}, ${meta.avatar_url ?? meta.picture ?? null},
              ${meta.source ?? (isGoogle(u) ? "google" : "supabase")}, ${sql.json(meta)},
              ${u.created_at ?? new Date().toISOString()}, ${u.last_sign_in_at ?? null})
      ON CONFLICT DO NOTHING RETURNING id`;
    added += rows.length;
  }
  // Any profile without a Supabase account (should be none) still gets one, so nobody is locked out.
  const fromProfiles = await sql`
    INSERT INTO auth_users (id, email, full_name, source, created_at)
    SELECT p.id, p.email, p.display_name, 'profile', p.created_at FROM profiles p
    WHERE p.email IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auth_users a WHERE a.id = p.id)
    ON CONFLICT DO NOTHING RETURNING id`;
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM auth_users`;
  const [{ orphans }] = await sql`SELECT count(*)::int AS orphans FROM profiles p WHERE NOT EXISTS (SELECT 1 FROM auth_users a WHERE a.id = p.id)`;
  console.log(`auth_users: ${added} added from Supabase, ${fromProfiles.length} from profiles; ${n} in total; profiles without an account: ${orphans}`);
  await sql.end();
}

if (args.has("--copy-files")) {
  const r2 = new S3Client({ region: "auto", endpoint: process.env.R2_ENDPOINT,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
    requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" });
  const okBucket = new Map();
  let copied = 0, present = 0;
  for (const f of files) {
    if (f.missing) continue;
    if (!okBucket.has(f.bucket)) {
      try { await r2.send(new HeadBucketCommand({ Bucket: f.bucket })); okBucket.set(f.bucket, true); }
      catch { okBucket.set(f.bucket, false); console.log(`  R2 has no bucket "${f.bucket}" — its files stay in ${OUT}/storage/${f.bucket}`); }
    }
    if (!okBucket.get(f.bucket)) continue;
    try { await r2.send(new HeadObjectCommand({ Bucket: f.bucket, Key: f.path })); present++; continue; } catch { /* not there yet */ }
    await r2.send(new PutObjectCommand({ Bucket: f.bucket, Key: f.path, Body: fs.readFileSync(path.join(OUT, "storage", f.bucket, f.path)), ContentType: f.type }));
    copied++;
  }
  console.log(`R2: ${copied} copied, ${present} already there`);
}
