/**
 * Publishes a carousel to Instagram.
 *
 * Instagram fetches the images itself, so slides must sit on a public URL before
 * anything can be posted. They are uploaded to R2 and served through the app's
 * own /api/media route, which returns public JPEGs — the only format the
 * publishing API accepts.
 *
 * Publishing is three calls, in this order:
 *   1. one container per slide   (is_carousel_item=true)
 *   2. one carousel container    (media_type=CAROUSEL, children=[ids], caption)
 *   3. publish                   (creation_id=carousel container)
 *
 *   node --env-file=.env.local scripts/instagram-poster.mjs <spec.json> <slidesDir> [--dry-run]
 */
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const DRY = process.argv.includes("--dry-run");
const [specPath, slidesRoot] = process.argv.slice(2).filter(a => !a.startsWith("--"));
const DATA_DIR = process.env.INSTAGRAM_DATA_DIR || "/home/aluxart/instagram-data";
const SITE = process.env.PUBLIC_SITE_URL || "https://aluxartandframes.shop";
const BUCKET = "template-images";
const GRAPH = "https://graph.instagram.com/v23.0";

const log = (...a) => console.log(new Date().toISOString(), "[ig-poster]", ...a);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

async function tokenFor(handle) {
  const store = path.join(DATA_DIR, "tokens.json");
  if (existsSync(store)) {
    const s = JSON.parse(await readFile(store, "utf8"));
    if (s[handle]?.token) return { token: s[handle].token, id: s[handle].id };
  }
  const key = handle.toUpperCase();
  const token = process.env[`IG_${key}_TOKEN`], id = process.env[`IG_${key}_ID`];
  if (!token || !id) throw new Error(`no credentials for "${handle}"`);
  return { token, id };
}

/** Upload one slide and return the URL Instagram will fetch. */
async function hostSlide(file) {
  const buf = await readFile(file);
  const key = `d80f9e08-014e-48b7-8545-b37652059605/ig/${crypto.randomUUID()}-${path.basename(file)}`;
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buf, ContentType: "image/jpeg" }));
  return `${SITE}/api/media?b=${BUCKET}&p=${encodeURIComponent(key)}`;
}

async function graph(pathname, params, token) {
  const url = new URL(GRAPH + pathname);
  const body = new URLSearchParams({ ...params, access_token: token });
  const r = await fetch(url, { method: "POST", body });
  const j = await r.json();
  if (j.error) throw new Error(`${pathname}: ${j.error.message}`);
  return j;
}

/** A container is not usable until Instagram has fetched and accepted the image. */
async function waitReady(containerId, token, label) {
  for (let i = 0; i < 30; i++) {
    const r = await fetch(`${GRAPH}/${containerId}?fields=status_code,status&access_token=${token}`).then(x => x.json());
    if (r.status_code === "FINISHED") return;
    if (r.status_code === "ERROR" || r.status_code === "EXPIRED") {
      throw new Error(`${label} failed: ${r.status || r.status_code}`);
    }
    await sleep(3000);
  }
  throw new Error(`${label} never became ready`);
}

async function main() {
  if (!specPath || !slidesRoot) {
    console.error("usage: instagram-poster.mjs <spec.json> <slidesDir> [--dry-run]");
    process.exit(1);
  }
  const carousels = JSON.parse(await readFile(specPath, "utf8"));

  for (const c of carousels) {
    const dir = path.join(slidesRoot, c.id);
    const files = (await readdir(dir)).filter(f => /^\d+\.jpg$/i.test(f)).sort()
      .map(f => path.join(dir, f));
    if (files.length < 2) throw new Error(`${c.id}: a carousel needs at least 2 slides, found ${files.length}`);
    if (files.length > 10) throw new Error(`${c.id}: ${files.length} slides — Instagram allows 10`);

    const { token, id } = await tokenFor(c.account);
    log(`${c.id} -> @${c.account} (${files.length} slides)`);

    if (DRY) {
      log("DRY RUN — nothing uploaded or posted.");
      log("caption:\n" + c.caption);
      continue;
    }

    // 1. Host the slides.
    const urls = [];
    for (const f of files) { urls.push(await hostSlide(f)); }
    log(`hosted ${urls.length} slides`);

    // 2. One container per slide.
    const children = [];
    for (const [i, u] of urls.entries()) {
      const r = await graph(`/${id}/media`, { image_url: u, is_carousel_item: "true" }, token);
      await waitReady(r.id, token, `slide ${i + 1}`);
      children.push(r.id);
      log(`  slide ${i + 1}/${urls.length} ready`);
    }

    // 3. The carousel itself.
    const parent = await graph(`/${id}/media`, {
      media_type: "CAROUSEL", children: children.join(","), caption: c.caption ?? "",
    }, token);
    await waitReady(parent.id, token, "carousel");

    // 4. Publish.
    const published = await graph(`/${id}/media_publish`, { creation_id: parent.id }, token);
    log(`PUBLISHED media id ${published.id}`);

    const perm = await fetch(`${GRAPH}/${published.id}?fields=permalink&access_token=${token}`).then(x => x.json());
    if (perm.permalink) log(`live at: ${perm.permalink}`);
  }
}

main().catch(e => { console.error(new Date().toISOString(), "[ig-poster] ERROR:", e.message); process.exit(1); });
