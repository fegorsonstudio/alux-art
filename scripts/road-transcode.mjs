// Turns a player's recorded road (uploaded in parts by the phone) into a
// playable mp4 for Bounty Run, with a poster frame and the road's length from
// its GPS track, then puts both in the template-images bucket (never purged).
//
//   cd /home/aluxart/app && node --env-file=.env.local scripts/road-transcode.mjs
//
// Cron runs it every minute, fenced (ffmpeg on one thread stays well under
// 600 MB; the VPS also runs the site):
//   * * * * * cd /home/aluxart/app && flock -n /tmp/aluxart-road.lock systemd-run --scope --quiet -p MemoryMax=1200M -p MemorySwapMax=0 nice -n 10 /usr/bin/node --env-file=.env.local scripts/road-transcode.mjs >> /home/aluxart/road-transcode.log 2>&1
//
// One road per run (status uploaded → processing → ready | failed). A road
// left in "processing" for over 30 minutes (a crash) is picked up again.
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import postgres from "postgres";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const sql = postgres(process.env.DATABASE_URL, { ssl: false, max: 2 });
const r2 = new S3Client({
  region: "auto", endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED",
});
const BUCKET = "template-images";
const DIR = process.env.ROAD_UPLOAD_DIR || "/home/aluxart/road-uploads";
const MAX_SECONDS = 185, MIN_SECONDS = 5;

const log = (...a) => console.log(new Date().toISOString(), ...a);

function run(cmd, args, timeoutS) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { err += d; if (err.length > 20000) err = err.slice(-20000); });
    const t = setTimeout(() => { p.kill("SIGKILL"); err += "\n[timed out]"; }, timeoutS * 1000);
    p.on("close", (code) => { clearTimeout(t); resolve({ code, out, err }); });
    p.on("error", (e) => { clearTimeout(t); resolve({ code: -1, out, err: String(e) }); });
  });
}

async function probe(file) {
  const r = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file], 60);
  if (r.code !== 0) throw new Error("ffprobe failed: " + r.err.slice(-300));
  const j = JSON.parse(r.out);
  const v = (j.streams || []).find((s) => s.codec_type === "video");
  if (!v) throw new Error("No video stream in the upload");
  const rot = Math.abs(Number((v.side_data_list || []).find((s) => s.rotation != null)?.rotation ?? v.tags?.rotate ?? 0)) % 180;
  const w = rot === 90 ? v.height : v.width, h = rot === 90 ? v.width : v.height;
  const duration = Number(j.format?.duration ?? v.duration ?? 0);
  return { width: w, height: h, duration };
}

const R = 6371008.8, rad = (d) => (d * Math.PI) / 180;
function hav(aLat, aLng, bLat, bLng) {
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
function trackLength(track) {
  if (!Array.isArray(track) || track.length < 2) return 0;
  let len = 0, last = null;
  for (const s of track) {
    if (last) {
      const dt = s[0] - last[0];
      if (dt <= 0) continue;
      const d = hav(last[1], last[2], s[1], s[2]);
      if (d / dt > 45) continue; // a GPS jump, not movement
      len += d;
    }
    last = s;
  }
  return len;
}

async function main() {
  await sql`UPDATE road_tracks SET status = 'uploaded' WHERE status = 'processing' AND updated_at < now() - interval '30 minutes'`;
  const [row] = await sql`
    UPDATE road_tracks SET status = 'processing', updated_at = now()
    WHERE id = (SELECT id FROM road_tracks WHERE status = 'uploaded' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
    RETURNING id, parts, track, duration_s`;
  if (!row) return;
  const dir = path.join(DIR, row.id);
  const raw = path.join(dir, "raw.bin"), out = path.join(dir, "road.mp4"), poster = path.join(dir, "poster.jpg");
  log("road", row.id, "parts", row.parts);
  try {
    // Join the parts into one file.
    const w = fs.createWriteStream(raw);
    for (let n = 0; n < row.parts; n++) {
      const part = path.join(dir, `part-${String(n).padStart(3, "0")}`);
      await new Promise((res, rej) => { const s = fs.createReadStream(part); s.on("error", rej); s.on("end", res); s.pipe(w, { end: false }); });
    }
    await new Promise((res) => w.end(res));
    const src = await probe(raw);
    if (!(src.duration >= MIN_SECONDS)) throw new Error(`The recording is too short (${src.duration.toFixed(1)} s)`);
    if (src.duration > MAX_SECONDS) throw new Error(`The recording is too long (${src.duration.toFixed(0)} s)`);

    // One thread, 30 fps, at most 1280 px on the long side, H.264 that every phone plays.
    const ff = await run("ffmpeg", [
      "-y", "-hide_banner", "-loglevel", "error", "-i", raw,
      "-vf", "scale='min(1280,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-profile:v", "main", "-pix_fmt", "yuv420p",
      "-movflags", "+faststart", "-an", "-threads", "1", out,
    ], 900);
    if (ff.code !== 0) throw new Error("ffmpeg failed: " + ff.err.slice(-400));
    const fin = await probe(out);
    const pj = await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-ss", "1", "-i", out, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "4", poster], 120);
    if (pj.code !== 0) throw new Error("poster failed: " + pj.err.slice(-300));

    const gps = trackLength(row.track);
    const length = gps >= 30 ? gps : Math.max(50, fin.duration * 8); // no usable GPS: assume a slow drive

    const videoKey = `roads/${row.id}/road.mp4`, posterKey = `roads/${row.id}/poster.jpg`;
    await r2.send(new PutObjectCommand({ Bucket: BUCKET, Key: videoKey, Body: fs.createReadStream(out), ContentType: "video/mp4", ContentLength: (await fsp.stat(out)).size }));
    await r2.send(new PutObjectCommand({ Bucket: BUCKET, Key: posterKey, Body: await fsp.readFile(poster), ContentType: "image/jpeg" }));
    await sql`UPDATE road_tracks SET status = 'ready', duration_s = ${fin.duration}, length_m = ${length}, width = ${fin.width}, height = ${fin.height},
      video_path = ${videoKey}, poster_path = ${posterKey}, error = NULL, updated_at = now() WHERE id = ${row.id}`;
    await fsp.rm(dir, { recursive: true, force: true });
    log("ready", row.id, `${fin.duration.toFixed(1)} s, ${Math.round(length)} m (gps ${Math.round(gps)} m), ${fin.width}x${fin.height}`);
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    log("failed", row.id, msg);
    await sql`UPDATE road_tracks SET status = 'failed', error = ${msg}, updated_at = now() WHERE id = ${row.id}`;
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((e) => { log("crash", e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => sql.end());
