import "server-only";
import { fal } from "@fal-ai/client";
import sql from "@/lib/db";
import { nanoBananaEdit } from "@/lib/fal-edit"; // also configures the fal client
import { r2SignedDownloadUrl, r2Upload } from "@/lib/r2";
import { tellAdmin } from "@/lib/telegram";
import { withShootLock } from "@/lib/worker-lock";
import type { DramaRole, StoryRow } from "@/lib/drama/data";
import { lightFor, lightingBlock } from "@/lib/drama/lighting";

/**
 * The story's movie poster (owner, 2026-10-21): Hollywood key art behind the
 * SAME title design — lib/drama/cover.ts draws the title, fonts and frame over
 * whatever picture is in drama_stories.cover_bucket/path, so only the picture
 * changes. Once a story has a poster, every episode's cover slide uses it too
 * (approveEpisode freezes it as slide 1's picture).
 *
 * With paid cast: their faces, from their character sheets and portraits, as
 * the lead (large, in front) and up to two main roles (smaller, behind).
 * Without: fictional people dressed as the characters (the owner said yes).
 * 2K, portrait 2:3, the genre's lighting and grade written into the prompt and
 * kept with the poster in cover_meta. At most three posters a story.
 */

const KEEP_BUCKET = "generated-4k";
const MAX_POSTERS = 3;
const TEXT_TO_IMAGE = "fal-ai/nano-banana-pro";

type Player = { role: DramaRole; refs: string[] };

const LIKENESS =
  "Each cast member's face, skin tone, hair and build come from their attached images and must not change: the same " +
  "individual, not a similar person. Do not slim, smooth, lighten or beautify; keep real skin texture and their real age.";
const NO_TEXT = "PRINT NO TEXT anywhere: no title, no credits block, no letters, no numbers, no logos, no watermark — the title is added later.";
const PHOTO_REAL = "A real photograph, not an illustration or a 3D render: natural skin, realistic fabric, physically plausible light.";
const wear = (r: DramaRole) => `${r.name}, ${r.role}: wearing ${r.look} (clothing, accessories and props only — never a face or body from this description)`;

function posterPrompt(story: StoryRow, lead: DramaRole, others: DramaRole[], players: Player[]): string {
  const paid = players.length > 0;
  let k = 0;
  const imageMap = players.map((p) => {
    const from = k + 1;
    k += p.refs.length;
    return `${p.refs.length > 1 ? `images ${from} to ${k}` : `image ${from}`} show the person playing ${p.role.name}`;
  }).join("; ");
  return [
    `THEATRICAL KEY ART for "${story.title}", a ${story.genre} drama set in ${story.city}, Nigeria: a movie one-sheet in portrait 2:3, like the poster of a prestige streaming original.`,
    `THE STORY — ${story.logline}`,
    `ON THE POSTER — in front, large: ${wear(lead)}.` + (others.length ? ` Behind, smaller, one to each side: ${others.map(wear).join("; ")}.` : ""),
    paid
      ? `THE ATTACHED IMAGES — ${imageMap}. ${LIKENESS}` +
        (players.length < 1 + others.length ? " The characters without images are fictional Nigerian people." : "")
      : "The cast are fictional Nigerian people — not anyone famous or real.",
    `COMPOSITION — the lead chest-up in the lower two-thirds, three-quarter to camera, eyes to the lens, a composed, intense expression; the others further back; a hint of ${story.city} behind them. Keep the TOP THIRD of the frame dark, clean and empty for the title, and the bottom tenth plain.`,
    lightingBlock(lightFor(story.genre)),
    PHOTO_REAL, NO_TEXT,
  ].join("\n\n");
}

async function storyById(id: string): Promise<StoryRow & { cover_renders: number } | null> {
  const [s] = await sql<(StoryRow & { cover_renders: number })[]>`
    SELECT id, slug, title, tagline, genre, city, logline, status, featured, min_votes, ig_account, updated_at, content, cover_renders
    FROM drama_stories WHERE id = ${id}`;
  return s ?? null;
}

/** Make (or remake) the story's poster now. Returns the new path, or why not. */
export async function makePoster(storyId: string): Promise<{ ok: true; path: string; model: string } | { ok: false; why: string }> {
  const run = await withShootLock(`drama-poster:${storyId}`, async () => {
    const story = await storyById(storyId);
    if (!story) return { ok: false as const, why: "no such story" };
    if (story.cover_renders >= MAX_POSTERS) return { ok: false as const, why: `already ${MAX_POSTERS} posters` };
    const cast = story.content.cast ?? [];
    const lead = cast.find((r) => r.tier === "lead" && !r.guest);
    if (!lead) return { ok: false as const, why: "no lead role" };
    const mains = cast.filter((r) => r.tier === "main" && !r.guest);

    // Paid cast: the lead and any main roles a fan plays, with their sheet and portrait.
    const rows = await sql<{ role_key: string; sheet_bucket: string | null; sheet_path: string | null; portrait_bucket: string | null; portrait_path: string | null }[]>`
      SELECT role_key, sheet_bucket, sheet_path, portrait_bucket, portrait_path FROM drama_cast
      WHERE story_id = ${storyId} AND status IN ('sheet_ready', 'accepted', 'approved') AND portrait_path IS NOT NULL`;
    const playedMains = mains.filter((m) => rows.some((r) => r.role_key === m.key));
    const others = [...playedMains, ...mains.filter((m) => !playedMains.includes(m))].slice(0, 2);
    const players: Player[] = [];
    for (const role of [lead, ...others]) {
      const r = rows.find((x) => x.role_key === role.key);
      if (!r) continue;
      const refs = (await Promise.all([
        r.portrait_bucket && r.portrait_path ? r2SignedDownloadUrl(r.portrait_bucket, r.portrait_path, 3600) : null,
        r.sheet_bucket && r.sheet_path ? r2SignedDownloadUrl(r.sheet_bucket, r.sheet_path, 3600) : null,
      ].map((p) => p?.catch(() => null) ?? null))).filter((u): u is string => !!u);
      if (refs.length) players.push({ role, refs });
    }

    const prompt = posterPrompt(story, lead, others, players);
    const [n] = await sql<{ cover_renders: number }[]>`
      UPDATE drama_stories SET cover_renders = cover_renders + 1 WHERE id = ${storyId} AND cover_renders < ${MAX_POSTERS} RETURNING cover_renders`;
    if (!n) return { ok: false as const, why: `already ${MAX_POSTERS} posters` };
    const input = { prompt, num_images: 1, aspect_ratio: "2:3", resolution: "2K", output_format: "jpeg", safety_tolerance: "6", limit_generations: false };
    let url: string | undefined, model: string;
    if (players.length) {
      const out = await nanoBananaEdit({ ...input, image_urls: players.flatMap((p) => p.refs).slice(0, 8) });
      url = out.data.images?.[0]?.url; model = out.model;
    } else {
      const out = await fal.subscribe(TEXT_TO_IMAGE as "fal-ai/nano-banana-2/edit", { input: input as never });
      url = ((out as { data?: { images?: { url: string }[] } }).data ?? (out as { images?: { url: string }[] })).images?.[0]?.url; model = TEXT_TO_IMAGE;
    }
    if (!url) throw new Error("the model returned no poster");
    const res = await fetch(url);
    if (!res.ok) throw new Error(`poster download failed: ${res.status}`);
    const path = `drama/covers/${storyId}/poster-${Date.now().toString(36)}.jpg`;
    await r2Upload(KEEP_BUCKET, path, Buffer.from(await res.arrayBuffer()), "image/jpeg");
    // The poster keeps the exact prompt, light and grade it was made with.
    const meta = { prompt, light: lightFor(story.genre), model, cast: players.map((p) => p.role.key), fictional: !players.length, at: new Date().toISOString() };
    await sql`UPDATE drama_stories SET cover_bucket = ${KEEP_BUCKET}, cover_path = ${path}, cover_meta = ${sql.json(meta)}, updated_at = now() WHERE id = ${storyId}`;
    return { ok: true as const, path, model };
  });
  return run.locked ? run.value : { ok: false, why: "a poster is already being made" };
}

/** After a lead or main role's member says "this is me", before the story starts: remake the poster with their face. */
export function makePosterSoon(storyId: string, reason: string): void {
  void makePoster(storyId)
    .then(async (r) => {
      console.log(`[drama poster] ${storyId} (${reason}):`, JSON.stringify(r));
      if (r.ok) {
        const [s] = await sql<{ title: string; slug: string }[]>`SELECT title, slug FROM drama_stories WHERE id = ${storyId}`;
        await tellAdmin(`🎞️ <b>${s?.title ?? "A story"}</b> has a new poster (${reason}). /d/drama/${s?.slug ?? ""}`).catch(() => false);
      }
    })
    .catch((e) => console.error(`[drama poster] ${storyId} failed:`, (e as Error).message));
}
