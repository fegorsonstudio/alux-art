import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import { r2SignedDownloadUrl } from "@/lib/r2";

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

  const { data: rawTemplates } = await service
    .from("templates")
    .select("*, template_images(id, display_order, purpose, tag, note, note_hidden, custom_name, storage_path, storage_bucket)")
    .eq("creator_id", creator.id)
    .order("created_at", { ascending: false });

  // Sign cover + template image URLs in parallel
  const templates: Record<string, unknown>[] = await Promise.all(
    (rawTemplates ?? []).map(async (t: Record<string, unknown>): Promise<Record<string, unknown>> => {
      let cover_url: string | null = null;
      if (t.cover_storage_path) {
        cover_url = await r2SignedDownloadUrl(
          (t.cover_bucket as string) ?? "template-images",
          t.cover_storage_path as string,
          3600
        ).catch(() => null);
      }
      const rawImages = (t.template_images as Array<Record<string, unknown>>) ?? [];
      const template_images = await Promise.all(
        rawImages.map(async (img) => {
          if (!img.storage_path) return { ...img, signed_url: null };
          const signed_url = await r2SignedDownloadUrl(
            (img.storage_bucket as string) ?? "template-images",
            img.storage_path as string,
            3600
          ).catch(() => null);
          return { ...img, signed_url };
        })
      );
      return { ...t, cover_url, template_images };
    })
  );

  const templateIds = templates.map((t) => t.id as string);
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
    templates,
    stats: {
      totalTemplates: templates.length,
      publishedTemplates: templates.filter((t) => t.status === "published").length,
      totalSales,
      totalEarnedNgn: totalEarned,
    },
  });
}
