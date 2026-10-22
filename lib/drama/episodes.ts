import "server-only";
import sql from "@/lib/db";
import { r2Download, r2Upload } from "@/lib/r2";
import { renderEpisodeSlides, type DEpisode, type DStory, type SlideArt } from "@/lib/drama/slides";
import type { StoryRow } from "@/lib/drama/data";
import { brandLine } from "@/lib/drama/brands";

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

export type EpisodeRow = {
  id: string; story_id: string; n: number; from_word: string | null; status: string;
  content: DEpisode & { caption: string; approvedAt: string; slides: DEpisode["slides"]; art?: ArtRef[]; partners?: PartnerRef[] };
  ig_media_id: string | null; posted_at: string | null; decided_word: string | null; decided_at: string | null;
};

/** A brand placed in an episode: its product picture goes on the slot's slide, its word in the caption. */
export type PartnerRef = { id: string; brand: string; word: string | null; object: string; slide: number; bucket: string; path: string };

/**
 * The brands in episode n, and where each sits. A per-slot brand takes its slot;
 * a "next episode" brand takes the first slot of whichever version was made.
 * The caption and the slides both read this, so they always agree.
 */
export async function partnersFor(s: StoryRow, ep: { n: number; slots?: { key: string; object: string; slide: number }[] }): Promise<PartnerRef[]> {
  const rows = await sql<{ id: string; slot_key: string; brand_name: string; keyword: string | null; product_bucket: string | null; product_path: string | null }[]>`
    SELECT id, slot_key, brand_name, keyword, product_bucket, product_path FROM drama_placements
    WHERE story_id = ${s.id} AND episode_n = ${ep.n} AND status IN ('approved', 'placed') ORDER BY created_at`;
  const slots = ep.slots ?? [];
  const used = new Set(rows.filter((r) => r.slot_key !== "next").map((r) => r.slot_key));
  const out: PartnerRef[] = [];
  for (const r of rows) {
    const slot = r.slot_key === "next" ? slots.find((x) => !used.has(x.key)) : slots.find((x) => x.key === r.slot_key);
    if (!slot || !r.product_bucket || !r.product_path) continue;
    used.add(slot.key);
    out.push({ id: r.id, brand: r.brand_name, word: r.keyword, object: slot.object, slide: slot.slide, bucket: r.product_bucket, path: r.product_path });
  }
  return out;
}

/** A picture attached to one slide (drama_art), by reference. */
export type ArtRef = { slide: number; bucket: string; path: string; captionAt: "top" | "bottom" };

/** The pictures attached to an episode that is not frozen yet. */
export async function artFor(storyId: string, n: number): Promise<ArtRef[]> {
  return sql<ArtRef[]>`SELECT slide, bucket, path, caption_at AS "captionAt" FROM drama_art WHERE story_id = ${storyId} AND episode_n = ${n} ORDER BY slide`;
}

/** Fetch the pictures themselves, ready for the slide designer. */
export async function loadArt(refs: ArtRef[] | undefined): Promise<Map<number, SlideArt>> {
  const out = new Map<number, SlideArt>();
  for (const r of refs ?? []) {
    const { buffer } = await r2Download(r.bucket, r.path);
    out.set(r.slide, { buffer, captionAt: r.captionAt });
  }
  return out;
}

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
  const partners = (await partnersFor(s, ep)).map((p) => (p.word ? brandLine(p.brand, p.object, p.word) : `Partner: ${p.brand}.`));
  const house = ep.alux?.product ? ep.alux.product.split(/[:—]/)[0].trim() : null;
  // Fans who play a character in this episode are credited by name.
  const inScene = new Set((ep.slides ?? []).map((x) => (x as { who?: string }).who).filter(Boolean));
  const players = await sql<{ role_key: string; display_name: string }[]>`
    SELECT role_key, display_name FROM drama_cast
    WHERE story_id = ${s.id} AND status IN ('submitted', 'photos_needed', 'making', 'sheet_ready', 'accepted', 'approved', 'failed')`;
  const credits = players.filter((p) => inScene.has(p.role_key)).map((p) => {
    const role = (s.content.cast ?? []).find((c) => c.key === p.role_key);
    return `${role?.name ?? p.role_key} — played by ${p.display_name}`;
  });
  const tag = (t: string) => `#${t.replace(/[^A-Za-z0-9]/g, "")}`;
  return [
    `${s.title} — Episode ${ep.n}: ${ep.title}`,
    "",
    s.tagline,
    "",
    "What happens next is yours.",
    `Comment ${a.word} — ${a.label.toLowerCase()}`,
    `Comment ${b.word} — ${b.label.toLowerCase()}`,
    `Voting closes at 4 p.m. tomorrow, Lagos time. The word with the most votes ${(ep as { finale?: boolean }).finale ? "decides how season two begins" : `writes Episode ${ep.n + 1}`}.`,
    "",
    // Instagram never makes a caption link tappable: the link lives in the bio,
    // and "comment PLAY" sends it to the DMs as a button (lib/drama/votes.ts).
    "Play the game, see every story and join the cast: link in bio, or comment PLAY and we'll send it to your DMs.",
    partners.length ? `\n${partners.join("\n")}` : "",
    credits.length ? `\nCast: ${credits.join("; ")}` : "",
    // A product word is offered quietly, in the caption only (the slides never sell).
    ep.alux?.word && ep.alux.line ? ep.alux.line : house ? `In this scene: ${house} by Alux.` : "",
    "",
    [tag("AluxMicroDrama"), tag(s.city), tag(`${s.title}`), "#NigerianStories", "#MicroDrama"].join(" "),
  ].filter((l, i, all) => !(l === "" && all[i - 1] === "")).join("\n").trim();
}

/** Draw the slides of an approved (frozen) episode. */
export async function slidesForEpisode(s: StoryRow, e: EpisodeRow): Promise<Buffer[]> {
  const cards = new Map<number, { buffer: Buffer; brand: string }>();
  for (const p of e.content.partners ?? []) {
    try { cards.set(p.slide, { buffer: (await r2Download(p.bucket, p.path)).buffer, brand: p.brand }); } catch { /* a missing picture leaves the slide as written */ }
  }
  return renderEpisodeSlides(storyForSlides(s), e.content, await loadArt(e.content.art), cards);
}

/** Freeze the written episode as approved. Refused once it is on Instagram. */
export async function approveEpisode(s: StoryRow, n: number, caption: string): Promise<EpisodeRow> {
  const ep = writtenEpisode(s, n);
  if (!ep) throw new Error(`Episode ${n} is not written yet.`);
  // The pictures are frozen with the words: what was previewed is what posts.
  // Once the story has a poster, it is the cover slide's picture (unless that slide has its own).
  const art = await artFor(s.id, n);
  const [poster] = await sql<{ cover_bucket: string | null; cover_path: string | null }[]>`SELECT cover_bucket, cover_path FROM drama_stories WHERE id = ${s.id}`;
  if (poster?.cover_bucket && poster.cover_path && !art.some((a) => a.slide === 1)) {
    art.unshift({ slide: 1, bucket: poster.cover_bucket, path: poster.cover_path, captionAt: "bottom" });
  }
  const partners = await partnersFor(s, ep);
  const content = { ...ep, caption: caption.trim(), approvedAt: new Date().toISOString(), art, partners };
  const [row] = await sql<EpisodeRow[]>`
    INSERT INTO drama_episodes (story_id, n, content, status)
    VALUES (${s.id}, ${n}, ${sql.json(JSON.parse(JSON.stringify(content)))}, 'ready')
    ON CONFLICT (story_id, n) DO UPDATE SET content = EXCLUDED.content, status = 'ready', updated_at = now()
      WHERE drama_episodes.status IN ('draft', 'producing', 'ready')
    RETURNING *`;
  if (!row) throw new Error("This episode is already on Instagram — it can no longer change.");
  for (const p of partners) {
    const slot = (ep.slots ?? []).find((x) => x.object === p.object);
    await sql`UPDATE drama_placements SET status = 'placed', placed_slot = ${slot?.key ?? null}, updated_at = now() WHERE id = ${p.id} AND status IN ('approved', 'placed')`;
  }
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
                  scheduled_for = EXCLUDED.scheduled_for, status = 'queued', attempts = 0, last_error = NULL,
                  cover_video_path = NULL, updated_at = NOW()
      WHERE scheduled_carousels.status NOT IN ('publishing', 'published')
    RETURNING id`;
  if (!queued) throw new Error("This episode is already on Instagram.");
  // Queued again (new slides or a new time): any soundtrack made for the old
  // version is let go, and scripts/drama-sound.mjs makes it afresh.
  await sql`DELETE FROM drama_sound WHERE episode_id = ${e.id} AND status <> 'making'`.catch(() => {});
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
