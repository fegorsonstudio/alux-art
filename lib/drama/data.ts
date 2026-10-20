import "server-only";
import sql from "@/lib/db";

/** What the game pages read. Stories are written in tools/drama/stories and loaded by scripts/drama-seed.mjs. */

export type DramaRole = {
  key: string; name: string; age: number; role: string; archetype: string; side: string;
  tier: "lead" | "main" | "cameo"; open: boolean; look: string; want: string; secret: string;
};
export type DramaSlot = { key: string; object: string; slide: number; house: string };
export type DramaEpisode = {
  n: number; title: string; cliff: { type: string };
  choice: { question: string; options: { word: string; label: string }[] };
  slots: DramaSlot[]; alux: { product: string; where: string };
};
export type DramaContent = { cast: DramaRole[]; episodes: DramaEpisode[] };
export type StoryRow = {
  id: string; slug: string; title: string; tagline: string; genre: string; city: string; logline: string;
  status: "upcoming" | "live" | "finished" | "hidden"; featured: boolean; min_votes: number;
  ig_account: string; updated_at: string; content: DramaContent;
};

/** The Instagram account each story plays on, as a profile link and a DM link. */
export const igLinks = (account: string) => ({
  profile: `https://www.instagram.com/${encodeURIComponent(account)}/`,
  dm: `https://ig.me/m/${encodeURIComponent(account)}`,
});

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,59}$/;

export async function shelfStories(): Promise<StoryRow[]> {
  return sql<StoryRow[]>`
    SELECT id, slug, title, tagline, genre, city, logline, status, featured, min_votes, ig_account, updated_at, content
    FROM drama_stories WHERE status <> 'hidden'
    ORDER BY featured DESC, sort, title`;
}

export async function storyBySlug(slug: string): Promise<StoryRow | null> {
  if (!SLUG_RE.test(slug)) return null;
  const [row] = await sql<StoryRow[]>`
    SELECT id, slug, title, tagline, genre, city, logline, status, featured, min_votes, ig_account, updated_at, content
    FROM drama_stories WHERE slug = ${slug} AND status <> 'hidden'`;
  return row ?? null;
}

/** Role keys already taken by a fan (paid or in progress) for these stories. */
export async function takenRoles(storyIds: string[]): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (!storyIds.length) return out;
  const rows = await sql<{ story_id: string; role_key: string }[]>`
    SELECT story_id, role_key FROM drama_cast
    WHERE story_id = ANY(${storyIds}::uuid[]) AND status NOT IN ('rejected', 'withdrawn')`;
  for (const r of rows) {
    if (!out.has(r.story_id)) out.set(r.story_id, new Set());
    out.get(r.story_id)!.add(r.role_key);
  }
  return out;
}

/** Slots already sold for a story, as "episode:slot". */
export async function soldSlots(storyId: string): Promise<Set<string>> {
  const rows = await sql<{ episode_n: number; slot_key: string }[]>`
    SELECT episode_n, slot_key FROM drama_placements
    WHERE story_id = ${storyId} AND status IN ('paid', 'approved', 'placed')`;
  return new Set(rows.map((r) => `${r.episode_n}:${r.slot_key}`));
}

export type DramaPrices = { lead: number; main: number; cameo: number; slot: number };
export async function dramaPrices(): Promise<DramaPrices> {
  const rows = await sql<{ key: string; value: string }[]>`
    SELECT key, value FROM app_config WHERE key IN ('drama_price_lead', 'drama_price_main', 'drama_price_cameo', 'drama_price_slot')`;
  const get = (k: string, d: number) => {
    const n = parseInt(rows.find((r) => r.key === k)?.value ?? "", 10);
    return Number.isFinite(n) && n >= 0 ? n : d;
  };
  return { lead: get("drama_price_lead", 10000), main: get("drama_price_main", 5000), cameo: get("drama_price_cameo", 2000), slot: get("drama_price_slot", 10000) };
}

export type HouseProduct = { title: string; id: string; fromNgn: number };
/** Alux's own products named in stories, resolved to their marketplace pages (public ones only). */
export async function houseProducts(titles: string[]): Promise<Map<string, HouseProduct>> {
  const out = new Map<string, HouseProduct>();
  const uniq = [...new Set(titles.filter(Boolean))];
  if (!uniq.length) return out;
  const rows = await sql<{ id: string; title: string; from_ngn: number | null }[]>`
    SELECT id::text, title, COALESCE(price_1_ngn, price_ngn)::int AS from_ngn FROM templates
    WHERE title = ANY(${uniq}) AND status = 'published' AND NOT COALESCE(is_private, false)`;
  for (const r of rows) out.set(r.title, { title: r.title, id: r.id, fromNgn: r.from_ngn ?? 0 });
  return out;
}

export const badgeFor = (s: Pick<StoryRow, "status">) =>
  s.status === "live" ? "Now showing" : s.status === "finished" ? "Complete" : "Coming soon";
