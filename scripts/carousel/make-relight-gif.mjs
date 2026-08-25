#!/usr/bin/env node
/**
 * make-relight-gif.mjs — a looping before/after GIF from a real relight.
 *
 *   node scripts/carousel/make-relight-gif.mjs \
 *     --before path/to/before.jpg --after path/to/after.jpg \
 *     --out out/relight.gif [--width 540] [--fps 20]
 *
 * Not a generated animation. The frames are the buyer's own photograph and the
 * file the studio sent back, so what plays is the product doing its actual job.
 * That is also why it is free: no model runs, nothing is invented.
 *
 * The motion is deliberately minimal — hold, dissolve, hold, dissolve back.
 * Nothing pans, nothing zooms, no text flies in. A locked camera with one thing
 * changing is what the look itself does, and it is what reads as expensive
 * rather than as a banner ad.
 *
 * Ends exactly where it began so the loop has no visible seam, which is what
 * separates this from most GIFs.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const run = promisify(execFile);
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };

const BEFORE = arg("--before");
const AFTER  = arg("--after");
const OUT    = arg("--out", "out/relight.gif");
const WIDTH  = Number(arg("--width", "540"));
const FPS    = Number(arg("--fps", "20"));

if (!BEFORE || !AFTER) {
  console.error("usage: --before <file> --after <file> [--out file] [--width 540] [--fps 20]");
  process.exit(2);
}

// Timing, in frames at FPS. Holds are long enough to read the picture; the
// dissolve is slow enough to feel deliberate rather than like a glitch.
const HOLD_BEFORE = Math.round(FPS * 0.9);
const DISSOLVE    = Math.round(FPS * 0.8);
const HOLD_AFTER  = Math.round(FPS * 1.4);   // the payoff gets the longest look
const DISSOLVE_BACK = Math.round(FPS * 0.5);

const TMP = path.join(path.dirname(OUT), ".gif-frames");

/**
 * Same crop and size for both, or the dissolve reads as a jump cut.
 *
 * Both are forced to one explicit height rather than each keeping its own
 * ratio: a phone original and a 4K render are rarely the same shape to the
 * pixel, and sharp refuses to composite images that differ even by one.
 */
// Taken from the BEFORE image rather than assumed, so any pair works and the
// original's shape is what survives — the after is the thing being fitted to it.
let HEIGHT = 0;
async function setShape(file) {
  const m = await sharp(file).metadata();
  HEIGHT = Math.round((WIDTH / (m.width ?? 1)) * (m.height ?? 1));
}

async function normalise(file) {
  return sharp(file).rotate()
    // Centre, never "attention": that picks the most salient region per image,
    // so the two frames crop differently and the dissolve reads as a jump cut
    // instead of the light changing on a locked-off camera.
    .resize({ width: WIDTH, height: HEIGHT, fit: "cover", position: "centre" })
    .toBuffer();
}

async function main() {
  for (const f of [BEFORE, AFTER]) {
    if (!existsSync(f)) { console.error("missing:", f); process.exit(1); }
  }

  await rm(TMP, { recursive: true, force: true });
  await mkdir(TMP, { recursive: true });
  await mkdir(path.dirname(OUT), { recursive: true });

  await setShape(BEFORE);
  const before = await normalise(BEFORE);
  const after  = await normalise(AFTER);

  let n = 0;
  const write = async (buf) => {
    await writeFile(path.join(TMP, `f${String(n++).padStart(4, "0")}.png`), buf);
  };

  // Hold on the original.
  for (let i = 0; i < HOLD_BEFORE; i++) await write(before);

  // Dissolve in. Eased rather than linear: a straight cross-fade looks like a
  // slideshow transition, an eased one looks like light arriving.
  for (let i = 1; i <= DISSOLVE; i++) {
    const t = i / DISSOLVE;
    const eased = t * t * (3 - 2 * t);           // smoothstep
    const frame = await sharp(before)
      .composite([{ input: after, blend: "over", opacity: eased }])
      .png().toBuffer();
    await write(frame);
  }

  for (let i = 0; i < HOLD_AFTER; i++) await write(after);

  // And back, faster, so the loop closes without drawing attention to itself.
  for (let i = 1; i <= DISSOLVE_BACK; i++) {
    const t = i / DISSOLVE_BACK;
    const eased = t * t * (3 - 2 * t);
    const frame = await sharp(after)
      .composite([{ input: before, blend: "over", opacity: eased }])
      .png().toBuffer();
    await write(frame);
  }

  console.log(`frames: ${n} (${(n / FPS).toFixed(1)}s at ${FPS}fps)`);

  // A generated palette rather than the default 216-colour web palette: skin
  // tones and a dark amber background band badly without one.
  const palette = path.join(TMP, "palette.png");
  await run("ffmpeg", ["-y", "-v", "error", "-framerate", String(FPS),
    "-i", path.join(TMP, "f%04d.png"),
    "-vf", "palettegen=stats_mode=diff", palette]);

  await run("ffmpeg", ["-y", "-v", "error", "-framerate", String(FPS),
    "-i", path.join(TMP, "f%04d.png"), "-i", palette,
    "-lavfi", "paletteuse=dither=sierra2_4a", "-loop", "0", OUT]);

  await rm(TMP, { recursive: true, force: true });

  const mb = statSync(OUT).size / 1048576;
  console.log(`written: ${OUT}  ${mb.toFixed(2)} MB`);
  if (mb > 5) console.log("over 5MB — rerun with a smaller --width or lower --fps");
}

main().catch((e) => { console.error(e.message); process.exit(1); });
