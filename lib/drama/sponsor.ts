import "server-only";
import path from "node:path";
import sql from "@/lib/db";
import { r2Exists, r2SignedDownloadUrl } from "@/lib/r2";

/**
 * What a season sponsor gets (owner, 2026-10-25, "step one"): their name on
 * every episode approved after they paid — the cover slide, the last slide and
 * the caption ("Presented by …") — and a private page with every episode's
 * files to download or post on their own page: the slides, the caption, the
 * cover video with the soundtrack and the soundtrack itself.
 */

export type Presenter = { id: string; brand_name: string };

/** The paid sponsor of a story's first season, if any. */
export async function presenterFor(storyId: string): Promise<Presenter | null> {
  const [r] = await sql<Presenter[]>`
    SELECT id, brand_name FROM drama_sponsorships
    WHERE story_id = ${storyId} AND season = 1 AND status IN ('paid', 'producing', 'delivered')
    ORDER BY paid_at NULLS LAST LIMIT 1`;
  return r ?? null;
}

export type SponsorshipRow = {
  id: string; story_id: string; brand_name: string; contact_name: string; contact_email: string; user_id: string | null;
  format: string; price_ngn: number; status: string; paid_at: string | null; created_at: string;
  slug: string; title: string; tagline: string; city: string; story_status: string; ig_account: string;
};

/** A sponsorship as seen by its sponsor (the signed-in user who paid) or an admin; null for anyone else. */
export async function sponsorshipForViewer(id: string, viewer: { id: string; admin: boolean } | null): Promise<SponsorshipRow | null> {
  if (!/^[0-9a-f-]{36}$/.test(id) || !viewer) return null;
  const [r] = await sql<SponsorshipRow[]>`
    SELECT sp.id, sp.story_id, sp.brand_name, sp.contact_name, sp.contact_email, sp.user_id, sp.format, sp.price_ngn, sp.status, sp.paid_at, sp.created_at,
           s.slug, s.title, s.tagline, s.city, s.status AS story_status, s.ig_account
    FROM drama_sponsorships sp JOIN drama_stories s ON s.id = sp.story_id WHERE sp.id = ${id}`;
  if (!r) return null;
  if (!viewer.admin && r.user_id !== viewer.id) return null;
  return r;
}

export type EpisodeFiles = {
  id: string; n: number; title: string; status: string; posted_at: string | null; ig_media_id: string | null;
  caption: string; slides: string[]; coverVideo: string | null; soundtrack: string | null; presentedBy: string | null;
};

/**
 * Every made episode of a story with where its files are. Slides and caption
 * come from the publisher's queue row; the cover video from the soundtrack job
 * (ready or preview); the soundtrack mix sits next to it when it was made.
 */
export async function episodeFiles(storyId: string): Promise<EpisodeFiles[]> {
  const rows = await sql<{
    id: string; n: number; status: string; posted_at: string | null; ig_media_id: string | null;
    content: { title: string; caption?: string; presentedBy?: string };
    q_caption: string | null; slide_paths: string[] | null; cover_video_path: string | null; sound_video: string | null;
  }[]>`
    SELECT e.id, e.n, e.status, e.posted_at, e.ig_media_id, e.content,
           c.caption AS q_caption, c.slide_paths, c.cover_video_path, d.video_path AS sound_video
    FROM drama_episodes e
    LEFT JOIN scheduled_carousels c ON c.local_id = 'drama-' || e.id::text
    LEFT JOIN drama_sound d ON d.episode_id = e.id AND d.status IN ('ready', 'skipped')
    WHERE e.story_id = ${storyId} AND e.status IN ('ready', 'posted', 'closed')
    ORDER BY e.n`;
  const out: EpisodeFiles[] = [];
  for (const r of rows) {
    const coverVideo = r.cover_video_path ?? r.sound_video ?? null;
    let soundtrack: string | null = null;
    if (coverVideo) {
      const mix = path.posix.join(path.posix.dirname(coverVideo), "mix.m4a");
      soundtrack = (await r2Exists("generated-4k", mix).catch(() => false)) ? mix : null;
    }
    out.push({
      id: r.id, n: r.n, title: r.content.title, status: r.status, posted_at: r.posted_at, ig_media_id: r.ig_media_id,
      caption: r.q_caption ?? r.content.caption ?? "", slides: r.slide_paths ?? [], coverVideo, soundtrack,
      presentedBy: r.content.presentedBy ?? null,
    });
  }
  return out;
}

/** Seven-day links for one episode's files, for the files page. */
export async function episodeLinks(ep: EpisodeFiles): Promise<{ slides: string[]; coverVideo: string | null; soundtrack: string | null }> {
  const sign = (p: string | null) => (p ? r2SignedDownloadUrl("generated-4k", p, 7 * 24 * 3600).catch(() => null) : Promise.resolve(null));
  const [slides, coverVideo, soundtrack] = await Promise.all([
    Promise.all(ep.slides.map(sign)), sign(ep.coverVideo), sign(ep.soundtrack),
  ]);
  return { slides: slides.filter((x): x is string => !!x), coverVideo, soundtrack };
}

export const sponsorFilesPath = (id: string) => `/d/drama/sponsor/${id}`;
