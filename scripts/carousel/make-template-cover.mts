#!/usr/bin/env npx tsx
/**
 * The marketplace card for the Instagram GIF Maker.
 *
 *   npx tsx scripts/carousel/make-template-cover.mts
 *
 * NOT built with the product renderer, on purpose. The first attempt was: the
 * cover ran the same beats a buyer's loop runs, which demonstrated the output
 * honestly but made a poor card. A card is judged in a grid, at a glance, often
 * before it has finished loading — and the product layout shows ONE photograph
 * at a time, so the before/after idea, which is the entire proposition, was
 * invisible in any single frame. Anyone who did not wait for the animation saw
 * a picture of a woman and some words.
 *
 * So this card shows BOTH states at once and animates the change between them.
 * At rest it already says "this turns that into this"; in motion it proves it.
 *
 *   ┌────────────────┬────────────────┐
 *   │  BEFORE        │  AFTER         │   both visible in every frame
 *   ├────────────────┴────────────────┤
 *   │  MAKE AN                        │   what it is
 *   │  INSTAGRAM GIF                  │
 *   │  Two photos. Your words.        │   what you do
 *   └─────────────────────────────────┘
 *
 * THE SHAPE IS NOT A CHOICE. The marketplace card is 3:4 portrait and the image
 * is `object-fit: cover`, so anything wider is cropped to the middle and the
 * words are thrown away — which is exactly what happened to the 16:9 version of
 * this card: it looked right in a preview and shipped a grid tile with no
 * writing on it at all. Match the card, 900x1200, or the message does not
 * survive the page.
 *
 * The photographs are cropped to fill here, which the product itself never does.
 * That rule exists to protect a customer's picture; this is our own marketing
 * and a card with letterboxing down both sides wastes the only space it has.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import sharp from "sharp";
import { encodeGif, MINT, INK } from "../../lib/gif-loop";

const W = 900, H = 1200;
const BAND = 330;                            // the mint band along the bottom
const PHOTO_H = H - BAND;
const HALF = Math.round(W / 2);
const FPS = 12;

const FONT = "Outfit, 'Segoe UI', Roboto, Arial, sans-serif";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A small pill, so BEFORE and AFTER read against any part of a photograph. */
const pill = (text: string, x: number) => {
  const w = 22 + text.length * 14, h = 42, y = PHOTO_H - h - 20;
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${INK}" opacity="0.82"/>
    <text x="${x + w / 2}" y="${y + h / 2 + 8}" text-anchor="middle" font-family="${FONT}"
      font-size="22" font-weight="800" fill="${MINT}" letter-spacing="0.12em">${esc(text)}</text>`;
};

const overlay = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="${PHOTO_H}" width="${W}" height="${BAND}" fill="${MINT}"/>
  <!-- A hairline between the two states: without it they read as one wide photo. -->
  <rect x="${HALF - 2}" y="0" width="4" height="${PHOTO_H}" fill="${MINT}"/>
  ${pill("BEFORE", 22)}
  ${pill("AFTER", HALF + 22)}
  <text x="40" y="${PHOTO_H + 100}" font-family="${FONT}" font-size="84" font-weight="900"
    fill="${INK}" letter-spacing="-0.03em">MAKE AN</text>
  <text x="40" y="${PHOTO_H + 186}" font-family="${FONT}" font-size="84" font-weight="900"
    fill="${INK}" letter-spacing="-0.03em">INSTAGRAM GIF</text>
  <text x="42" y="${PHOTO_H + 256}" font-family="${FONT}" font-size="32" font-weight="700"
    fill="${INK}" opacity="0.72">Two photos. Your words. Ready to post.</text>
</svg>`);

const fill = (buf: Buffer) =>
  sharp(buf).rotate().resize({ width: HALF, height: PHOTO_H, fit: "cover", position: "centre" }).toBuffer();

async function main() {
  await mkdir("out", { recursive: true });
  const [beforeSrc, afterSrc] = await Promise.all([
    readFile("scripts/carousel/shots/lighting-power/before-1476.jpg"),
    readFile("scripts/carousel/shots/lighting-power/after-006-hard-spot-chiaroscuro.jpg"),
  ]);
  const before = await fill(beforeSrc);
  const after = await fill(afterSrc);

  /** One frame: before on the left, and whatever the right half is showing. */
  const frame = async (right: Buffer) =>
    sharp({ create: { width: W, height: H, channels: 3, background: INK } })
      .composite([
        { input: before, left: 0, top: 0 },
        { input: right, left: HALF, top: 0 },
        { input: overlay, left: 0, top: 0 },
      ])
      .png({ compressionLevel: 6 }).toBuffer();

  // The right half is the one that moves: it holds the after, slips back to the
  // before, and returns. The left half never changes, so there is always a
  // reference to compare against — which is what makes the change legible
  // rather than just a flicker.
  const frames: Buffer[] = [];
  const hold = Math.round(FPS * 1.1);
  const fade = Math.round(FPS * 0.35);

  const blend = async (from: Buffer, to: Buffer, t: number) => {
    const eased = t * t * (3 - 2 * t);
    const top = await sharp(to).ensureAlpha(eased).png().toBuffer();
    return sharp(from).composite([{ input: top }]).toBuffer();
  };

  for (let i = 0; i < hold; i++) frames.push(await frame(after));
  for (let i = 1; i <= fade; i++) frames.push(await frame(await blend(after, before, i / fade)));
  for (let i = 0; i < Math.round(FPS * 0.5); i++) frames.push(await frame(before));
  for (let i = 1; i <= fade; i++) frames.push(await frame(await blend(before, after, i / fade)));

  // 700 wide covers the card's 364 CSS px at 2x without paying for pixels the
  // grid will never show.
  const gif = await encodeGif(frames, FPS, 700);
  await writeFile("out/template-cover.gif", gif);
  await writeFile("out/template-cover-still.png", frames[0]);
  console.log(`cover ${frames.length} frames  ${(gif.length / 1048576).toFixed(2)} MB  ${W}x${H}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
