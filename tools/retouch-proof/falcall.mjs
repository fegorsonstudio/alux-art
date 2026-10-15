// One paid fal.ai call, guarded. Owner approved up to $1 for the retouch proof (15 Oct 2026),
// one pass per photo, no repeats.
//   node --env-file=/home/aluxart/app/.env.local falcall.mjs <job-name> <endpoint> <est-usd> <image> [mask] -- <json-input>
// - A job that already has a result is NEVER called again (cached in /root/retouch-proof/fal-cache).
// - Every call is recorded in fal-ledger.json; a call that would take the estimate past $1 is refused.
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire("/home/aluxart/app/package.json");
const { fal } = require("@fal-ai/client");

const [job, endpoint, estStr, image, maybeMask, ...rest] = process.argv.slice(2);
const sep = [maybeMask, ...rest].indexOf("--");
const mask = sep === 0 ? null : maybeMask;
const extra = JSON.parse(([maybeMask, ...rest].slice(sep + 1).join(" ")) || "{}");
const CAP = 1.0, DIR = "/root/retouch-proof/fal-cache", LEDGER = "/root/retouch-proof/fal-ledger.json";
fs.mkdirSync(DIR, { recursive: true });
const out = `${DIR}/${job}.png`;
if (fs.existsSync(out)) { console.log(`CACHED ${job} -> ${out} (not paid again)`); process.exit(0); }

const ledger = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, "utf8")) : [];
const spent = ledger.reduce((a, r) => a + r.est_usd, 0);
const est = Number(estStr);
if (spent + est > CAP) { console.log(`REFUSED ${job}: estimate would reach $${(spent + est).toFixed(3)} (> $${CAP})`); process.exit(2); }

fal.config({ credentials: process.env.FAL_KEY ?? process.env.FAL_API_KEY ?? "" });
const up = async (p) => fal.storage.upload(new Blob([fs.readFileSync(p)], { type: p.endsWith(".png") ? "image/png" : "image/jpeg" }));
const input = { image_url: await up(image), ...extra };
if (mask) input.mask_url = await up(mask);
const t = Date.now();
try {
  const res = await fal.subscribe(endpoint, { input });
  const d = res?.data ?? res;
  const url = d?.image?.url ?? d?.images?.[0]?.url ?? d?.mask_image?.url;
  if (!url) throw new Error("no image in reply: " + JSON.stringify(d).slice(0, 300));
  fs.writeFileSync(out, Buffer.from(await (await fetch(url)).arrayBuffer()));
  const secs = Math.round((Date.now() - t) / 100) / 10;
  ledger.push({ job, endpoint, est_usd: est, secs, at: new Date().toISOString() });
  fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 1));
  console.log(`PAID ${job} via ${endpoint} in ${secs}s, est $${est} (total est $${(spent + est).toFixed(3)}) -> ${out}`);
} catch (e) {
  // A failed call is still recorded at its estimate, so a retry cannot slip past the cap.
  ledger.push({ job, endpoint, est_usd: est, failed: String(e?.message ?? e).slice(0, 200), at: new Date().toISOString() });
  fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 1));
  console.log(`FAILED ${job}: ${e?.status ?? ""} ${String(e?.message ?? e).slice(0, 200)} ${e?.body ? JSON.stringify(e.body).slice(0, 300) : ""}`);
  process.exit(1);
}
