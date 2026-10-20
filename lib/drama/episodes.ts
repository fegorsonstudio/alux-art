import "server-only";
import sql from "@/lib/db";
import { r2Upload } from "@/lib/r2";
import { SITE_URL } from "@/lib/site-url";
import { renderEpisodeSlides, type DEpisode, type DStory } from "@/lib/drama/slides";
import type { StoryRow } from "@/lib/drama/data";

/**
 * From written episode to Instagram post. The owner previews, approves (which
 * freezes exactly what was read into drama_episodes) and schedules; the slides
 * are drawn from that frozen copy, stored in R2 and queued in
 * scheduled_carousels — the same queue /api/cron/publish-carousel posts from —
 * under local_id "drama-<episode id>". Nothing reaches Instagram without that
 * approval and schedule (the owner's rule since 2026-10-06).
 */

export const SLIDE_BUCKET = "generated-4k";
export const localIdOf = (episodeId: string) => `drama-${episodeId}`;
const GAME_URL = `${SITE_URL.replace(/\/$/, "").replace(/^https?:\/\//, "")}/d/drama`;

export type EpisodeRow = {
  id: string; story_id: string; n: number; from_word: string | null; status: string;
  content: DEpisode & { caption: string; approvedAt: string; slides: DEpisode["slides"] };
  ig_media_id: string | null; posted_at: string | null; decided_word: string | null; decided_at: string | null;
};

export const storyForSlides = (s: StoryRow): DStory => ({
  title: s.title, tagline: s.tagline, genre: s.genre, city: s.city, minVotes: s.min_votes,
  cast: (s.content.cast ?? []).map((c) => ({ key: c.key, name: c.name, role: c.role })),
});

/** The written episode `n` of a story, as the story file has it. */
export function writtenEpisode(s: StoryRow, n: number) {
  return (s.content.episodes ?? []).find((e) => e.n === n) as (DEpisode & StoryRow["content"]["episodes"][number]) | undefined;
}

/** The Instagram caption: the hook, the two words, the game, and who is in the scene. */
export async function captionFor(s: StoryRow, ep: ReturnType<typeof writtenEpisode>): Promise<string> {
  if (!ep) return "";
  const [a, b] = ep.choice.options;
  const sold = await sql<{ slot_key: string; brand_name: string }[]>`
    SELECT slot_key, brand_name FROM drama_placements
    WHERE story_id = ${s.id} AND episode_n = ${ep.n} AND status IN ('approved', 'placed')`;
  const partners = sold.map((p) => p.brand_name);
  const house = ep.alux?.product ? ep.alux.product.split(/[:—]/)[0].trim() : null;
  const tag = (t: string) => `#${t.replace(/[^A-Za-z0-9]/g, "")}`;
  return [
    `${s.title} — Episode ${ep.n}: ${ep.title}`,
    "",
    s.tagline,
    "",
    "What happens next is yours.",
    `Comment ${a.word} — ${a.label.toLowerCase()}`,
    `Comment ${b.word} — ${b.label.toLowerCase()}`,
    `The first word to reach ${s.min_votes} votes writes Episode ${ep.n + 1}.`,
    "",
    `Want to play a role in the next story? ${GAME_URL}`,
    partners.length ? `\nPartner: ${partners.join(", ")}` : "",
    house ? `In this scene: ${house} by Alux.` : "",
    "",
    [tag("AluxMicroDrama"), tag(s.city), tag(`${s.title}`), "#NigerianStories", "#MicroDrama"].join(" "),
  ].filter((l, i, all) => !(l === "" && all[i - 1] === "")).join("\n").trim();
}

/** Draw the slides of an approved (frozen) episode. */
export async function slidesForEpisode(s: StoryRow, e: EpisodeRow): Promise<Buffer[]> {
  return renderEpisodeSlides(storyForSlides(s), e.content);
}

/** Freeze the written episode as approved. Refused once it is on Instagram. */
export async function approveEpisode(s: StoryRow, n: number, caption: string): Promise<EpisodeRow> {
  const ep = writtenEpisode(s, n);
  if (!ep) throw new Error(`Episode ${n} is not written yet.`);
  const content = { ...ep, caption: caption.trim(), approvedAt: new Date().toISOString() };
  const [row] = await sql<EpisodeRow[]>`
    INSERT INTO drama_episodes (story_id, n, content, status)
    VALUES (${s.id}, ${n}, ${sql.json(JSON.parse(JSON.stringify(content)))}, 'ready')
    ON CONFLICT (story_id, n) DO UPDATE SET content = EXCLUDED.content, status = 'ready', updated_at = now()
      WHERE drama_episodes.status IN ('draft', 'producing', 'ready')
    RETURNING *`;
  if (!row) throw new Error("This episode is already on Instagram — it can no longer change.");
  return row;
}

/** Store the slides and queue the post. Returns how many slides went in. */
export async function scheduleEpisode(s: StoryRow, e: EpisodeRow, when: Date): Promise<number> {
  if (e.status !== "ready") throw new Error("Approve the episode first.");
  if (when.getTime() < Date.now() + 2 * 60_000) throw new Error("Pick a time at least a few minutes from now.");
  const slides = await slidesForEpisode(s, e);
  const stamp = when.toISOString().slice(0, 10);
  const local = localIdOf(e.id);
  const paths: string[] = [];
  for (let i = 0; i < slides.length; i++) {
    const path = `carousels/${stamp}/${local}/${String(i + 1).padStart(2, "0")}.jpg`;
    await r2Upload(SLIDE_BUCKET, path, slides[i], "image/jpeg");
    paths.push(path);
  }
  const [queued] = await sql<{ id: string }[]>`
    INSERT INTO scheduled_carousels (local_id, ig_account, caption, slide_paths, scheduled_for)
    VALUES (${local}, ${s.ig_account}, ${e.content.caption}, ${paths}, ${when})
    ON CONFLICT (local_id) WHERE local_id IS NOT NULL
    DO UPDATE SET ig_account = EXCLUDED.ig_account, caption = EXCLUDED.caption, slide_paths = EXCLUDED.slide_paths,
                  scheduled_for = EXCLUDED.scheduled_for, status = 'queued', attempts = 0, last_error = NULL, updated_at = NOW()
      WHERE scheduled_carousels.status NOT IN ('publishing', 'published')
    RETURNING id`;
  if (!queued) throw new Error("This episode is already on Instagram.");
  return slides.length;
}

/** Take a queued episode back before it posts. */
export async function unscheduleEpisode(e: EpisodeRow): Promise<boolean> {
  const rows = await sql`DELETE FROM scheduled_carousels WHERE local_id = ${localIdOf(e.id)} AND status IN ('queued', 'failed') RETURNING id`;
  return rows.length > 0;
}

/**
 * Copy what the publisher learnt (posted, the Instagram media id) onto the
 * drama episodes, and mark a story live once its first episode is out.
 * Cheap and safe to call from any page or the webhook.
 */
export async function syncPosted(): Promise<void> {
  await sql`
    UPDATE drama_episodes e SET status = 'posted', ig_media_id = c.ig_media_id, posted_at = c.published_at, updated_at = now()
    FROM scheduled_carousels c
    WHERE c.local_id = 'drama-' || e.id::text AND c.status = 'published' AND c.ig_media_id IS NOT NULL
      AND e.status = 'ready'`;
  await sql`
    UPDATE drama_stories s SET status = 'live', updated_at = now()
    WHERE s.status = 'upcoming' AND EXISTS (SELECT 1 FROM drama_episodes e WHERE e.story_id = s.id AND e.status IN ('posted', 'closed'))`;
}

/** Where each of a story's episodes stands with the publisher. */
export async function queueState(episodeIds: string[]) {
  if (!episodeIds.length) return new Map<string, { status: string; scheduled_for: string; last_error: string | null }>();
  const rows = await sql<{ local_id: string; status: string; scheduled_for: string; last_error: string | null }[]>`
    SELECT local_id, status, scheduled_for, last_error FROM scheduled_carousels
    WHERE local_id = ANY(${episodeIds.map(localIdOf)})`;
  return new Map(rows.map((r) => [r.local_id.slice("drama-".length), r]));
}
