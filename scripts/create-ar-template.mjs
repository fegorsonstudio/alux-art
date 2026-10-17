#!/usr/bin/env node
/**
 * Creates the AR balloon campaign as a marketplace template.
 *
 *   node --env-file=.env.local scripts/create-ar-template.mjs
 *
 * PRIVATE and PUBLISHED on purpose, like the loop: a private template can be
 * booked by its link but is not listed, so the owner can run a real booking
 * before anybody can stumble into it. scripts/publish-ar-template.mjs lists it.
 *
 * platform_fee_exempt is set because the book route refuses any price at or
 * below the platform fee otherwise, and this product has no creator payout.
 *
 * Re-running updates the existing row rather than making a second one.
 */
import postgres from "postgres";
import crypto from "node:crypto";

const sql = postgres(process.env.DATABASE_URL, { ssl: false, max: 2 });

const TITLE = "AR Balloon Campaign";
const DESCRIPTION =
  "Branded hot-air balloons in the sky over your shop, your event or your " +
  "street. Anyone who opens your link on their phone at that spot sees your " +
  "balloons drift past their own camera view, and can take a picture with " +
  "them. You get the link and a QR code the moment you pay; the campaign " +
  "runs for 30 days from the date you choose.";

// PLACEHOLDER. The owner sets the real price before publish-ar-template.mjs runs.
const PRICE_NGN = 50000;

const main = async () => {
  const [creator] = await sql`
    SELECT c.id FROM creators c
    JOIN profiles p ON p.id = c.user_id
    WHERE p.email = 'fegorsonphotography@gmail.com' LIMIT 1`
    .catch(() => []);
  const [fallback] = creator ? [] : await sql`SELECT id FROM creators ORDER BY created_at LIMIT 1`;
  const creatorId = (creator ?? fallback)?.id;
  if (!creatorId) { console.error("no creator row"); process.exit(1); }

  const [existing] = await sql`SELECT id FROM templates WHERE category = 'ar_experience' AND title = ${TITLE} LIMIT 1`;

  const id = existing?.id ?? crypto.randomUUID();
  if (existing) {
    await sql`UPDATE templates SET description = ${DESCRIPTION}, platform_fee_exempt = true, updated_at = NOW() WHERE id = ${id}`;
    console.log("updated existing template (price left as it is)");
  } else {
    await sql`INSERT INTO templates
      (id, creator_id, title, description, category, status, is_private, platform_fee_exempt,
       package_size, price_ngn, price_1_ngn, aspect_ratio, created_at, updated_at)
      VALUES (${id}, ${creatorId}, ${TITLE}, ${DESCRIPTION}, 'ar_experience', 'published', true, true,
              1, ${PRICE_NGN}, ${PRICE_NGN}, '9:16', NOW(), NOW())`;
    console.log("created template");
  }

  const [row] = await sql`SELECT id, title, category, status, is_private, platform_fee_exempt, price_1_ngn, package_size FROM templates WHERE id = ${id}`;
  console.log(row);
  console.log(`\nbooking link:\n  https://aluxartandframes.shop/marketplace/${id}`);
  await sql.end();
};

main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
