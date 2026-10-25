/**
 * What a micro drama costs to make, and what we charge (owner, 2026-10-25).
 *
 *   estimated cost of every paid call
 *   + 50 % — the retake buffer, "in case some images or videos don't generate well"
 *   = production cost
 *   × 5    — the price: 400 % profit on the production cost
 *
 * Pure arithmetic, no imports: the website (lib/drama/budget-rates.ts reads the
 * owner's overrides from app_config), the sponsor page and the command line
 * (`node tools/drama/budget.mjs <story>`) all use this one file, so a sponsor
 * sees the same figure the owner sees.
 *
 * Rates are USD per unit. They are the public prices read on 2026-10-25 and
 * are meant to be checked against real invoices (fal_rate_card, DeepSeek usage):
 *   fal-ai/nano-banana-2/edit   $0.08 at 1K, ×1.5 at 2K, ×2 at 4K   (fal.ai model page)
 *   fal-ai/nano-banana-pro/edit $0.15                               (fal.ai/pricing)
 *   Gemini 3.8 TTS take          ~$0.003   (tools/drama/sound/engine.mjs PRICE)
 *   Lyria 3 Pro piece            ~$0.08
 *   Gemini 3.1 Pro director call ~$0.012
 *   DeepSeek flash               $0.30 / $1.20 per million tokens in / out (peak, cache miss)
 *   Seedance 2 via fal           $0.014 per 1,000 video tokens — a PLACEHOLDER per second
 *                                until the first real clip is billed (video is phase 3)
 */

export type BudgetRates = {
  /** USD per image from fal-ai/nano-banana-2/edit at 1K, 2K and 4K. */
  image1k: number; image2k: number; image4k: number;
  /** USD per spoken take, per music piece, per director/release listen. */
  tts: number; music: number; director: number;
  /** USD per million DeepSeek tokens in and out. */
  brainIn: number; brainOut: number;
  /** USD per second of generated video (phase 3). */
  videoPerSecond: number;
  /** Naira per US dollar. */
  usdNgn: number;
  /** The retake buffer and the profit, in percent of cost. */
  bufferPct: number; profitPct: number;
};

export const DEFAULT_RATES: BudgetRates = {
  image1k: 0.08, image2k: 0.12, image4k: 0.16,
  tts: 0.003, music: 0.08, director: 0.012,
  brainIn: 0.3, brainOut: 1.2,
  videoPerSecond: 0.35,
  usdNgn: 1600,
  bufferPct: 50, profitPct: 400,
};

/** How the episodes are made. Carousels first, then pictures, then video (owner's order). */
export type DramaFormat = "carousel" | "pictures" | "video";

export type SeasonSpec = {
  format: DramaFormat;
  /** Episodes that will actually post (one road each) — not the drafts written ahead. */
  episodes: number;
  /** Cast members who get a character sheet + portrait (fans and house characters alike). */
  castSheets: number;
  /** Picture slides per episode that need a generated picture (slides 2–7 = 6; the cover reuses the poster). */
  pictureSlides: number;
  /** Posters for the story (key art). */
  posters: number;
  /** Seconds of video per episode in the video format. */
  videoSecondsPerEpisode: number;
  /** Clips per episode the video is cut from (each clip is one generation). */
  videoClipsPerEpisode: number;
  /** A 30-second soundtrack per episode (tools/drama/sound). */
  soundtrack: boolean;
  /** Images at this size; 2K is what Instagram needs. */
  imageSize: "1k" | "2k" | "4k";
};

export const DEFAULT_SPEC: SeasonSpec = {
  format: "carousel",
  episodes: 6,
  castSheets: 6,
  pictureSlides: 6,
  posters: 1,
  videoSecondsPerEpisode: 60,
  videoClipsPerEpisode: 2,
  soundtrack: true,
  imageSize: "2k",
};

export type BudgetLine = { item: string; qty: number; unit: string; unitUsd: number; usd: number };
export type Budget = {
  spec: SeasonSpec;
  lines: BudgetLine[];
  costUsd: number;
  bufferUsd: number;
  productionUsd: number;
  profitUsd: number;
  priceUsd: number;
  priceNgn: number;
  perEpisodeUsd: number;
  perEpisodePriceNgn: number;
  rates: BudgetRates;
};

// Per-episode call counts, from how the tools actually run.
// Sound v2 (engine.mjs): narrator 6 takes + up to 4 retakes, each character block 4 + 3; a typical
// episode has 1–2 character stabs → about 18 takes; 2 Lyria pieces (score + scene); the director
// judges every take (18) + the release check (1).
const SOUND = { takes: 18, music: 2, director: 19 };
// The brain: writing one episode on every road + the picture prompts, with the skills attached
// (~60k tokens in, ~12k out), plus one check/repair round.
const BRAIN_PER_EPISODE = { input: 90_000, output: 16_000 };
// A character: the sheet, the portrait, and the cap allows one remake (lib/drama/character.ts
// MAX_RENDERS = 6; the buffer below covers the rest).
const SHEET_IMAGES = 2;
// Posters: up to 3 tries are allowed (cover_renders); budget 1 and let the buffer cover retries.

const r2 = (n: number) => Math.round(n * 100) / 100;

export function estimateSeason(input: Partial<SeasonSpec> = {}, rateInput: Partial<BudgetRates> = {}): Budget {
  const spec: SeasonSpec = { ...DEFAULT_SPEC, ...input };
  const rates: BudgetRates = { ...DEFAULT_RATES, ...rateInput };
  const img = spec.imageSize === "4k" ? rates.image4k : spec.imageSize === "1k" ? rates.image1k : rates.image2k;
  const lines: BudgetLine[] = [];
  const add = (item: string, qty: number, unit: string, unitUsd: number) => {
    if (qty <= 0) return;
    lines.push({ item, qty, unit, unitUsd, usd: r2(qty * unitUsd) });
  };

  add("Character sheets and portraits (fal-ai/nano-banana-2/edit)", spec.castSheets * SHEET_IMAGES, "image", img);
  add("Poster key art (fal-ai/nano-banana-2/edit)", spec.posters, "image", img);
  if (spec.format !== "carousel") {
    add("Episode pictures (fal-ai/nano-banana-2/edit)", spec.episodes * spec.pictureSlides, "image", img);
  }
  if (spec.format === "video") {
    add("Video clips (Seedance via fal)", spec.episodes * spec.videoSecondsPerEpisode, "second", rates.videoPerSecond);
  }
  if (spec.soundtrack) {
    add("Voice takes (Gemini TTS)", spec.episodes * SOUND.takes, "take", rates.tts);
    add("Score and scene sound (Lyria 3 Pro)", spec.episodes * SOUND.music, "piece", rates.music);
    add("Voice director and release check (Gemini 3.1 Pro)", spec.episodes * SOUND.director, "listen", rates.director);
  }
  const tokIn = spec.episodes * BRAIN_PER_EPISODE.input, tokOut = spec.episodes * BRAIN_PER_EPISODE.output;
  add("Writing: story, scenes and prompts (DeepSeek) — input", tokIn / 1e6, "M tokens", rates.brainIn);
  add("Writing: story, scenes and prompts (DeepSeek) — output", tokOut / 1e6, "M tokens", rates.brainOut);

  const costUsd = r2(lines.reduce((s, l) => s + l.usd, 0));
  const bufferUsd = r2(costUsd * rates.bufferPct / 100);
  const productionUsd = r2(costUsd + bufferUsd);
  const profitUsd = r2(productionUsd * rates.profitPct / 100);
  const priceUsd = r2(productionUsd + profitUsd);
  const priceNgn = roundNaira(priceUsd * rates.usdNgn);
  return {
    spec, lines, costUsd, bufferUsd, productionUsd, profitUsd, priceUsd, priceNgn,
    perEpisodeUsd: spec.episodes ? r2(productionUsd / spec.episodes) : 0,
    perEpisodePriceNgn: spec.episodes ? roundNaira(priceNgn / spec.episodes) : 0,
    rates,
  };
}

/** Prices people see end in round hundreds of naira. */
export const roundNaira = (n: number) => Math.ceil(n / 100) * 100;

/** The season spec a story's own content implies. */
export function specForStory(
  story: { content?: { cast?: unknown[]; episodes?: unknown[]; drafts?: { n?: number }[] } },
  format: DramaFormat = "carousel",
  overrides: Partial<SeasonSpec> = {},
): SeasonSpec {
  const cast = story.content?.cast ?? [];
  const posted = story.content?.episodes?.length ?? 0;
  const lastDraft = Math.max(0, ...((story.content?.drafts ?? []).map((d) => d.n ?? 0)));
  // A season is as long as the furthest episode written on any road.
  const episodes = Math.max(posted, lastDraft, 1);
  return { ...DEFAULT_SPEC, format, episodes, castSheets: cast.length, ...overrides };
}

export const fmtUsd = (n: number) => `$${n.toFixed(2)}`;
export const fmtNgn = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;
