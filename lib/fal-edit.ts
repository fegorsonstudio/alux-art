import { fal } from "@fal-ai/client";
import sql from "@/lib/db";

/**
 * The image-editing model every photo goes through, in one place.
 *
 * Nano Banana Pro (fal-ai/nano-banana-pro/edit) is the default since
 * 2026-10-18 (the owner's call): safety_tolerance "6" (the least strict of
 * 1–6), 4K unless a caller asks for less. Nano Banana 2 stays as the fallback
 * for Pro and 2.1: if fal refuses the REQUEST (no access, endpoint gone) the
 * photo is made on 2 instead of failing a buyer who has already paid. A
 * CONTENT refusal is not an access problem and is thrown as it was — the
 * callers already have their own rewording steps for those.
 *
 * Admin → "Generation model" picks (app_config.generation_model):
 * "nano-banana-pro" (or unset) = Pro, "nano-banana-2.1" = 2.1, "nano-banana"
 * = 2. Seedream has its own path in generate.ts; the helpers that only ever
 * used nano-banana follow the switch.
 */

fal.config({ credentials: process.env.FAL_KEY ?? process.env.FAL_API_KEY ?? "" });

export const NANO_BANANA_PRO = "fal-ai/nano-banana-pro/edit";
export const NANO_BANANA_21 = "google/nano-banana-2.1/edit";
export const NANO_BANANA_2 = "fal-ai/nano-banana-2/edit";

type FalOutput = { images?: Array<{ url: string }> };

let cached: { model: string; at: number } | null = null;

/** The nano-banana the admin switch asks for (read at most once a minute). */
export async function nanoBananaModel(): Promise<string> {
  if (cached && Date.now() - cached.at < 60_000) return cached.model;
  let model = NANO_BANANA_PRO;
  try {
    const [row] = await sql<{ value: string }[]>`SELECT value FROM app_config WHERE key = 'generation_model'`;
    if (row?.value === "nano-banana") model = NANO_BANANA_2;
    else if (row?.value === "nano-banana-2.1") model = NANO_BANANA_21;
  } catch { /* the default stands */ }
  cached = { model, at: Date.now() };
  return model;
}

/** True when fal turned the PROMPT or IMAGE down, as opposed to the request. */
function isContentRefusal(err: unknown): boolean {
  const e = err as { message?: string; body?: unknown };
  const text = `${e?.message ?? ""} ${e?.body ? JSON.stringify(e.body) : ""}`.toLowerCase();
  return /content_policy|content policy|content checker|moderation|safety|nsfw|prohibited/.test(text);
}

// After fal refuses a model itself (no access), stop asking it for ten
// minutes so every photo in a shoot is not slowed by a request that cannot succeed.
const deniedUntil: Record<string, number> = {};

/**
 * One nano-banana edit. `input` is the same body both models take; 2.1 has no
 * "0.5K", so that becomes "1K" there. Returns fal's output and the model that
 * actually made the image, which is what the cost records must name.
 */
export async function nanoBananaEdit(
  input: Record<string, unknown>,
  model?: string,
): Promise<{ data: FalOutput; model: string }> {
  const want = model ?? (await nanoBananaModel());
  const unwrap = (r: unknown) => (((r as Record<string, unknown>).data || r) as FalOutput);

  if ((want === NANO_BANANA_PRO || want === NANO_BANANA_21) && Date.now() >= (deniedUntil[want] ?? 0)) {
    // Neither Pro nor 2.1 has "0.5K"; that becomes "1K" there.
    const inputHi = input.resolution === "0.5K" ? { ...input, resolution: "1K" } : input;
    try {
      // Cast: the installed client's types predate these endpoints.
      const r = await fal.subscribe(want as "fal-ai/nano-banana-2/edit", { input: inputHi as never });
      return { data: unwrap(r), model: want };
    } catch (err) {
      if (isContentRefusal(err)) throw err;
      const e = err as { message?: string; status?: number; body?: unknown };
      if (e?.status === 401 || e?.status === 403 || e?.status === 404) deniedUntil[want] = Date.now() + 10 * 60_000;
      console.warn(`[fal] ${want} failed (${e?.status ?? "?"} ${e?.message ?? String(err)}`.slice(0, 300) +
        `${e?.body ? " — " + JSON.stringify(e.body).slice(0, 300) : ""}) — making this one on ${NANO_BANANA_2}`);
    }
  }

  const r = await fal.subscribe(NANO_BANANA_2, { input: input as never });
  return { data: unwrap(r), model: NANO_BANANA_2 };
}
