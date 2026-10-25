import "server-only";
import sql from "@/lib/db";
import { DEFAULT_RATES, type BudgetRates } from "@/lib/drama/budget";

/**
 * The owner's overrides for the budget rates, from app_config. Every key is
 * optional; a missing or unreadable value falls back to the public price in
 * budget.ts. Set one with, for example:
 *   UPDATE app_config SET value = '0.10', updated_at = now() WHERE key = 'drama_rate_image1k';
 *   INSERT INTO app_config (key, value) VALUES ('drama_usd_ngn', '1650');
 */
const KEYS: Record<keyof BudgetRates, string> = {
  image1k: "drama_rate_image1k", image2k: "drama_rate_image2k", image4k: "drama_rate_image4k",
  tts: "drama_rate_tts", music: "drama_rate_music", director: "drama_rate_director",
  brainIn: "drama_rate_brain_in", brainOut: "drama_rate_brain_out",
  videoPerSecond: "drama_rate_video_second",
  usdNgn: "drama_usd_ngn",
  bufferPct: "drama_cost_buffer_pct", profitPct: "drama_profit_pct",
};

export async function budgetRates(): Promise<BudgetRates> {
  const rows = await sql<{ key: string; value: string }[]>`
    SELECT key, value FROM app_config WHERE key = ANY(${Object.values(KEYS)})`.catch(() => []);
  const out: BudgetRates = { ...DEFAULT_RATES };
  for (const k of Object.keys(KEYS) as (keyof BudgetRates)[]) {
    const v = parseFloat(rows.find((r) => r.key === KEYS[k])?.value ?? "");
    if (Number.isFinite(v) && v >= 0) out[k] = v;
  }
  return out;
}
