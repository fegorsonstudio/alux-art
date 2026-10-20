// Loads the Alux Micro Drama stories (tools/drama/stories/*.mjs) into drama_stories.
//   node --env-file=.env.local scripts/drama-seed.mjs            all stories
//   node --env-file=.env.local scripts/drama-seed.mjs aso-ebi    one story
// Every story must pass tools/drama/check.mjs first, or nothing is written.
// Re-runnable. A story that has started (status other than 'upcoming') keeps
// its content: what has been posted must not change under the viewers. The
// owner's own choices (status, featured, order, cover art) are never overwritten.
import postgres from "postgres";
import { checkStory, loadStories } from "../tools/drama/check.mjs";

// Shelf order on first load; the first one is the hero.
const ORDER = ["the-silent-partner", "third-mainland", "garden-city", "harmattan-letters", "aso-ebi", "the-fourth-floor", "what-the-river-keeps", "coal-city-1962"];

const list = await loadStories(process.argv[2]);
const problems = list.flatMap(({ file, story }) => checkStory(story, file).map((e) => `${story.slug}: ${e}`));
if (problems.length) {
  console.error("Not loading — fix these first:\n" + problems.join("\n"));
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { ssl: false, max: 1 });
let added = 0, refreshed = 0, kept = 0;
for (const { story } of list) {
  const content = JSON.parse(JSON.stringify(story)); // plain data only
  const at = ORDER.indexOf(story.slug);
  const sort = at >= 0 ? (at + 1) * 10 : 100;
  const [row] = await sql`
    INSERT INTO drama_stories (slug, title, tagline, genre, city, logline, min_votes, content, sort, featured)
    VALUES (${story.slug}, ${story.title}, ${story.tagline}, ${story.genre}, ${story.city}, ${story.logline},
            ${story.minVotes}, ${sql.json(content)}, ${sort}, ${at === 0})
    ON CONFLICT (slug) DO UPDATE SET
      title = EXCLUDED.title, tagline = EXCLUDED.tagline, genre = EXCLUDED.genre, city = EXCLUDED.city,
      logline = EXCLUDED.logline, min_votes = EXCLUDED.min_votes, content = EXCLUDED.content, updated_at = now()
      WHERE drama_stories.status = 'upcoming'
    RETURNING (xmax = 0) AS inserted`;
  if (!row) kept++;
  else if (row.inserted) added++;
  else refreshed++;
}
const [{ n }] = await sql`SELECT count(*)::int AS n FROM drama_stories`;
const [{ kind }] = await sql`SELECT string_agg(DISTINCT jsonb_typeof(content), ',') AS kind FROM drama_stories`;
console.log(`stories: ${added} added, ${refreshed} refreshed, ${kept} kept as they are (already started); ${n} in total; content stored as ${kind}`);
await sql.end();
