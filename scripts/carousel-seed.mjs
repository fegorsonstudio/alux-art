/**
 * Loads the carousel calendar into carousel_posts, for the website studio
 * (/admin/carousel).
 *
 *   node --env-file=.env.local scripts/carousel-seed.mjs [--dry-run]
 *
 * The calendar is tools/carousel/schedule.mjs: every Photo Wahala post in
 * posting order — Season 1, then Season 2, one post at 7pm on Monday,
 * Wednesday, Friday and Sunday — and the December specials, hidden and
 * undated until December 2027.
 *
 * Safe to run again. It refreshes the words and dates only on posts the owner
 * has not edited, approved or scheduled, and never touches photographs, story
 * pictures, approvals or hand-set dates. A row the calendar no longer contains
 * is removed only while it is untouched (no photos, edits, schedule or GIF);
 * anything else is listed for a human to decide.
 */
import postgres from "postgres";
import { SCHEDULE } from "../tools/carousel/schedule.mjs";

const DRY = process.argv.includes("--dry-run");

const url = process.env.DATABASE_URL;
const sql = postgres(url, {
  ssl: url?.includes("localhost") || url?.includes("127.0.0.1") ? false : { rejectUnauthorized: false },
});

async function main() {
  const existing = new Set((await sql`SELECT local_id FROM carousel_posts`).map((r) => r.local_id));
  const wanted = new Set(SCHEDULE.map((p) => `plan-${p.id}`));
  let added = 0, refreshed = 0;

  for (const p of SCHEDULE) {
    const id = `plan-${p.id}`;
    if (existing.has(id)) refreshed++; else added++;
    if (DRY) continue;
    const cards = p.cards.map((c) => ({ eyebrow: c.eyebrow ?? "", headline: c.headline ?? "", body: c.body ?? "" }));
    const scenePaths = (p.storyboard?.scenes ?? []).map(() => null);
    const when = p.when ? new Date(p.when) : null;

    await sql`
      INSERT INTO carousel_posts (
        local_id, batch, title, product, trigger_word, photos_hint, post_hour,
        cards, caption, storyboard, gif_lines, scene_paths, scheduled_for, hidden)
      VALUES (
        ${id}, ${p.batch}, ${p.title}, ${p.product ?? null}, ${p.trigger ?? null}, ${p.photos ?? null}, 19,
        ${sql.json(cards)}, ${p.caption}, ${p.storyboard ? sql.json(p.storyboard) : null},
        ${sql.json(p.gifLines)}, ${sql.json(scenePaths)}, ${when}, ${p.hidden})
      ON CONFLICT (local_id) DO UPDATE SET
        batch = EXCLUDED.batch, product = EXCLUDED.product, trigger_word = EXCLUDED.trigger_word,
        photos_hint = EXCLUDED.photos_hint, storyboard = EXCLUDED.storyboard,
        title = CASE WHEN carousel_posts.words_edited OR carousel_posts.status IN ('approved', 'scheduled')
                     THEN carousel_posts.title ELSE EXCLUDED.title END,
        cards = CASE WHEN carousel_posts.words_edited OR carousel_posts.status IN ('approved', 'scheduled')
                     THEN carousel_posts.cards ELSE EXCLUDED.cards END,
        caption = CASE WHEN carousel_posts.words_edited OR carousel_posts.status IN ('approved', 'scheduled')
                       THEN carousel_posts.caption ELSE EXCLUDED.caption END,
        gif_lines = CASE WHEN carousel_posts.gif_lines_edited THEN carousel_posts.gif_lines ELSE EXCLUDED.gif_lines END,
        scheduled_for = CASE WHEN carousel_posts.date_edited OR carousel_posts.status = 'scheduled'
                             THEN carousel_posts.scheduled_for ELSE EXCLUDED.scheduled_for END,
        hidden = EXCLUDED.hidden,
        updated_at = CASE WHEN NOT (carousel_posts.words_edited OR carousel_posts.status IN ('approved', 'scheduled'))
                               AND (carousel_posts.cards IS DISTINCT FROM EXCLUDED.cards
                                    OR carousel_posts.caption IS DISTINCT FROM EXCLUDED.caption)
                          THEN NOW() ELSE carousel_posts.updated_at END`;
  }

  // Rows the calendar no longer has: removed only while nobody has touched them.
  const gone = [...existing].filter((id) => id.startsWith("plan-") && !wanted.has(id));
  const kept = [];
  let removed = 0;
  for (const id of gone) {
    const [r] = await sql`
      SELECT (words_edited OR date_edited OR gif_lines_edited OR gif_cleared OR before_path IS NOT NULL
              OR after_path IS NOT NULL OR status <> 'needs_photos'
              OR EXISTS (SELECT 1 FROM scheduled_carousels s WHERE s.local_id = ${id})
              OR EXISTS (SELECT 1 FROM carousel_gifs g WHERE g.local_id = ${id})) AS touched
      FROM carousel_posts WHERE local_id = ${id}`;
    if (r?.touched) { kept.push(id); continue; }
    if (!DRY) await sql`DELETE FROM carousel_posts WHERE local_id = ${id}`;
    removed++;
  }

  const [c] = await sql`
    SELECT count(*)::int AS total, count(*) FILTER (WHERE NOT hidden)::int AS shown FROM carousel_posts`;
  console.log(`${SCHEDULE.length} posts in the calendar: ${added} new, ${refreshed} refreshed; ` +
              `${removed} old rows removed${DRY ? " (dry run — nothing written)" : ""}`);
  if (kept.length) console.log(`Kept because someone has worked on them: ${kept.join(", ")}`);
  console.log(`carousel_posts now holds ${c.total} (${c.shown} showing in the studio)`);
  await sql.end();
}

main().catch(async (e) => {
  console.error("carousel-seed failed:", e.message);
  await sql.end().catch(() => {});
  process.exit(1);
});
