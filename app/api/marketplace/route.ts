import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { r2ProxyUrl } from "@/lib/r2";

const CACHE_TTL_MS = 60_000;
const marketplaceCache = (globalThis as any).__MARKETPLACE_CACHE ||= new Map();

/**
 * Words too common in this catalogue to narrow anything. Every template is a
 * photo template, so matching on "photo" is the same as matching on nothing.
 */
const SEARCH_STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "for", "with", "in", "on", "to",
  "my", "me", "your", "photo", "photos", "picture", "pictures", "image",
  "images", "template", "templates", "shoot", "shoots",
]);

/**
 * Split a query into useful terms.
 *
 * Anything under 3 characters is dropped: a 2-letter substring matches most of
 * the catalogue, so it adds noise and no signal. Single-word queries keep
 * whatever they have (a search for "ID" should still try) and short words are
 * only stripped when there is something longer to search with.
 */
function searchTerms(raw: string): string[] {
  const all = raw.toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean);
  const useful = all.filter((w) => w.length >= 3 && !SEARCH_STOPWORDS.has(w));
  return (useful.length ? useful : all).slice(0, 8);
}

/**
 * Words buyers use that the catalogue does not.
 *
 * Nothing in the catalogue is titled "headshot", so a photographer searching
 * the most ordinary word in their trade used to get an empty page. These are
 * expansions, not corrections: the typed words still decide the ranking, and a
 * synonym-only hit scores low enough that it can never outrank a real match.
 *
 * Keep this short and defensible. A wrong synonym is worse than a missing one.
 */
const SEARCH_SYNONYMS: Record<string, string[]> = {
  headshot: ["portrait", "corporate", "professional"],
  headshots: ["portrait", "corporate", "professional"],
  passport: ["portrait", "corporate"],
  linkedin: ["corporate", "professional", "portrait"],
  profile: ["portrait", "corporate"],
  relight: ["lighting", "upgrade", "light"],
  relighting: ["lighting", "upgrade", "light"],
  lighting: ["light", "upgrade"],
  graduation: ["induction", "nursing", "convocation"],
  convocation: ["graduation", "induction"],
  lawyer: ["bar", "wig", "call"],
  law: ["bar", "wig"],
  nurse: ["nursing", "induction"],
  suit: ["corporate", "boardroom", "editorial"],
  office: ["corporate", "boardroom"],
  business: ["corporate", "boardroom"],
  wedding: ["bridal", "traditional", "gown"],
  bride: ["bridal", "gown", "traditional"],
  dress: ["gown", "traditional"],
  makeup: ["beauty", "glam"],
  background: ["backdrop"],
  backdrop: ["background"],
};

/** Expansions for the typed words, minus anything the buyer already typed. */
function synonymsFor(terms: string[]): string[] {
  const typed = new Set(terms);
  const out = new Set<string>();
  for (const t of terms) for (const s of SEARCH_SYNONYMS[t] ?? []) if (!typed.has(s)) out.add(s);
  return [...out].slice(0, 12);
}

/**
 * Escape a term for use inside a Postgres regex.
 *
 * Ranking uses `\y` (word boundary) to tell a word from a coincidental
 * substring: without it "grad" scores "Pro Studio Upgrade" as an exact hit, and
 * "old" scores "Gold Tapestry". A buyer typing either means neither.
 */
function reEscape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
}

/** Join fragments with a fixed operator — postgres.js nests fragments safely. */
function joinSql(parts: any[], op: "OR" | "+") {
  return parts.reduce((acc, part, i) =>
    i === 0 ? part : op === "OR" ? sql`${acc} OR ${part}` : sql`${acc} + ${part}`);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const category = searchParams.get("category");
  const search = searchParams.get("q");
  const cursor = searchParams.get("cursor");
  const limit = Math.min(Number(searchParams.get("limit") ?? 24), 48);
  const isStoryFilter = searchParams.get("isStory") === "true";
  const storyType = searchParams.get("storyType"); // solo | duo | group
  const cacheKey = `category:${category ?? "all"}|search:${search ?? ""}|cursor:${cursor ?? ""}|limit:${limit}|story:${isStoryFilter}|storyType:${storyType ?? ""}`;

  const cached = marketplaceCache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return NextResponse.json(cached.payload);
  }

  // Search matches on any single word, anywhere in the template's text — title,
  // description, category, tags or creator name. Requiring every word would
  // mean "nursing graduation" finds nothing when the template is called
  // "Nursing Induction"; requiring the whole phrase in the title, which is what
  // this used to do, meant a buyer had to already know the name to find it.
  // Recall comes from the OR; precision comes back from the ranking below.
  const terms = search ? searchTerms(search) : [];
  const searching = terms.length > 0;
  const synonyms = searching ? synonymsFor(terms) : [];

  const anyFieldMatches = (w: string) => {
    const like = `%${w}%`;
    return sql`(t.title ILIKE ${like} OR t.description ILIKE ${like}
                OR t.category ILIKE ${like} OR c.display_name ILIKE ${like}
                OR EXISTS (SELECT 1 FROM unnest(t.tags) tg WHERE tg ILIKE ${like}))`;
  };

  const matchClause = searching
    ? joinSql([...terms, ...synonyms].map(anyFieldMatches), "OR")
    : null;

  // Where a word is found decides how much it counts. A title hit is what the
  // buyer meant; a description hit is a maybe. Whole-phrase title matches sit
  // above everything so an exact name is never buried under loose relatives.
  const scoreClause = searching
    ? joinSql([
        sql`(CASE WHEN t.title ~* ${"\\y" + reEscape(search ?? "")} THEN 100 ELSE 0 END)`,
        ...terms.flatMap((w) => {
          const like = `%${w}%`;
          const atWordStart = `\\y${reEscape(w)}`;
          return [
            // A word in the title is a strong signal. The same letters buried
            // inside another word ("old" in "Gold") are worth almost nothing —
            // they still match, so the template is not lost, but they must not
            // outrank a template that genuinely describes what was asked for.
            sql`(CASE WHEN t.title ~* ${atWordStart} THEN 14 WHEN t.title ILIKE ${like} THEN 3 ELSE 0 END)`,
            sql`(CASE WHEN EXISTS (SELECT 1 FROM unnest(t.tags) tg WHERE tg ILIKE ${like}) THEN 6 ELSE 0 END)`,
            sql`(CASE WHEN t.category ILIKE ${like} THEN 4 ELSE 0 END)`,
            sql`(CASE WHEN t.description ILIKE ${like} THEN 2 ELSE 0 END)`,
            sql`(CASE WHEN c.display_name ILIKE ${like} THEN 2 ELSE 0 END)`,
          ];
        }),
        // A synonym is a guess about what the buyer meant, so it is worth just
        // enough to lift a template above nothing at all.
        ...synonyms.map((w) => {
          const like = `%${w}%`;
          return sql`(CASE WHEN t.title ILIKE ${like} THEN 3
                           WHEN t.category ILIKE ${like} THEN 2
                           WHEN t.description ILIKE ${like}
                             OR EXISTS (SELECT 1 FROM unnest(t.tags) tg WHERE tg ILIKE ${like}) THEN 1
                           ELSE 0 END)`;
        }),
      ], "+")
    : null;

  // Relevance order and a created_at cursor cannot both be true, so a search
  // pages by offset instead. The cursor is opaque to the client — it just hands
  // back whatever nextCursor it was given.
  const searchOffset = searching ? Math.max(0, Number(cursor) || 0) : 0;

  const rows = await sql`
    SELECT t.id, t.creator_id, t.title, t.description, t.category, t.tags,
           t.price_ngn, t.shoot_mode, t.aspect_ratio, t.package_size, t.purchase_count,
           t.cover_storage_path, t.cover_bucket, t.created_at,
           t.avg_rating, t.rating_count, t.is_story, t.story_type,
           CASE
             WHEN jsonb_typeof(t.scenes) = 'array' THEN jsonb_array_length(t.scenes)
             WHEN jsonb_typeof(t.scenes) = 'string' THEN jsonb_array_length((t.scenes #>> '{}')::jsonb)
             ELSE 0
           END AS scene_count,
           t.price_1_ngn, t.price_5_ngn,
           c.id AS c_id, c.display_name AS c_display_name,
           c.avatar_storage_path AS c_avatar_path, c.avatar_bucket AS c_avatar_bucket
           ${scoreClause ? sql`, (${scoreClause}) AS relevance` : sql``}
    FROM templates t
    LEFT JOIN creators c ON c.id = t.creator_id
    WHERE t.status = 'published'
      AND t.is_private = false
      -- Creator-imported resales live in the creator's own store, not ours.
      AND t.marketplace_hidden = false
      AND t.is_story = ${isStoryFilter}
      ${category && category !== "all" ? sql`AND t.category = ${category}` : sql``}
      ${matchClause ? sql`AND (${matchClause})` : sql``}
      ${storyType ? sql`AND t.story_type = ${storyType}` : sql``}
      ${cursor && !searching ? sql`AND t.created_at < ${cursor}` : sql``}
    ORDER BY ${searching ? sql`relevance DESC,` : sql``} t.created_at DESC
    LIMIT ${limit + 1}
    ${searching ? sql`OFFSET ${searchOffset}` : sql``}
  `;

  const hasMore = rows.length > limit;
  const slice = rows.slice(0, limit);

  const templates = await Promise.all(slice.map(async (t) => {
    const coverUrl = t.cover_storage_path
      ? r2ProxyUrl(t.cover_bucket ?? "template-images", t.cover_storage_path as string)
      : null;

    const avatarUrl = t.c_avatar_path
      ? r2ProxyUrl(t.c_avatar_bucket ?? "template-images", t.c_avatar_path as string)
      : null;

    return {
      id: t.id,
      creatorId: t.creator_id,
      creator: t.c_id ? { id: t.c_id, displayName: t.c_display_name, avatarUrl } : null,
      title: t.title,
      description: t.description,
      category: t.category,
      tags: t.tags ?? [],
      priceNgn: t.price_ngn,
      shootMode: t.shoot_mode,
      aspectRatio: t.aspect_ratio,
      packageSize: t.package_size,
      purchaseCount: t.purchase_count,
      avgRating: t.avg_rating ?? null,
      ratingCount: t.rating_count ?? 0,
      isStory: t.is_story ?? false,
      storyType: t.story_type ?? null,
      sceneCount: t.scene_count ?? 0,
      price1Ngn: t.price_1_ngn != null ? Number(t.price_1_ngn) : null,
      price5Ngn: t.price_5_ngn != null ? Number(t.price_5_ngn) : null,
      coverUrl,
      createdAt: t.created_at,
    };
  }));

  const nextCursor = !hasMore
    ? null
    : searching
      ? String(searchOffset + slice.length) // offset paging, see above
      : slice[slice.length - 1]?.created_at;
  const payload = { templates, nextCursor };
  marketplaceCache.set(cacheKey, { payload, expiry: Date.now() + CACHE_TTL_MS });
  return NextResponse.json(payload);
}
