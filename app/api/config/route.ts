import { NextResponse } from "next/server";
import { ASPECTS, FAL_MODELS, REFERENCE_TAGS, SHOOT_PACKAGES, packagePrice } from "@/lib/types";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = createServiceClient();
  const { data: pricing } = await supabase
    .from("pricing_configs")
    .select("ngn, usd")
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  const basePricing = pricing ?? { ngn: 15000, usd: 10 };

  return NextResponse.json({
    aspects: ASPECTS,
    models: FAL_MODELS,
    tags: REFERENCE_TAGS,
    pricing: basePricing,
    packages: Object.values(SHOOT_PACKAGES).map((pkg) => ({
      imageCount: pkg.imageCount,
      label: pkg.label,
      ngn: packagePrice(basePricing.ngn, pkg.imageCount),
      usd: packagePrice(basePricing.usd, pkg.imageCount),
    })),
  });
}
