#!/usr/bin/env node
/**
 * Puts loops on the Alux Art GIPHY channel with tags that can actually find them.
 *
 *   node --env-file=.env.local scripts/carousel/giphy-upload.mjs out/beat-gifs/manifest.json
 *   node --env-file=.env.local scripts/carousel/giphy-upload.mjs <file> --tags a,b,c
 *   ... --dry            print what would happen and upload nothing
 *
 * WHY THIS EXISTS. The first nine were uploaded through the website and tagged
 * #photography, #selfie, #transformation, #photoshoot and #lighting — every one
 * of which returns millions of GIFs and none of ours. Searching "aluxart" in
 * Instagram's picker found two of the nine. GIPHY sets tags at upload and gives
 * no way to edit them afterwards, so the only fix is to upload again with
 * better ones, which means doing it over the API.
 *
 * Every upload carries `aluxart`, `aluxartandframes` and a per-loop tag like
 * `aluxart197`, so the brand returns all of them and the look number returns
 * exactly one.
 *
 * The response gives back a GIF id; the URL is https://giphy.com/gifs/<id>.
 * Newly uploaded content takes a while to appear in the Instagram picker even
 * once the channel is approved — that wait is GIPHY's indexing, not a fault
 * here.
 */
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const KEY = process.env.GIPHY_API_KEY;
// Case-sensitive. GIPHY refuses with "User 'Aluxart' is not allowed to upload
// on behalf of 'aluxart'" if this does not match the account exactly.
const USERNAME = process.env.GIPHY_USERNAME || "Aluxart";
const DRY = process.argv.includes("--dry");

if (!KEY) { console.error("GIPHY_API_KEY is not set"); process.exit(1); }

const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : undefined; };

/**
 * One upload.
 *
 * source_post_url is sent so GIPHY attributes the loop back to the site rather
 * than showing it as orphaned content.
 */
async function upload(file, tags) {
  const bytes = await readFile(file);
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "image/gif" }), basename(file));
  form.append("username", USERNAME);
  form.append("tags", tags.join(","));
  form.append("source_post_url", "https://aluxartandframes.shop");

  const res = await fetch(`https://upload.giphy.com/v1/gifs?api_key=${KEY}`, {
    method: "POST", body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.data?.id) {
    return { ok: false, error: body?.meta?.msg ?? `${res.status} ${JSON.stringify(body).slice(0, 160)}` };
  }
  return { ok: true, id: body.data.id, url: `https://giphy.com/gifs/${body.data.id}` };
}

const main = async () => {
  const target = process.argv[2];
  if (!target) { console.error("usage: giphy-upload.mjs <manifest.json|file.gif> [--tags a,b] [--dry]"); process.exit(1); }

  let jobs;
  if (target.endsWith(".json")) {
    jobs = JSON.parse(await readFile(target, "utf8"));
  } else {
    const tags = (arg("--tags") ?? "").split(",").map(t => t.trim()).filter(Boolean);
    if (!tags.length) { console.error("--tags is required when uploading a single file"); process.exit(1); }
    jobs = [{ file: target, tags }];
  }

  console.log(`${DRY ? "DRY RUN — " : ""}${jobs.length} loop(s) -> @${USERNAME}\n`);
  const done = [];
  for (const j of jobs) {
    const size = (await readFile(j.file)).length;
    if (DRY) {
      console.log(`  ${basename(j.file).padEnd(20)} ${(size / 1048576).toFixed(2)}MB  ${j.tags.join(", ")}`);
      continue;
    }
    const r = await upload(j.file, j.tags);
    console.log(`  ${basename(j.file).padEnd(20)} ${r.ok ? r.url : "FAILED: " + r.error}`);
    if (r.ok) done.push({ ...j, id: r.id, url: r.url });
    // The beta key allows 100 calls an hour; a pause keeps a batch of seven far
    // inside that and avoids tripping any burst limit.
    await new Promise(r2 => setTimeout(r2, 1500));
  }

  if (done.length) {
    console.log(`\n${done.length} uploaded. They take a while to appear in Instagram's picker — that is GIPHY indexing, not a fault.`);
  }
};

main().catch((e) => { console.error(e); process.exit(1); });
