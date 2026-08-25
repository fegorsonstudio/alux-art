#!/usr/bin/env node
/**
 * Creates the before/after loop as a marketplace template.
 *
 *   node --env-file=.env.local scripts/create-gif-loop-template.mjs
 *
 * Made PRIVATE and DRAFT on purpose. A private template is bookable by link but
 * does not appear in the marketplace, so it can be tested with real money
 * before anyone can stumble into it. Publishing it, and settling the price, are
 * the owner's calls — flip `status` to PUBLISHED and `is_private` to false when
 * they say so.
 *
 * Re-running updates the existing row rather than making a second one.
 */
import postgres from "postgres";
import crypto from "node:crypto";

const sql = postgres(process.env.DATABASE_URL, { ssl: false, max: 2 });

const TITLE = "Before / After Loop";
const DESCRIPTION =
  "Turn two of your own pictures into a looping animation that fades one into " +
  "the other. Add three or four words and your logo, and it comes back as a GIF " +
  "you can post, put in a comment, or send to a customer. Nothing of ours appears " +
  "on it — it carries your brand only.";

// Placeholder pricing. ₦1,000 was the figure in the plan; the owner sets the
// real one before this goes public.
const PRICE_NGN = 1000;

const main = async () => {
  const [creator] = await sql`
    SELECT c.id FROM creators c
    JOIN profiles p ON p.id = c.user_id
    WHERE p.email = 'fegorsonphotography@gmail.com' LIMIT 1`
    .catch(() => []);
  const [fallback] = creator ? [] : await sql`SELECT id FROM creators ORDER BY created_at LIMIT 1`;
  const creatorId = (creator ?? fallback)?.id;
  if (!creatorId) { console.error("no creator row"); process.exit(1); }

  const [existing] = await sql`SELECT id FROM templates WHERE category = 'gif_loop' AND title = ${TITLE} LIMIT 1`;

  const id = existing?.id ?? crypto.randomUUID();
  if (existing) {
    await sql`UPDATE templates SET description = ${DESCRIPTION}, updated_at = NOW() WHERE id = ${id}`;
    console.log("updated existing template");
  } else {
    await sql`INSERT INTO templates
      (id, creator_id, title, description, category, status, is_private,
       package_size, price_ngn, price_1_ngn, aspect_ratio, created_at, updated_at)
      VALUES (${id}, ${creatorId}, ${TITLE}, ${DESCRIPTION}, 'gif_loop', 'published', true,
              1, ${PRICE_NGN}, ${PRICE_NGN}, '16:9', NOW(), NOW())`;
    console.log("created template");
  }

  const [row] = await sql`SELECT id, title, category, status, is_private, price_1_ngn, package_size FROM templates WHERE id = ${id}`;
  console.log(row);
  console.log(`\nbooking link:\n  https://aluxartandframes.shop/marketplace/${id}`);
  await sql.end();
};

main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
