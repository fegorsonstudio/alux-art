/**
 * Loads the written carousel plan into carousel_posts, for the website studio
 * (/admin/carousel).
 *
 *   node --env-file=.env.local scripts/carousel-seed.mjs [--dry-run]
 *
 * The words live in tools/carousel — 88 main posts on fixed dates from 5
 * October, and the 44 Photo Wahala episodes. The episodes go in hidden and
 * undated: the studio's "Load the experiment" button shows them and dates them
 * from a Monday the owner picks.
 *
 * Safe to run again after the plan files change. It refreshes the plan's
 * words only on posts the owner has not edited, approved or scheduled, and it
 * never touches photographs, story pictures, approvals, hand-set dates, or
 * whether the experiment is showing.
 */
import postgres from "postgres";
import { PLAN } from "../tools/carousel/plan.mjs";
import { PLAN2 } from "../tools/carousel/plan-newyear.mjs";
import { PLAN3, BATCH as EXPERIMENT } from "../tools/carousel/plan-microdrama.mjs";
import { GIF_SCRIPTS } from "../tools/carousel/gif-scripts.mjs";
import { storyboardFor } from "../tools/carousel/storyboard.mjs";

const DRY = process.argv.includes("--dry-run");

/**
 * Week 1 of the main plan. Its Christmas, New Year, Valentine's and Mothering
 * Sunday posts were written for the exact days they land on from here.
 */
const MAIN_PLAN_START = "2026-10-05";
const MAIN_HOUR = 19;

const url = process.env.DATABASE_URL;
const sql = postgres(url, {
  ssl: url?.includes("localhost") || url?.includes("127.0.0.1") ? false : { rejectUnauthorized: false },
});

/**
 * Monday + week + slot (A-D = Mon, Wed, Fri, Sun) at a Lagos hour. Built with
 * an explicit +01:00: the server runs on UTC, and plan.mjs's scheduleFor uses
 * the local clock, which there would post every one an hour late.
 */
function planDate(startMonday, week, slot, hour) {
  const dayOffset = { A: 0, B: 2, C: 4, D: 6 }[slot] ?? 0;
  const d = new Date(`${startMonday}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (week - 1) * 7 + dayOffset);
  return new Date(`${d.toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}:00:00+01:00`);
}

async function main() {
  const posts = [...PLAN, ...PLAN2, ...PLAN3];
  const existing = new Set((await sql`SELECT local_id FROM carousel_posts`).map((r) => r.local_id));
  let added = 0, refreshed = 0;

  for (const p of posts) {
    const id = `plan-${p.id}`;
    const episode = p.batch === EXPERIMENT;
    const storyboard = storyboardFor(id);
    const row = {
      id,
      batch: p.batch ?? "main",
      title: `${p.id.toUpperCase()} ${p.title}`,
      cards: p.cards.map((c) => ({ eyebrow: c.eyebrow ?? "", headline: c.headline ?? "", body: c.body ?? "" })),
      caption: p.caption,
      gifLines: GIF_SCRIPTS[p.id] ?? [],
      storyboard,
      scenePaths: storyboard ? storyboard.scenes.map(() => null) : [],
      // Episodes wait, undated, for the owner to load the experiment.
      when: episode ? null : planDate(MAIN_PLAN_START, p.week, p.slot, MAIN_HOUR),
      hour: p.hour ?? MAIN_HOUR,
    };
    if (existing.has(id)) refreshed++; else added++;
    if (DRY) continue;

    await sql`
      INSERT INTO carousel_posts (
        local_id, batch, title, product, trigger_word, week, slot, post_hour, photos_hint,
        cards, caption, storyboard, gif_lines, scene_paths, scheduled_for, hidden)
      VALUES (
        ${row.id}, ${row.batch}, ${row.title}, ${p.product ?? null}, ${p.trigger ?? null},
        ${p.week}, ${p.slot}, ${row.hour}, ${p.photos ?? null},
        ${sql.json(row.cards)}, ${row.caption}, ${row.storyboard ? sql.json(row.storyboard) : null},
        ${sql.json(row.gifLines)}, ${sql.json(row.scenePaths)}, ${row.when}, ${episode})
      ON CONFLICT (local_id) DO UPDATE SET
        batch = EXCLUDED.batch, product = EXCLUDED.product, trigger_word = EXCLUDED.trigger_word,
        week = EXCLUDED.week, slot = EXCLUDED.slot, post_hour = EXCLUDED.post_hour,
        photos_hint = EXCLUDED.photos_hint, storyboard = EXCLUDED.storyboard,
        -- The plan's words, unless the owner has changed them, or approved
        -- or scheduled what is there: approval is of those exact words.
        title = CASE WHEN carousel_posts.words_edited OR carousel_posts.status IN ('approved', 'scheduled')
                     THEN carousel_posts.title ELSE EXCLUDED.title END,
        cards = CASE WHEN carousel_posts.words_edited OR carousel_posts.status IN ('approved', 'scheduled')
                     THEN carousel_posts.cards ELSE EXCLUDED.cards END,
        caption = CASE WHEN carousel_posts.words_edited OR carousel_posts.status IN ('approved', 'scheduled')
                       THEN carousel_posts.caption ELSE EXCLUDED.caption END,
        gif_lines = CASE WHEN carousel_posts.gif_lines_edited THEN carousel_posts.gif_lines ELSE EXCLUDED.gif_lines END,
        -- Dates: a hand-set one stays, the experiment's come from its start
        -- Monday, and a scheduled post keeps the date it was queued with.
        scheduled_for = CASE WHEN carousel_posts.date_edited OR carousel_posts.batch = ${EXPERIMENT}
                                  OR carousel_posts.status = 'scheduled'
                             THEN carousel_posts.scheduled_for ELSE EXCLUDED.scheduled_for END,
        -- The content version moves only if the words on the slides did.
        updated_at = CASE WHEN NOT (carousel_posts.words_edited OR carousel_posts.status IN ('approved', 'scheduled'))
                               AND (carousel_posts.cards IS DISTINCT FROM EXCLUDED.cards
                                    OR carousel_posts.caption IS DISTINCT FROM EXCLUDED.caption)
                          THEN NOW() ELSE carousel_posts.updated_at END`;
  }

  const [counts] = await sql`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE batch = ${EXPERIMENT})::int AS episodes,
           count(*) FILTER (WHERE storyboard IS NOT NULL)::int AS with_storyboard
    FROM carousel_posts`;
  console.log(`${posts.length} posts in the plan: ${added} new, ${refreshed} already there` +
              (DRY ? " (dry run — nothing written)" : ""));
  console.log(`carousel_posts now holds ${counts.total} (${counts.episodes} episodes, ${counts.with_storyboard} with story pictures)`);
  await sql.end();
}

main().catch(async (e) => {
  console.error("carousel-seed failed:", e.message);
  await sql.end().catch(() => {});
  process.exit(1);
});
