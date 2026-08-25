#!/usr/bin/env npx tsx
/**
 * make-ar-gif.mts — the branded, 16:9, augmented-reality version of the
 * before/after loop.
 *
 *   npx tsx scripts/carousel/make-ar-gif.mts            # the whole studio set
 *   npx tsx scripts/carousel/make-ar-gif.mts --only 197
 *
 * The compositor lives in lib/gif-loop.ts so a customer's GIF from the
 * marketplace template and the studio's own come off exactly the same code.
 *
 * Captions carry one word in *asterisks*, which renders mint. They state a fact
 * and let the transformation be the proof — no price, no call to action. That
 * is the register of the reference video and of the carousel that did 25.7k
 * views; a price belongs in the post's caption, not burned into the asset.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { renderArFrames } from "../../lib/gif-loop";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { rm } from "node:fs/promises";

const run = promisify(execFile);

const SHOTS = "scripts/carousel/shots";
const OUT = "out/ar-gifs";
const SITE = "aluxartandframes.shop";

const arg = (n: string) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : undefined; };
const ONLY = arg("--only");

type Job = {
  id: string;
  before: string;
  after: string;
  headline: string;
  kicker: string;
};

const JOBS: Job[] = [
  {
    id: "197", before: `${SHOTS}/lighting-power/before-1476.jpg`,
    after: `${SHOTS}/lighting-power/after-197-night-paparazzi-g7x.jpg`,
    headline: "One light changed this", kicker: "Look 197 · shot on a phone",
  },
  {
    id: "069", before: `${SHOTS}/lighting-69/before-1428.jpg`,
    after: `${SHOTS}/lighting-69/after-69-hard-sunlight-high-key.jpg`,
    headline: "Your phone was fine", kicker: "Look 69 · you just had no light",
  },
  {
    id: "023", before: `${SHOTS}/lighting-power/before-1476.jpg`,
    after: `${SHOTS}/lighting-power/after-023-warm-haze-backlit-editorial.jpg`,
    headline: "A studio is not a room", kicker: "Look 23 · it is lights",
  },
  {
    id: "196", before: `${SHOTS}/lighting-power/before-1476.jpg`,
    after: `${SHOTS}/lighting-power/after-196-golden-rim-in-smoke.jpg`,
    headline: "No phone holds a light", kicker: "Look 196 · so we moved it",
  },
  {
    id: "065", before: `${SHOTS}/lighting-power/before-1476.jpg`,
    after: `${SHOTS}/lighting-power/after-065-hard-blue-chiaroscuro.jpg`,
    headline: "Snapshot or portrait", kicker: "Look 65 · one light apart",
  },
  {
    id: "006", before: `${SHOTS}/lighting-power/before-1476.jpg`,
    after: `${SHOTS}/lighting-power/after-006-hard-spot-chiaroscuro.jpg`,
    headline: "Shot on your own phone", kicker: "Look 6 · nothing else",
  },
  {
    id: "2022", before: `${SHOTS}/lighting-power/before-1496.jpg`,
    after: `${SHOTS}/lighting-power/after-1496-023-warm-haze-backlit-editorial.jpg`,
    headline: "Four years old", kicker: "iPhone 13 · shot in 2022",
  },
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const jobs = ONLY ? JOBS.filter(j => j.id === ONLY) : JOBS;
  if (!jobs.length) { console.error("no job matches --only", ONLY); process.exit(1); }

  for (const j of jobs) {
    if (!existsSync(j.before) || !existsSync(j.after)) {
      console.log(`  ${j.id}: source missing, skipped`);
      continue;
    }
    const { frames, fps } = await renderArFrames({
      before: await readFile(j.before),
      after: await readFile(j.after),
      headline: j.headline,
      kicker: j.kicker,
      endCard: SITE,          // studio set only; customer output passes none
    });

    // ffmpeg does the encoding here because it is installed locally and gives a
    // far better palette than anything else to hand. sharp composites the
    // frames but cannot WRITE an animated GIF on this version — checked, not
    // assumed — so the server fork will need its own encoder.
    const tmp = path.join(OUT, `.frames-${j.id}`);
    await rm(tmp, { recursive: true, force: true });
    await mkdir(tmp, { recursive: true });
    await Promise.all(frames.map((f, i) =>
      writeFile(path.join(tmp, `f${String(i).padStart(4, "0")}.png`), f)));

    const file = path.join(OUT, `ar-relight-${j.id}.gif`);
    const pal = path.join(tmp, "pal.png");
    await run("ffmpeg", ["-y", "-v", "error", "-framerate", String(fps),
      "-i", path.join(tmp, "f%04d.png"), "-vf", "palettegen=stats_mode=diff", pal]);
    await run("ffmpeg", ["-y", "-v", "error", "-framerate", String(fps),
      "-i", path.join(tmp, "f%04d.png"), "-i", pal,
      "-lavfi", "paletteuse=dither=sierra2_4a", "-loop", "0", file]);
    await rm(tmp, { recursive: true, force: true });

    const { size } = await import("node:fs").then(m => m.promises.stat(file));
    console.log(`  ${j.id.padEnd(5)} ${frames.length} frames  ${(size / 1048576).toFixed(2)} MB  ${file}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
