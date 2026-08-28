#!/usr/bin/env npx tsx
/**
 * The studio's own loops, rebuilt as beat sequences.
 *
 *   npx tsx scripts/carousel/make-beat-gifs.mts
 *   npx tsx scripts/carousel/make-beat-gifs.mts --only 197
 *
 * Replaces make-ar-gif.mts, which produced the single-headline version. Those
 * were held for four seconds on one line and people could not tell what was
 * being sold; these make an argument and cut fast.
 *
 * Every sequence has the same spine: say the offer, remove the two objections a
 * viewer is already forming ("that's a different room" / "that's a different
 * outfit"), then name the one thing that did change on the beat where the
 * picture changes. The address closes it.
 *
 * No price and no call to action in the asset. That is the register of the
 * carousel that did 25.7k views: state a fact and let the transformation be the
 * proof. A price belongs in the caption of the post.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { renderArFrames, encodeGif } from "../../lib/gif-loop";

const SHOTS = "scripts/carousel/shots";
const OUT = "out/beat-gifs";
const SITE = "aluxartandframes.shop";

const arg = (n: string) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : undefined; };
const ONLY = arg("--only");

type Job = {
  id: string;
  look: string;          // the look number, for the tag
  before: string;
  after: string;
  lines: string[];
  tags: string[];        // beyond the brand tags every one gets
};

const JOBS: Job[] = [
  {
    id: "197", look: "197",
    before: `${SHOTS}/lighting-power/before-1476.jpg`,
    after: `${SHOTS}/lighting-power/after-197-night-paparazzi-g7x.jpg`,
    lines: ["Relight your phone photos", "Same room", "Same phone", "One light moved"],
    tags: ["night", "flash"],
  },
  {
    id: "069", look: "69",
    before: `${SHOTS}/lighting-69/before-1428.jpg`,
    after: `${SHOTS}/lighting-69/after-69-hard-sunlight-high-key.jpg`,
    lines: ["Your phone was fine", "Same camera", "Same day", "You just had no light"],
    tags: ["sunlight", "highkey"],
  },
  {
    id: "023", look: "23",
    before: `${SHOTS}/lighting-power/before-1476.jpg`,
    after: `${SHOTS}/lighting-power/after-023-warm-haze-backlit-editorial.jpg`,
    lines: ["A studio is not a room", "Same wall", "Same outfit", "It is lights on purpose"],
    tags: ["editorial", "backlit"],
  },
  {
    id: "196", look: "196",
    before: `${SHOTS}/lighting-power/before-1476.jpg`,
    after: `${SHOTS}/lighting-power/after-196-golden-rim-in-smoke.jpg`,
    lines: ["No phone holds a light", "Same room", "Same outfit", "So we moved the light"],
    tags: ["goldenhour", "rimlight"],
  },
  {
    id: "065", look: "65",
    before: `${SHOTS}/lighting-power/before-1476.jpg`,
    after: `${SHOTS}/lighting-power/after-065-hard-blue-chiaroscuro.jpg`,
    lines: ["Snapshot or portrait", "Same room", "Same phone", "One light apart"],
    tags: ["blue", "chiaroscuro"],
  },
  {
    id: "006", look: "6",
    before: `${SHOTS}/lighting-power/before-1476.jpg`,
    after: `${SHOTS}/lighting-power/after-006-hard-spot-chiaroscuro.jpg`,
    lines: ["Shot on your own phone", "Nothing added", "Nothing replaced", "Only the light"],
    tags: ["spotlight", "moody"],
  },
  {
    // Its own tag, not 23: it uses look 23 but it is a different loop and
    // sharing a tag would make both come back for either search.
    id: "2022", look: "2022",
    before: `${SHOTS}/lighting-power/before-1496.jpg`,
    after: `${SHOTS}/lighting-power/after-1496-023-warm-haze-backlit-editorial.jpg`,
    lines: ["Shot in 2022", "On an iPhone 13", "Same photo", "New light"],
    tags: ["oldphoto", "iphone"],
  },
];

/**
 * The tags every loop carries.
 *
 * The first two are the point: searching "aluxart" in Instagram's GIF picker
 * has to return all of them, and the previous upload was tagged #photography
 * and #selfie, which return several million GIFs and none of ours. The third is
 * unique per loop so one specific look can be pulled up by name.
 */
const brandTags = (look: string) => ["aluxart", "aluxartandframes", `aluxart${look}`];

async function main() {
  await mkdir(OUT, { recursive: true });
  const jobs = ONLY ? JOBS.filter(j => j.id === ONLY) : JOBS;
  if (!jobs.length) { console.error("no job matches --only", ONLY); process.exit(1); }

  const manifest: Array<{ file: string; tags: string[]; lines: string[] }> = [];

  for (const j of jobs) {
    if (!existsSync(j.before) || !existsSync(j.after)) {
      console.log(`  ${j.id}: source missing, skipped`);
      continue;
    }
    const { frames, fps } = await renderArFrames({
      before: await readFile(j.before),
      after: await readFile(j.after),
      beats: [...j.lines.map(text => ({ text })), { text: SITE }],
      ratio: "16:9",
      width: 1280,
    });
    const gif = await encodeGif(frames, fps, 960);
    const file = path.join(OUT, `aluxart-${j.id}.gif`);
    await writeFile(file, gif);

    const tags = [...brandTags(j.look), ...j.tags, "relight", "beforeandafter"];
    manifest.push({ file, tags, lines: j.lines });
    console.log(`  ${j.id.padEnd(5)} ${frames.length} frames  ${(gif.length / 1048576).toFixed(2)} MB  ${tags.slice(0, 3).join(", ")}`);
  }

  // Written out so the uploader does not have to re-derive any of this.
  await writeFile(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`\n${manifest.length} loops -> ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
