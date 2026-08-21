#!/usr/bin/env npx tsx
/**
 * Pull a set of relights out of R2 and onto the desk, one folder per lighting
 * look, with the untouched original alongside them.
 *
 * The point is a carousel: several versions of one photo, each needing to be
 * labelled with the light that made it. Folder names carry the look number
 * zero-padded, so 006 sorts before 023 before 197 rather than the string order
 * that would put 196 before 23.
 *
 *   npx tsx scripts/download-relights.mts
 *   npx tsx scripts/download-relights.mts --hours 24 --out /tmp/relight-looks
 *
 * Read-only against the database and R2. Nothing is generated and nothing is
 * charged; these images already exist.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

// .env.local has to land in process.env before any app module is imported,
// because they read their configuration at module scope.
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const { signedMediaUrl } = await import("@/lib/media-url");
const { r2SignedDownloadUrl } = await import("@/lib/r2");

const args = process.argv.slice(2);
const argOf = (flag: string, fallback: string) => {
  const i = args.indexOf(flag);
  return i > -1 && args[i + 1] ? args[i + 1] : fallback;
};

const HOURS = Number(argOf("--hours", "12"));
const OUT = argOf("--out", "/tmp/relight-looks");
const EMAIL = argOf("--email", "fegorsonphotography@gmail.com");

const sql = postgres(process.env.DATABASE_URL!, { ssl: false });

/** "197 · S Night Paparazzi G7X" -> { n: 197, slug: "night-paparazzi-g7x" } */
function parseLook(name: string) {
  const m = /^(\d+)\s*·\s*(.*)$/.exec(String(name || ""));
  const n = m ? Number(m[1]) : null;
  // Drop the C/S fixture letter: it records how the light was made, not what it is.
  const bare = (m ? m[2] : String(name || "")).replace(/^[CS]\s+/, "");
  const slug = bare.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return { n, slug: slug || "unnamed" };
}

/**
 * A link that needs no browser session. The media domain first, exactly as the
 * app does it, falling back to a direct R2 signature when the Worker is not
 * configured — otherwise this would quietly download nothing.
 */
async function signedUrl(bucket: string, key: string): Promise<string | null> {
  const viaDomain = await signedMediaUrl(bucket, key, { expiresIn: 3600 }).catch(() => null);
  if (viaDomain) return viaDomain;
  return r2SignedDownloadUrl(bucket, key, 3600).catch(() => null);
}

async function save(url: string, dir: string, filename: string): Promise<number> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), buf);
  return buf.byteLength;
}

const rows = await sql<{
  id: string; enhance: any; out_bucket: string | null; out_path: string | null;
}[]>`
  SELECT sh.id, sh.enhance,
         (SELECT i.download_storage_bucket FROM shoot_images i
           WHERE i.shoot_id = sh.id AND i.status = 'COMPLETE' LIMIT 1) AS out_bucket,
         (SELECT i.download_storage_path FROM shoot_images i
           WHERE i.shoot_id = sh.id AND i.status = 'COMPLETE' LIMIT 1) AS out_path
  FROM shoots sh
  JOIN profiles p ON p.id = sh.user_id
  WHERE p.email = ${EMAIL}
    AND sh.status = 'COMPLETE'
    AND sh.created_at > NOW() - make_interval(hours => ${HOURS})
  ORDER BY sh.created_at`;

// Group by source photo: a set is "one picture, many lights".
const sets = new Map<string, { src: string; items: { look: string; bucket: string | null; path: string }[] }>();
for (const r of rows) {
  for (const [src, look] of Object.entries(r.enhance?.lightingByPath ?? {}) as [string, any][]) {
    if (!r.out_path) continue;
    const key = src.split("/").pop()!;
    if (!sets.has(key)) sets.set(key, { src, items: [] });
    sets.get(key)!.items.push({ look: look.name, bucket: r.out_bucket, path: r.out_path });
  }
}

// The biggest set is the carousel; the rest are kept but filed away.
const ordered = [...sets.entries()].sort((a, b) => b[1].items.length - a[1].items.length);
if (!ordered.length) {
  console.log(`No relights found in the last ${HOURS} hours for ${EMAIL}`);
  await sql.end();
  process.exit(0);
}

let saved = 0, failed = 0;

for (const [srcName, set] of ordered) {
  const isHero = set === ordered[0][1];
  const root = isHero ? OUT : path.join(OUT, "other-photos", srcName.replace(/\.[^.]+$/, ""));
  console.log(`\n=== ${srcName} — ${set.items.length} look(s)${isHero ? "   [carousel set]" : ""}`);

  // The untouched phone photo. Without it there is no "before".
  const origUrl = await signedUrl("shoot-references", set.src);
  if (origUrl) {
    try {
      const bytes = await save(origUrl, path.join(root, "00-original"), srcName);
      console.log(`  00-original/${srcName}  (${Math.round(bytes / 1024)}KB)`);
      saved++;
    } catch (e) { console.log(`  original FAILED: ${(e as Error).message}`); failed++; }
  } else {
    console.log("  original: could not sign a url");
    failed++;
  }

  for (const it of set.items) {
    const { n, slug } = parseLook(it.look);
    const folder = `${n === null ? "xxx" : String(n).padStart(3, "0")}-${slug}`;
    const url = await signedUrl(it.bucket ?? "generated-4k", it.path);
    if (!url) { console.log(`  ${folder}: could not sign a url`); failed++; continue; }
    const ext = it.path.split(".").pop() || "png";
    try {
      const bytes = await save(url, path.join(root, folder), `${folder}.${ext}`);
      console.log(`  ${folder}/  (${Math.round(bytes / 1048576)}MB)  ${it.look}`);
      saved++;
    } catch (e) { console.log(`  ${folder} FAILED: ${(e as Error).message}`); failed++; }
  }
}

console.log(`\nSaved ${saved} file(s)${failed ? `, ${failed} failed` : ""} to:\n  ${OUT}`);
await sql.end();
