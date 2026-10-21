import "server-only";
import sql from "@/lib/db";
import { tellAdmin } from "@/lib/telegram";
import { withShootLock } from "@/lib/worker-lock";
import type { DramaDraft, StoryRow } from "@/lib/drama/data";
import { approveEpisode, captionFor, scheduleEpisode, writtenEpisode, type EpisodeRow } from "@/lib/drama/episodes";

/**
 * The story moves on by itself (the owner, 2026-10-21: "I don't want a
 * situation where I have to approve everything. It should just be automatic").
 *
 * When an episode's vote has closed, the episode written ahead for that road
 * (content.drafts, written and checked in tools/drama/stories) is copied into
 * the story's episodes, frozen exactly as approveEpisode freezes an episode the
 * owner approves, and queued for the next 7 p.m. in Lagos. The owner hears what
 * will post and when; nothing waits for them. /admin/drama can still take it
 * back before it posts.
 *
 * Safe to call any number of times, from the vote that decides an episode and
 * from the cron sweep: an episode that already exists is never made twice.
 */

const ROADS_SEP = ".";

/** The draft for episode `n` on this road: the exact road first, then the longest "*." ending that fits. */
export function draftFor(drafts: DramaDraft[] | undefined, n: number, road: string[]): DramaDraft | null {
  const list = (drafts ?? []).filter((d) => d.n === n);
  const exact = list.find((d) => d.after === road.join(ROADS_SEP));
  if (exact) return exact;
  const fits = list
    .filter((d) => d.after.startsWith("*" + ROADS_SEP))
    .map((d) => ({ d, tail: d.after.slice(2).split(ROADS_SEP) }))
    .filter(({ tail }) => tail.length <= road.length && tail.every((w, i) => road[road.length - tail.length + i] === w))
    .sort((a, b) => b.tail.length - a.tail.length);
  return fits[0]?.d ?? null;
}

/** The next 7 p.m. in Lagos (UTC+1, no daylight saving) at least three hours away. */
export function nextSlot(now = new Date()): Date {
  const lagos = new Date(now.getTime() + 60 * 60_000);
  const at = new Date(Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), lagos.getUTCDate(), 18, 0, 0)); // 19:00 Lagos
  if (at.getTime() - now.getTime() < 3 * 60 * 60_000) at.setUTCDate(at.getUTCDate() + 1);
  return at;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const lagosTime = (d: Date) =>
  d.toLocaleString("en-GB", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });

export type Advance =
  | { kind: "idle" }
  | { kind: "finished" }
  | { kind: "busy" }
  | { kind: "unwritten"; n: number; road: string }
  | { kind: "queued"; n: number; title: string; at: string; slides: number };

/** Tell the owner about a missing episode once per process, not every ten minutes. */
const toldUnwritten = new Set<string>();

async function storyById(id: string): Promise<StoryRow | null> {
  const [row] = await sql<StoryRow[]>`
    SELECT id, slug, title, tagline, genre, city, logline, status, featured, min_votes, ig_account, updated_at, content
    FROM drama_stories WHERE id = ${id}`;
  return row ?? null;
}

export async function advanceStory(storyId: string): Promise<Advance> {
  const run = await withShootLock(`drama-advance:${storyId}`, async (): Promise<Advance> => {
    let story = await storyById(storyId);
    if (!story || story.status !== "live") return { kind: "idle" };
    const eps = await sql<EpisodeRow[]>`SELECT * FROM drama_episodes WHERE story_id = ${storyId} ORDER BY n`;
    const last = eps[eps.length - 1];
    if (!last || last.status !== "closed" || !last.decided_word) return { kind: "idle" };
    // The season finale's vote picks how season two begins: the story is finished, not continued.
    if ((last.content as { finale?: boolean }).finale) {
      const done = await sql`UPDATE drama_stories SET status = 'finished', updated_at = now() WHERE id = ${storyId} AND status = 'live' RETURNING id`;
      if (done.length) {
        const next = (last.content as { branches?: Record<string, string> }).branches?.[last.decided_word] ?? "";
        await tellAdmin(`🎬 <b>${esc(story.title)}</b> — season one is complete. ${esc(last.decided_word)} won the last vote.
${esc(next)}
Ask Claude to write season two from there.`).catch(() => false);
      }
      return { kind: "finished" };
    }
    const n = last.n + 1;
    const road = eps.map((e) => e.decided_word ?? "");
    if (road.some((w) => !w)) return { kind: "idle" }; // an earlier episode was never decided

    if (!writtenEpisode(story, n)) {
      const draft = draftFor(story.content.drafts, n, road);
      if (!draft) {
        const key = `${storyId}:${n}:${road.join(ROADS_SEP)}`;
        if (!toldUnwritten.has(key)) {
          toldUnwritten.add(key);
          await tellAdmin(`🎬 <b>${esc(story.title)}</b> — ${esc(last.decided_word)} won Episode ${last.n}, but Episode ${n} for that road (${esc(road.join(" → "))}) is not written yet.\nIt will post by itself as soon as it is written — ask Claude to write it.`).catch(() => false);
        }
        return { kind: "unwritten", n, road: road.join(ROADS_SEP) };
      }
      // Copy the draft into the played episodes, once (the WHERE makes a second copy impossible).
      const episode = JSON.parse(JSON.stringify({ ...draft, n }));
      await sql`
        UPDATE drama_stories
        SET content = jsonb_set(content, '{episodes}', COALESCE(content->'episodes', '[]'::jsonb) || ${sql.json([episode])}::jsonb), updated_at = now()
        WHERE id = ${storyId}
          AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(content->'episodes', '[]'::jsonb)) x WHERE (x->>'n')::int = ${n})`;
      story = await storyById(storyId);
      if (!story || !writtenEpisode(story, n)) throw new Error(`episode ${n} did not land in the story`);
    }

    const written = writtenEpisode(story, n)!;
    const frozen = await approveEpisode(story, n, await captionFor(story, written));
    await sql`UPDATE drama_episodes SET from_word = ${last.decided_word} WHERE id = ${frozen.id} AND from_word IS NULL`;
    const when = nextSlot();
    let slides: number;
    try {
      slides = await scheduleEpisode(story, frozen, when);
    } catch (e) {
      // Undo the freeze so the next sweep starts this episode again. (An episode
      // the owner takes back with Unschedule stays frozen and is left alone.)
      await sql`DELETE FROM drama_episodes WHERE id = ${frozen.id} AND status = 'ready'
        AND NOT EXISTS (SELECT 1 FROM scheduled_carousels WHERE local_id = ${"drama-" + frozen.id})`.catch(() => {});
      throw e;
    }
    await tellAdmin(
      `🎬 <b>${esc(story.title)}</b> — ${esc(last.decided_word)} won Episode ${last.n}.\n` +
      `Episode ${n}, “${esc(written.title)}”, posts by itself on @${esc(story.ig_account)} at ${esc(lagosTime(when))} (Lagos). Nothing for you to do.\n` +
      `To hold it back: /admin/drama → Unschedule.`,
    ).catch(() => false);
    return { kind: "queued", n, title: written.title, at: when.toISOString(), slides };
  });
  return run.locked ? run.value : { kind: "busy" };
}

/**
 * Every live story whose last episode is decided and has no next episode yet.
 * An episode already made (queued, posted, or held back by the owner) is left
 * alone, so this only ever picks up a vote that closed before its next episode
 * was written, or a run that failed half way.
 */
export async function advanceStories(): Promise<{ slug: string; result: Advance | { kind: "error"; message: string } }[]> {
  const due = await sql<{ id: string; slug: string }[]>`
    SELECT s.id, s.slug FROM drama_stories s
    JOIN LATERAL (SELECT n, status, decided_word FROM drama_episodes e WHERE e.story_id = s.id ORDER BY n DESC LIMIT 1) last ON true
    WHERE s.status = 'live' AND last.status = 'closed' AND last.decided_word IS NOT NULL`;
  const out = [];
  for (const s of due) {
    try { out.push({ slug: s.slug, result: await advanceStory(s.id) }); }
    catch (e) { out.push({ slug: s.slug, result: { kind: "error" as const, message: (e as Error).message.slice(0, 300) } }); }
  }
  return out;
}
