#!/usr/bin/env node
/**
 * Creates (or updates) the Character Sheet marketplace template.
 *
 *   node --env-file=.env.local scripts/create-character-sheet-template.mjs [price_ngn]
 *
 * The buyer uploads several photos of one person; lib/character-sheet-order.ts
 * turns them into one 16:9 sheet of five views on a grey studio backdrop.
 *
 * One sheet per order: price_1_ngn is the price, price_5_ngn is empty and
 * price_ngn (the 10-pack) is 0, so the checkout offers no package choice and
 * the booking route refuses 5 or 10. Published and public. The cover is drawn
 * here (no AI): the sheet's layout on grey, so the card shows what you get.
 *
 * Re-running updates the same row (found by category) and redraws the cover.
 */
import postgres from "postgres";
import crypto from "node:crypto";
import sharp from "sharp";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const sql = postgres(process.env.DATABASE_URL, { ssl: false, max: 2 });
const s3 = new S3Client({
  region: "auto", endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const TITLE = "Character Sheet";
const DESCRIPTION =
  "Send a few photos of one person and get back a professional character sheet: five views of them on a plain grey " +
  "studio backdrop — a front medium shot with both hands in frame, a full-length outfit view, a full-length back view, " +
  "a three-quarter close-up and a profile close-up. Same face, same outfit in every view. Upload as many photos as you " +
  "have — the face from the front, the face from the side, and the whole body — the more angles, the closer the likeness.";
const PRICE_NGN = Number.parseInt(process.argv[2] ?? "", 10) || 2000;

// ── The cover: the sheet's own layout, drawn as an outline on grey ───────────
function coverSvg() {
  const W = 1600, H = 2000; // 4:5, like the other cards
  const ink = "#e9e9ea", soft = "#b9babd", panel = "#6a6b6f", ground = "#58595d", gutter = "#3c3d40";
  // A 16:9 sheet centred in the card.
  const sx = 110, sw = W - 220, sh = Math.round(sw * 9 / 16), sy = 640;
  const g = 10, cw = (sw - 3 * g) / 4;
  const col = (i) => sx + i * (cw + g);
  const half = (sh - g) / 2;
  const rect = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${panel}"/>`;
  // Each panel clips its own figure, framed the way the real sheet frames it.
  const clips = [];
  const clip = (id, x, y, w, h) => { clips.push(`<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath>`); return `clip-path="url(#${id})"`; };
  const cap = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w / 2}" fill="${soft}"/>`;
  // A plain standing figure `h` tall from the top of the head: head, torso,
  // arms hanging with the hands showing, legs.
  const figure = (cx, top, h) => {
    const r = h * 0.062, neckY = top + r * 2.1;
    const tw = h * 0.2, th = h * 0.34, aw = h * 0.05, ah = h * 0.32, lw = h * 0.078, lh = h * 0.46;
    return [
      `<circle cx="${cx}" cy="${top + r}" r="${r}" fill="${soft}"/>`,
      cap(cx - tw / 2, neckY, tw, th),
      cap(cx - tw / 2 - aw - h * 0.012, neckY + h * 0.02, aw, ah),
      cap(cx + tw / 2 + h * 0.012, neckY + h * 0.02, aw, ah),
      `<circle cx="${cx - tw / 2 - aw / 2 - h * 0.012}" cy="${neckY + h * 0.02 + ah + aw * 0.3}" r="${aw * 0.62}" fill="${soft}"/>`,
      `<circle cx="${cx + tw / 2 + aw / 2 + h * 0.012}" cy="${neckY + h * 0.02 + ah + aw * 0.3}" r="${aw * 0.62}" fill="${soft}"/>`,
      cap(cx - lw - h * 0.006, neckY + th - lw, lw, lh),
      cap(cx + h * 0.006, neckY + th - lw, lw, lh),
    ].join("");
  };
  // Head and shoulders for the close-ups; `side` turns it into a profile.
  const bust = (cx, top, h, side = false) => {
    const r = h * 0.27;
    const head = side
      ? `<ellipse cx="${cx}" cy="${top + r * 1.15}" rx="${r * 0.86}" ry="${r}" fill="${soft}"/><circle cx="${cx - r * 0.88}" cy="${top + r * 1.25}" r="${r * 0.16}" fill="${soft}"/>`
      : `<ellipse cx="${cx}" cy="${top + r * 1.15}" rx="${r * 0.82}" ry="${r}" fill="${soft}"/>`;
    return `${head}<rect x="${cx - r * 1.9}" y="${top + r * 2.35}" width="${r * 3.8}" height="${h}" rx="${r * 0.9}" fill="${soft}"/>`;
  };
  const label = (x, y, text) =>
    `<text x="${x}" y="${y}" font-family="Outfit, DejaVu Sans, sans-serif" font-size="30" font-weight="500" fill="${ink}" text-anchor="middle" letter-spacing="1">${text}</text>`;
  const fullH = sh * 0.9;
  const panels = [
    // Medium: head to mid-thigh, so the hands are well inside the frame.
    `<g ${clip("p1", col(0), sy, cw, sh)}>${figure(col(0) + cw / 2, sy + sh * 0.06, sh * 1.25)}</g>`,
    // Outfit: the head sits above the top edge; chin to shoes.
    `<g ${clip("p2", col(1), sy, cw, sh)}>${figure(col(1) + cw / 2, sy - sh * 0.15, sh * 1.06)}</g>`,
    // Back: the whole figure.
    `<g ${clip("p3", col(2), sy, cw, sh)}>${figure(col(2) + cw / 2, sy + (sh - fullH) / 2, fullH)}</g>`,
    `<g ${clip("p4", col(3), sy, cw, half)}>${bust(col(3) + cw / 2, sy + half * 0.16, half)}</g>`,
    `<g ${clip("p5", col(3), sy + half + g, cw, half)}>${bust(col(3) + cw / 2, sy + half + g + half * 0.16, half, true)}</g>`,
  ].join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${clips.join("")}</defs>
  <rect width="${W}" height="${H}" fill="${ground}"/>
  <text x="${W / 2}" y="300" font-family="Outfit, DejaVu Sans, sans-serif" font-size="128" font-weight="600" fill="${ink}" text-anchor="middle">Character Sheet</text>
  <text x="${W / 2}" y="400" font-family="Outfit, DejaVu Sans, sans-serif" font-size="48" font-weight="400" fill="${soft}" text-anchor="middle">Five views of you, on grey</text>
  <rect x="${sx - g}" y="${sy - g}" width="${sw + 2 * g}" height="${sh + 2 * g}" fill="${gutter}"/>
  ${rect(col(0), sy, cw, sh)}${rect(col(1), sy, cw, sh)}${rect(col(2), sy, cw, sh)}
  ${rect(col(3), sy, cw, half)}${rect(col(3), sy + half + g, cw, half)}
  ${panels}
  ${label(col(0) + cw / 2, sy + sh + 70, "Medium")}
  ${label(col(1) + cw / 2, sy + sh + 70, "Outfit")}
  ${label(col(2) + cw / 2, sy + sh + 70, "Back")}
  ${label(col(3) + cw / 2, sy + sh + 70, "Close-ups")}
  <text x="${W / 2}" y="${H - 230}" font-family="Outfit, DejaVu Sans, sans-serif" font-size="44" font-weight="400" fill="${soft}" text-anchor="middle">Upload several photos of one person</text>
  <text x="${W / 2}" y="${H - 160}" font-family="Outfit, DejaVu Sans, sans-serif" font-size="44" font-weight="400" fill="${soft}" text-anchor="middle">Same face. Same outfit. Every view.</text>
</svg>`;
}

const main = async () => {
  const [creator] = await sql`
    SELECT c.id FROM creators c JOIN profiles p ON p.id = c.user_id
    WHERE p.email = 'fegorsonphotography@gmail.com' LIMIT 1`;
  if (!creator) { console.error("no creator row for the studio"); process.exit(1); }

  const cover = await sharp(Buffer.from(coverSvg())).jpeg({ quality: 90 }).toBuffer();
  const coverPath = `character-sheet/cover-${crypto.randomUUID().slice(0, 8)}.jpg`;
  await s3.send(new PutObjectCommand({ Bucket: "template-images", Key: coverPath, Body: cover, ContentType: "image/jpeg" }));
  console.log(`cover uploaded  template-images/${coverPath}  ${(cover.length / 1024).toFixed(0)} KB`);

  const [existing] = await sql`SELECT id FROM templates WHERE category = 'character_sheet' ORDER BY created_at LIMIT 1`;
  const id = existing?.id ?? crypto.randomUUID();
  if (existing) {
    await sql`UPDATE templates SET title = ${TITLE}, description = ${DESCRIPTION},
        price_1_ngn = ${PRICE_NGN}, price_5_ngn = NULL, price_ngn = 0, package_size = 1, aspect_ratio = '16:9',
        status = 'published', is_private = false, marketplace_hidden = false, platform_fee_exempt = true,
        cover_bucket = 'template-images', cover_storage_path = ${coverPath}, updated_at = NOW()
      WHERE id = ${id}`;
    console.log("updated the existing template");
  } else {
    await sql`INSERT INTO templates
        (id, creator_id, title, description, category, status, is_private, marketplace_hidden, platform_fee_exempt,
         package_size, price_ngn, price_1_ngn, price_5_ngn, aspect_ratio, cover_bucket, cover_storage_path, created_at, updated_at)
      VALUES (${id}, ${creator.id}, ${TITLE}, ${DESCRIPTION}, 'character_sheet', 'published', false, false, true,
              1, 0, ${PRICE_NGN}, NULL, '16:9', 'template-images', ${coverPath}, NOW(), NOW())`;
    console.log("created the template");
  }

  const [row] = await sql`SELECT id, title, category, status, is_private, marketplace_hidden, package_size,
      price_ngn, price_1_ngn, price_5_ngn, aspect_ratio, platform_fee_exempt, cover_storage_path FROM templates WHERE id = ${id}`;
  console.log(row);
  console.log(`\nbook it at  https://aluxartandframes.shop/marketplace/${id}`);
  await sql.end();
};

main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
