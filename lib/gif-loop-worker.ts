import "server-only";
import sql from "@/lib/db";
import { r2Download, r2Upload } from "@/lib/r2";
import { renderLoop } from "@/lib/gif-loop";

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

  // FOUR FILES, from two compositions.
  //
  // Landscape for a feed, a comment and GIPHY; portrait for a story and a reel.
  // Each shape is composited once and encoded twice, because the frames are the
  // expensive half and the two encoders can share them. A buyer who has paid
  // for a loop should not have to crop it themselves to post it in the place
  // they were always going to post it.
  const common = {
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
  };

  type Output = { ratio: "16:9" | "9:16"; ext: "gif" | "mp4"; type: string; bytes: Buffer };
  const outputs: Output[] = [];
  try {
    for (const ratio of ["16:9", "9:16"] as const) {
      // Composited at video resolution; encodeGif scales its own copy down.
      // The MP4 keeps the full frame; the GIF is cut down, harder in portrait
      // because a tall 720-wide GIF lands at ~3MB and a comment thumbnail shows
      // it at a couple of hundred pixels either way.
      const { gif, mp4 } = await renderLoop(
        { ...common, ratio, width: ratio === "16:9" ? 1280 : 720 },
        ratio === "16:9" ? 960 : 540,
      );
      outputs.push({ ratio, ext: "mp4", type: "video/mp4", bytes: mp4 });
      outputs.push({ ratio, ext: "gif", type: "image/gif", bytes: gif });
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message.slice(0, 300) };
  }

  // Slot 1 is the landscape GIF: it is what the download page previews, what
  // the chat pollers send, and what the studio grid leads with. The rest follow
  // in slots of their own so each gets its own download token and its own row
  // in the ZIP.
  const order = ["16:9-gif", "16:9-mp4", "9:16-mp4", "9:16-gif"];
  outputs.sort((a, b) => order.indexOf(`${a.ratio}-${a.ext}`) - order.indexOf(`${b.ratio}-${b.ext}`));

  const label = (o: Output) => `${o.ratio === "16:9" ? "landscape" : "portrait"}-${o.ext}`;
  const paths: string[] = [];
  try {
    for (const o of outputs) {
      const p = `${userId}/${shootId}/loop-${label(o)}.${o.ext}`;
      await r2Upload("generated-4k", p, o.bytes, o.type);
      paths.push(p);
    }
  } catch (e) {
    return { ok: false, error: `upload failed: ${(e as Error).message}`.slice(0, 300) };
  }

  // The booking created one slot. The other three are made here, because only
  // the renderer knows how many files a loop turns out to be.
  const rows = await sql<{ id: string; slot: number }[]>`
    SELECT id, slot FROM shoot_images WHERE shoot_id = ${shootId} ORDER BY slot`;
  for (let i = rows.length; i < outputs.length; i++) {
    const [made] = await sql<{ id: string; slot: number }[]>`
      INSERT INTO shoot_images (id, shoot_id, user_id, slot, status, created_at, updated_at)
      VALUES (${crypto.randomUUID()}, ${shootId}, ${userId}, ${i + 1}, 'PENDING', NOW(), NOW())
      RETURNING id, slot`;
    rows.push(made);
  }

  for (let i = 0; i < outputs.length; i++) {
    const o = outputs[i];
    await sql`UPDATE shoot_images SET
      status = 'COMPLETE',
      kind = ${label(o)},
      file_size = ${o.bytes.byteLength},
      download_file_size = ${o.bytes.byteLength},
      stage = ${`Loop rendered (${label(o)})`},
      provider = 'gif-loop',
      configured_model = 'sharp+ffmpeg',
      preview_storage_bucket = 'generated-4k',
      preview_storage_path = ${paths[i]},
      download_storage_bucket = 'generated-4k',
      download_storage_path = ${paths[i]},
      updated_at = NOW()
      WHERE id = ${rows[i].id}`;
  }

  const total = outputs.reduce((n, o) => n + o.bytes.byteLength, 0);
  console.log(`[gif-loop] ${shootId.slice(0, 8)} rendered ${outputs.length} files, ${(total / 1048576).toFixed(2)}MB: ${outputs.map(label).join(", ")}`);
  return { ok: true, bytes: total };
}
