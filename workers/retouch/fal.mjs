// One paid fal.ai call for the Glow Retouch engine, under a daily spending cap.
//
//   node fal.mjs <endpoint> <est-usd> <out-file> <image> [mask] -- <json-input>
//
// Exit 0 = result written to <out-file>; anything else = no result (the reason is
// the last line printed). Every attempt is appended to the ledger at its estimate,
// failed ones included, so a run of retries cannot slip past the cap.
//
// The cap (RETOUCH_FAL_DAILY_USD, default $5 a UTC day) is a guard against a loop,
// not a budget: a photo costs about $0.09 at most (cut-out ~$0.006 plus two
// eraser calls at $0.04).
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire("/home/aluxart/app/package.json");
const { fal } = require("@fal-ai/client");

const argv = process.argv.slice(2);
const sep = argv.indexOf("--");
const [endpoint, estStr, out, image, mask] = argv.slice(0, sep < 0 ? argv.length : sep);
const extra = sep < 0 ? {} : JSON.parse(argv.slice(sep + 1).join(" ") || "{}");
const LEDGER = process.env.RETOUCH_FAL_LEDGER ?? "/root/retouch-worker/fal-ledger.jsonl";
const CAP = Number(process.env.RETOUCH_FAL_DAILY_USD ?? 5);
const est = Number(estStr);

fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
const today = new Date().toISOString().slice(0, 10);
const spent = (fs.existsSync(LEDGER) ? fs.readFileSync(LEDGER, "utf8").split("\n") : [])
  .map((l) => { try { return JSON.parse(l); } catch { return null; } })
  .filter((r) => r && typeof r.at === "string" && r.at.startsWith(today))
  .reduce((a, r) => a + (Number(r.est_usd) || 0), 0);
if (!(est > 0) || spent + est > CAP) {
  console.log(`REFUSED: today's retouch spend would reach $${(spent + est).toFixed(3)} (daily cap $${CAP})`);
  process.exit(2);
}

const record = (fields) => fs.appendFileSync(LEDGER,
  JSON.stringify({ at: new Date().toISOString(), endpoint, est_usd: est, ...fields }) + "\n");

fal.config({ credentials: process.env.FAL_KEY ?? process.env.FAL_API_KEY ?? "" });
const up = (p) => fal.storage.upload(new Blob([fs.readFileSync(p)], { type: p.endsWith(".png") ? "image/png" : "image/jpeg" }));
const giveUp = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error(`no reply in ${ms / 1000}s`)), ms));

try {
  const input = { image_url: await up(image), ...extra };
  if (mask) input.mask_url = await up(mask);
  const res = await Promise.race([fal.subscribe(endpoint, { input }), giveUp(180_000)]);
  const d = res?.data ?? res;
  const url = d?.image?.url ?? d?.images?.[0]?.url ?? d?.mask_image?.url;
  if (!url) throw new Error("no image in reply: " + JSON.stringify(d).slice(0, 300));
  const r = await fetch(url);
  if (!r.ok) throw new Error(`could not download the result (${r.status})`);
  fs.writeFileSync(out, Buffer.from(await r.arrayBuffer()));
  record({ ok: true });
  console.log(`PAID ${endpoint} est $${est} (today $${(spent + est).toFixed(3)})`);
  process.exit(0);
} catch (e) {
  record({ failed: String(e?.message ?? e).slice(0, 200) });
  console.log(`FAILED ${endpoint}: ${e?.status ?? ""} ${String(e?.message ?? e).slice(0, 300)}`);
  process.exit(1);
}
