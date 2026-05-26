import { NextResponse } from "next/server";
import { ASPECTS, FAL_MODELS, REFERENCE_TAGS, SHOOT_PACKAGES } from "@/lib/types";
import sql from "@/lib/db";

const PRICE_KEYS = [
  "price_1_ngn", "price_5_ngn", "price_10_ngn",
  "price_1_usd", "price_5_usd", "price_10_usd",
  // legacy keys — used as fallback if new keys not yet set
  "platform_price_1_ngn", "platform_price_5_ngn", "platform_fee_ngn",
];

const DEFAULTS = {
  price_1_ngn: 1500, price_5_ngn: 7500, price_10_ngn: 15000,
  price_1_usd: 1, price_5_usd: 5, price_10_usd: 10,
};

export async function GET() {
  const rows = await sql`SELECT key, value FROM app_config WHERE key = ANY(${PRICE_KEYS})`;
  const map: Record<string, string> = Object.fromEntries(rows.map((r) => [r.key as string, r.value as string]));

  const p = (key: keyof typeof DEFAULTS, legacyKey?: string): number => {
    const raw = map[key] ?? (legacyKey ? map[legacyKey] : undefined);
    const val = raw ? parseInt(raw, 10) : 0;
    return val > 0 ? val : DEFAULTS[key];
  };

  const packages = [
    { imageCount: 1,  label: SHOOT_PACKAGES[1].label,  ngn: p("price_1_ngn",  "platform_price_1_ngn"), usd: p("price_1_usd") },
    { imageCount: 5,  label: SHOOT_PACKAGES[5].label,  ngn: p("price_5_ngn",  "platform_price_5_ngn"), usd: p("price_5_usd") },
    { imageCount: 10, label: SHOOT_PACKAGES[10].label, ngn: p("price_10_ngn", "platform_fee_ngn"),      usd: p("price_10_usd") },
  ];

  return NextResponse.json({
    aspects: ASPECTS,
    models: FAL_MODELS,
    tags: REFERENCE_TAGS,
    packages,
  });
}
