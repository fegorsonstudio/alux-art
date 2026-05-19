import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();

  const { data: creator } = await service
    .from("creators")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!creator) return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });

  const { data: templates } = await service
    .from("templates")
    .select("*, template_images(id, display_order, purpose, tag)")
    .eq("creator_id", creator.id)
    .order("created_at", { ascending: false });

  const templateIds = (templates ?? []).map((t: { id: string }) => t.id);
  const { data: purchases } = templateIds.length > 0
    ? await service
        .from("template_purchases")
        .select("creator_payout_ngn, template_id")
        .eq("status", "success")
        .in("template_id", templateIds)
    : { data: [] };

  const totalEarned = (purchases ?? []).reduce((sum: number, p: { creator_payout_ngn: number }) => sum + p.creator_payout_ngn, 0);
  const totalSales = purchases?.length ?? 0;

  return NextResponse.json({
    creator,
    templates: templates ?? [],
    stats: {
      totalTemplates: templates?.length ?? 0,
      publishedTemplates: (templates ?? []).filter((t: { status: string }) => t.status === "published").length,
      totalSales,
      totalEarnedNgn: totalEarned,
    },
  });
}
