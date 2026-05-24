import { NextResponse } from "next/server";
import { ASPECTS, FAL_MODELS, REFERENCE_TAGS, SHOOT_PACKAGES, packagePrice } from "@/lib/types";
import sql from "@/lib/db";

export async function GET() {
  const [pricingRow] = await sql`SELECT ngn, usd FROM pricing_configs ORDER BY updated_at DESC LIMIT 1`;
  const [feeRow] = await sql`SELECT value FROM app_config WHERE key = 'platform_fee_ngn'`;

  const basePricing = pricingRow ?? { ngn: 15000, usd: 10 };
  const platformFeeNgn = parseInt(feeRow?.value ?? "15000", 10);

  return NextResponse.json({
    aspects: ASPECTS,
    models: FAL_MODELS,
    tags: REFERENCE_TAGS,
    pricing: basePricing,
    platformFeeNgn,
    packages: Object.values(SHOOT_PACKAGES).map((pkg) => ({
      imageCount: pkg.imageCount,
      label: pkg.label,
      ngn: packagePrice(basePricing.ngn, pkg.imageCount),
      usd: packagePrice(basePricing.usd, pkg.imageCount),
    })),
  });
}
