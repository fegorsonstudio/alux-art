import { NextResponse } from "next/server";
import { ASPECTS, FAL_MODELS, REFERENCE_TAGS, SHOOT_PACKAGES } from "@/lib/types";
import sql from "@/lib/db";
import { createClient } from "@/lib/supabase-server";
import { isAdminEmail } from "@/lib/auth";

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
  // Admin-authored templates are exempt from the platform-fee floor. The
  // creator dashboard enforces that floor in the browser before it sends
  // anything, so it has to be told — the server exemption alone left an admin
  // unable to save or publish a deliberately cheap template.
  let feeExempt = false;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    feeExempt = isAdminEmail(user?.email);
  } catch { /* anonymous callers are simply not exempt */ }

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
    // The dashboard was reading platformFeeNgn from here and never getting it,
    // so it fell back to a hardcoded 15000 and blocked saves against a fee that
    // is actually 5000. Send the real one, and whether this caller is exempt.
    platformFeeNgn: p("price_10_ngn", "platform_fee_ngn"),
    feeExempt,
  });
}
