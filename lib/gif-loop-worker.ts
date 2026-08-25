import "server-only";
import sql from "@/lib/db";
import { r2Download, r2Upload } from "@/lib/r2";
import { renderGif } from "@/lib/gif-loop";

/**
 * The `gif_loop` generation fork.
 *
 * Kept in its own file rather than inlined into lib/generate.ts. That file is
 * 3,500 lines and drives every paid render in the business; this job shares
 * nothing with it — no identity analysis, no planner, no brief, no fal call at
 * all — so the only thing it needs from there is to be handed the shoot and
 * left alone. generate.ts gains four lines and no new branching inside the
 * loop that produces photographs.
 *
 * The buyer supplies two pictures, a headline and their logo. The output is one
 * animated GIF, white-label: nothing of Alux Art's appears in it, because a
 * business will not post an asset carrying somebody else's mark.
 */

type Ref = {
  purpose: string; tag: string | null;
  storage_bucket: string | null; storage_path: string | null;
};

export type GifLoopResult = { ok: true; bytes: number } | { ok: false; error: string };

/** What the checkout wrote into `shoots.enhance` for this category. */
export type GifLoopSelection = {
  headline?: string;
  kicker?: string;
  /** The buyer's own address, held on screen after the reveal. */
  website?: string;
  beforePath?: string;
  afterPath?: string;
  logoPath?: string;
};

const grab = async (bucket: string | null, path: string | null): Promise<Buffer | null> => {
  if (!bucket || !path) return null;
  return r2Download(bucket, path).then(r => r.buffer).catch(() => null);
};

/**
 * Build the GIF and complete the shoot's single slot.
 *
 * Returns rather than throws: a thrown error inside the worker marks a paid
 * shoot FAILED with no explanation, and the caller already knows how to record
 * one properly.
 */
export async function runGifLoop(
  shootId: string,
  userId: string,
  selection: GifLoopSelection,
  refs: Ref[],
): Promise<GifLoopResult> {
  const [slot] = await sql<{ id: string }[]>`
    SELECT id FROM shoot_images WHERE shoot_id = ${shootId} ORDER BY slot LIMIT 1`;
  if (!slot) return { ok: false, error: "no slot on this shoot" };

  // Paths come from the selection where checkout put them, and the tagged
  // references are the fallback — the same belt-and-braces the other forks use,
  // because a booking that lost one and kept the other should still produce
  // something rather than nothing.
  const byTag = (t: string) => refs.find(r => r.tag === t) ?? null;
  const beforeRef = byTag("GIF_BEFORE");
  const afterRef = byTag("GIF_AFTER");
  const logoRef = byTag("BRAND_LOGO");

  const before =
    (await grab("identity-images", selection.beforePath ?? null)) ??
    (await grab(beforeRef?.storage_bucket ?? null, beforeRef?.storage_path ?? null));
  const after =
    (await grab("identity-images", selection.afterPath ?? null)) ??
    (await grab(afterRef?.storage_bucket ?? null, afterRef?.storage_path ?? null));

  if (!before || !after) {
    return { ok: false, error: "the before or after image could not be read" };
  }

  const logo =
    (await grab("identity-images", selection.logoPath ?? null)) ??
    (await grab(logoRef?.storage_bucket ?? null, logoRef?.storage_path ?? null)) ??
    undefined;

  let gif: Buffer;
  try {
    gif = await renderGif({
      before,
      after,
      headline: (selection.headline ?? "Before and after").slice(0, 60),
      kicker: selection.kicker?.slice(0, 60),
      logo: logo ?? undefined,
      // The end card carries the BUYER's website and nothing else. Alux Art's
      // name never appears in a file somebody paid for — that is the decision
      // that makes this worth buying — but their own address, said once after
      // the transformation has landed, is the whole point of posting it.
      endCard: selection.website?.trim() || undefined,
    });
  } catch (e) {
    return { ok: false, error: (e as Error).message.slice(0, 300) };
  }

  const path = `${userId}/${shootId}/loop.gif`;
  try {
    await r2Upload("generated-4k", path, gif, "image/gif");
  } catch (e) {
    return { ok: false, error: `upload failed: ${(e as Error).message}`.slice(0, 300) };
  }

  await sql`UPDATE shoot_images SET
    status = 'COMPLETE',
    file_size = ${gif.byteLength},
    download_file_size = ${gif.byteLength},
    stage = 'Loop rendered',
    provider = 'gif-loop',
    configured_model = 'sharp+ffmpeg',
    preview_storage_bucket = 'generated-4k',
    preview_storage_path = ${path},
    download_storage_bucket = 'generated-4k',
    download_storage_path = ${path},
    updated_at = NOW()
    WHERE id = ${slot.id}`;

  console.log(`[gif-loop] ${shootId.slice(0, 8)} rendered ${(gif.byteLength / 1048576).toFixed(2)}MB`);
  return { ok: true, bytes: gif.byteLength };
}
