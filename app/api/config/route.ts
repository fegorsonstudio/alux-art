import { NextResponse } from "next/server";
import { ASPECTS, FAL_MODELS, REFERENCE_TAGS } from "@/lib/types";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = createServiceClient();
  const { data: pricing } = await supabase
    .from("pricing_configs")
    .select("ngn, usd")
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json({
    aspects: ASPECTS,
    models: FAL_MODELS,
    tags: REFERENCE_TAGS,
    pricing: pricing ?? { ngn: 15000, usd: 10 },
  });
}
