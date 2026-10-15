// Glow Retouch worker for the studio computer.
//
// Asks the website for the next Glow Retouch photo, retouches it with the installed
// Fegorson Studio using the owner's own preset (read fresh from Fegorson Studio's library
// for every photo, so changing the preset in the app changes what customers get), and
// sends the finished file back. The website then delivers it in the customer's chat.
//
// Start it with "Start Glow Retouch worker.cmd". Leave the window open; close it to stop.
//   node worker.mjs          keep working until the window is closed
//   node worker.mjs --once   one photo (or none), then stop
//
// Fegorson Studio runs in its hands-off test mode: its own trial, settings and exports
// stay in a temporary folder that is deleted after every photo, so the owner's library,
// recipes and licence are only read, never changed. The customer's photo is deleted from
// this computer as soon as the result is sent (or the photo is handed to a person).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(fs.readFileSync(path.join(HERE, "config.json"), "utf8"));
const EXE = path.join(process.env.LOCALAPPDATA, "Programs", "Fegorson Studio", "Fegorson Studio.exe");
const LIBRARY = path.join(process.env.APPDATA, "Fegorson Studio", "library.json");
const ONCE = process.argv.includes("--once");
const AUTH = { Authorization: `Bearer ${cfg.token}` };
const RENDER_LIMIT_MS = 8 * 60_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toLocaleTimeString(), ...a);
class Fatal extends Error {}

function presetValues(name) {
  const lib = JSON.parse(fs.readFileSync(LIBRARY, "utf8"));
  const p = (lib.userPresets || []).find((x) => x.name.toLowerCase() === String(name).toLowerCase());
  if (!p) throw new Error(`the preset "${name}" is not in Fegorson Studio`);
  return p.values;
}

/**
 * The settings for one photo: the owner's preset, with the retouch director's choices on top
 * (workers/retouch/director.py). "max" sliders raise the preset and never lower it, "set"
 * sliders replace it (body shaping, face light, the checker's corrections), and every slider
 * stays inside the house "caps" (armpit at most 40, even if the preset says 100). The
 * director's Remove-brush strokes (spots, stray hairs, the lace line) come with it.
 * A job without a recipe is the preset as it is.
 */
function finalParams(job) {
  const p = { ...presetValues(job.preset) };
  const r = job.recipe || {};
  for (const [k, v] of Object.entries(r.max || {})) p[k] = Math.max(Number(p[k] ?? 0), Number(v));
  for (const [k, v] of Object.entries(r.set || {})) p[k] = Number(v);
  for (const [k, lim] of Object.entries(r.caps || {})) {
    if (typeof p[k] === "number" && Array.isArray(lim)) p[k] = Math.max(lim[0], Math.min(lim[1], p[k]));
  }
  if (Array.isArray(r.healStrokes) && r.healStrokes.length) p.healStrokes = r.healStrokes.slice(0, 200);
  return p;
}

async function render(job, work) {
  const safeName = job.fileName.replace(/[^\w.\-]/g, "_");
  fs.mkdirSync(path.join(work, "in"), { recursive: true });
  const local = path.join(work, "in", safeName);
  if (job.localFile) {
    fs.copyFileSync(job.localFile, local);
  } else {
    const res = await fetch(job.originalUrl);
    if (!res.ok) throw new Error(`could not download the photo (${res.status})`);
    fs.writeFileSync(local, Buffer.from(await res.arrayBuffer()));
  }
  const config = path.join(work, "config.json");
  fs.writeFileSync(config, JSON.stringify({
    outDir: work, portraits: [], soak: 0, raw: null, backdropReal: null, heic: [], probe: local,
    probeSpec: { sets: [{ name: "glow", params: finalParams(job), cropsOnly: true, full: true }] },
  }));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;   // set by some editors; it would start the app as plain Node
  const args = [`--selftest=${config}`];
  if (process.env.GLOW_NO_SANDBOX === "1") args.push("--no-sandbox");   // only for restricted test shells
  await new Promise((resolve, reject) => {
    const child = spawn(EXE, args, { cwd: path.dirname(EXE), stdio: "ignore", env });
    const timer = setTimeout(() => { child.kill(); reject(new Error("Fegorson Studio took longer than 8 minutes")); }, RENDER_LIMIT_MS);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
    child.on("error", (e) => { clearTimeout(timer); reject(new Error(`could not start Fegorson Studio: ${e.message}`)); });
  });
  const reportFile = path.join(work, "report.json");
  const report = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile, "utf8")) : null;
  if (report?.error) throw new Error(`Fegorson Studio: ${String(report.error).split("\n")[0].slice(0, 200)}`);
  const exp = path.join(work, "exports");
  const out = fs.existsSync(exp) ? fs.readdirSync(exp).find((f) => f.endsWith("-probe-glow.jpg")) : null;
  if (!out) throw new Error("Fegorson Studio finished without a picture");
  return fs.readFileSync(path.join(exp, out));
}

async function post(url, init, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, init);
      if (r.status >= 500 && i < tries) throw new Error(`server ${r.status}`);
      return r;
    } catch (e) {
      if (i >= tries) throw e;
      await sleep(5000 * i);
    }
  }
}

async function once() {
  const r = await fetch(`${cfg.server}/api/retouch-worker/next`, { headers: AUTH });
  if (r.status === 401) throw new Fatal("the website refused this computer's key (config.json)");
  if (!r.ok) throw new Error(`the website answered ${r.status}`);
  const { job } = await r.json();
  if (!job) return false;
  log(`Photo ${job.slot} of ${job.total}, order ${job.shootId.slice(0, 8)}, preset "${job.preset}"`);
  const work = path.join(os.tmpdir(), "glow-retouch-worker", job.imageId);
  fs.rmSync(work, { recursive: true, force: true });
  const t0 = Date.now();
  try {
    const file = await render(job, work);
    const up = await post(`${cfg.server}/api/retouch-worker/result?imageId=${job.imageId}`, {
      method: "POST", body: file,
      headers: { ...AUTH, "Content-Type": "image/jpeg", "x-engine": `fegorson-studio/${job.preset}` },
    });
    const j = await up.json().catch(() => ({}));
    if (!up.ok) throw new Error(j.error || `the website refused the result (${up.status})`);
    log(`  Retouched in ${Math.round((Date.now() - t0) / 1000)} s, ${(file.byteLength / 1e6).toFixed(1)} MB sent. The customer will get it in the chat.`);
  } catch (e) {
    log(`  Could not retouch it: ${e.message}. Sent to you on Telegram instead.`);
    await post(`${cfg.server}/api/retouch-worker/fail?imageId=${job.imageId}`, {
      method: "POST", headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: e.message }),
    }).catch(() => {});
  } finally {
    fs.rmSync(work, { recursive: true, force: true });   // the customer's photo never stays here
  }
  return true;
}

process.title = "Glow Retouch worker";
if (!fs.existsSync(EXE)) { console.log(`Fegorson Studio is not installed at ${EXE}`); process.exit(1); }

// Test mode, no website: node worker.mjs --render <photo> <recipe.json> <out.jpg>
if (process.argv.includes("--render")) {
  const [photo, recipeFile, outFile] = process.argv.slice(process.argv.indexOf("--render") + 1);
  const job = { imageId: "test-" + Date.now(), preset: "Hanna", fileName: path.basename(photo), localFile: photo,
                recipe: recipeFile && fs.existsSync(recipeFile) ? JSON.parse(fs.readFileSync(recipeFile, "utf8")) : null };
  const work = path.join(os.tmpdir(), "glow-retouch-worker", job.imageId);
  const t0 = Date.now();
  try {
    fs.writeFileSync(outFile, await render(job, work));
    console.log(JSON.stringify({ ok: true, secs: Math.round((Date.now() - t0) / 1000), out: outFile, params: finalParams(job) }));
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
  process.exit(0);
}

log("Glow Retouch worker started. Leave this window open; close it to stop.");
for (;;) {
  try {
    const had = await once();
    if (ONCE) break;
    if (!had) await sleep(15_000);
  } catch (e) {
    log(`Problem: ${e.message}`);
    if (e instanceof Fatal || ONCE) process.exit(1);
    await sleep(30_000);
  }
}
