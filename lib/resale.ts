/**
 * Creator resale of a studio template.
 *
 * A creator imports The Gear Equalizer into their own store. Their copy is a
 * real template row they own — own id, own link, own price — but its 195
 * lighting looks are NOT copied. It carries `source_template_id`, and the looks
 * are resolved from the source at read time. That is what keeps every importer
 * current: a look added to the source appears in every creator's store the same
 * minute, and the JSON is stored once instead of once per creator.
 *
 * Money. The platform fee has always been global
 * (`app_config.platform_fee_ngn`, scaled by package size). An imported template
 * overrides it per-template with `platform_fee_override_ngn`: the studio takes
 * RESALE_COST_NGN per image and the creator keeps whatever they priced above it.
 */

import type sqlClient from "@/lib/db";

/** The project's postgres client, as it is actually typed. */
type SqlClient = typeof sqlClient;

/** What the studio takes per image on an imported template. */
export const RESALE_COST_NGN = 800;
/** The most a creator may charge per image, so the offer stays consistent. */
export const RESALE_MAX_PRICE_NGN = 1000;
/** What they earn if they price at the ceiling. */
export const RESALE_MAX_MARGIN_NGN = RESALE_MAX_PRICE_NGN - RESALE_COST_NGN;

export interface ResalePriceCheck {
  ok: boolean;
  /** Per-image price the creator charges buyers. */
  priceNgn: number;
  /** Per-image margin they keep. */
  marginNgn: number;
  error?: string;
}

/**
 * Validate a creator's chosen price.
 *
 * Below cost the studio would be paying them to sell; above the ceiling the
 * product stops being the same offer across every store.
 */
export function checkResalePrice(raw: unknown): ResalePriceCheck {
  const priceNgn = typeof raw === "number" ? Math.round(raw) : parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(priceNgn)) {
    return { ok: false, priceNgn: 0, marginNgn: 0, error: "Enter a price." };
  }
  if (priceNgn < RESALE_COST_NGN) {
    return { ok: false, priceNgn, marginNgn: 0, error: `The lowest you can charge is ₦${RESALE_COST_NGN.toLocaleString()}.` };
  }
  if (priceNgn > RESALE_MAX_PRICE_NGN) {
    return { ok: false, priceNgn, marginNgn: 0, error: `The most you can charge is ₦${RESALE_MAX_PRICE_NGN.toLocaleString()}.` };
  }
  return { ok: true, priceNgn, marginNgn: priceNgn - RESALE_COST_NGN };
}

/** The shape both read paths need from a template row. */
export interface ResolvableTemplate {
  source_template_id?: string | null;
  option_groups?: unknown;
  background_options?: unknown;
}

/**
 * Fill in a resold template's looks from its source.
 *
 * Call this immediately after loading a template anywhere its option groups or
 * backgrounds are used. It is a no-op for every ordinary template, so it is
 * safe to apply unconditionally.
 *
 * The client is typed against the real one rather than a hand-written function
 * signature: postgres.js's tagged template has several overloads and a narrow
 * signature does not accept it.
 */
export async function resolveResaleSource<T extends ResolvableTemplate>(
  template: T,
  sql: SqlClient,
): Promise<T> {
  if (!template?.source_template_id) return template;
  const [src] = await sql`
    SELECT option_groups, background_options
    FROM templates WHERE id = ${template.source_template_id}`;
  if (!src) return template;                       // source deleted — leave as-is
  return {
    ...template,
    option_groups: src.option_groups ?? template.option_groups,
    background_options: src.background_options ?? template.background_options,
  };
}

/**
 * The platform's cut for one booking of this template.
 *
 * Returns null when the template has no override, meaning the caller should use
 * the existing global fee exactly as before. The override is per IMAGE, so a
 * 5-image booking of a resold template owes 5 × the override.
 */
export function resalePlatformFee(
  template: { platform_fee_override_ngn?: number | null },
  imageCount: number,
): number | null {
  const per = template?.platform_fee_override_ngn;
  if (per == null || !Number.isFinite(per)) return null;
  return Math.round(per) * Math.max(1, imageCount);
}
