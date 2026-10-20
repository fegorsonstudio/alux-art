// Attaches a folder of rendered slide pictures (Unreal studio output) to an
// Alux Micro Drama episode, as if each had been uploaded on /admin/drama →
// Pictures. Files are named by slide: 01.png … 08.png (jpg / webp also fine).
//   node --env-file=.env.local scripts/drama-attach-art.mjs <story> <episode> <folder> [--dry-run]
// The words' position per slide comes from the shot list (top or bottom);
// change it on the desk afterwards if a picture needs it. Nothing is approved
// or posted: the owner still presses Preview, Approve and Schedule.
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { loadStories } from "../tools/drama/check.mjs";
import { shotList } from "../tools/drama/shotlist.mjs";

const [slug, nArg, folder] = process.argv.slice(2);
const dry = process.argv.includes("--dry-run");
if (!slug || !nArg || !folder) { console.error("usage: drama-attach-art.mjs <story> <episode> <folder> [--dry-run]"); process.exit(1); }
const n = Number(nArg);
const [{ story } = {}] = await loadStories(slug);
if (!story) { console.error(`no story ${slug}`); process.exit(1); }
const shots = shotList(story, n).shots;

const files = fs.readdirSync(folder).filter((f) => /^(0[1-9]|10)\.(png|jpe?g|webp)$/i.test(f)).sort();
if (!files.length) { console.error(`no 01.png … 08.png in ${folder}`); process.exit(1); }
const type = (f) => (/\.png$/i.test(f) ? "image/png" : /\.webp$/i.test(f) ? "image/webp" : "image/jpeg");

const sql = postgres(process.env.DATABASE_URL, { ssl: false, max: 1 });
const [row] = await sql`SELECT id FROM drama_stories WHERE slug = ${slug}`;
if (!row) { console.error(`${slug} is not loaded in the database (scripts/drama-seed.mjs)`); process.exit(1); }
const r2 = new S3Client({ region: "auto", endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" });

for (const f of files) {
  const slide = Number(f.slice(0, 2));
  const buf = fs.readFileSync(path.join(folder, f));
  if (buf.length > 30 * 1024 * 1024) { console.log(`skip ${f}: over 30 MB`); continue; }
  const captionAt = shots.find((s) => s.slide === slide)?.captionAt ?? "bottom";
  const key = `drama/art/${slug}/ep${n}/${String(slide).padStart(2, "0")}-${Date.now()}${path.extname(f).toLowerCase()}`;
  if (dry) { console.log(`would attach ${f} → slide ${slide} (words ${captionAt})`); continue; }
  await r2.send(new PutObjectCommand({ Bucket: "generated-4k", Key: key, Body: buf, ContentType: type(f) }));
  await sql`
    INSERT INTO drama_art (story_id, episode_n, slide, bucket, path, source, caption_at)
    VALUES (${row.id}, ${n}, ${slide}, 'generated-4k', ${key}, 'unreal', ${captionAt})
    ON CONFLICT (story_id, episode_n, slide) DO UPDATE SET bucket = EXCLUDED.bucket, path = EXCLUDED.path,
      source = 'unreal', caption_at = EXCLUDED.caption_at, updated_at = now()`;
  console.log(`attached ${f} → slide ${slide} (words ${captionAt})`);
}
console.log(dry ? "dry run: nothing written" : `done — open /admin/drama, press Preview, then Approve.`);
await sql.end();
