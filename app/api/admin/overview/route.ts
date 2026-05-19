import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const service = createServiceClient();

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // --- Parallel: counts, pricing, profiles, recent shoots ---
  const [
    { count: totalShoots },
    { count: completedShoots },
    { count: failedShoots },
    { count: queueDepth },
    { count: todayShoots },
    { data: pricing },
    { data: profiles },
    { data: recentShoots },
  ] = await Promise.all([
    service.from("shoots").select("*", { count: "exact", head: true }),
    service.from("shoots").select("*", { count: "exact", head: true }).eq("status", "COMPLETE"),
    service.from("shoots").select("*", { count: "exact", head: true }).eq("status", "FAILED"),
    service.from("shoots").select("*", { count: "exact", head: true }).in("status", ["QUEUED", "PROCESSING", "BASE_LOCKING", "BASE_REVIEW"]),
    service.from("shoots").select("*", { count: "exact", head: true }).gte("created_at", todayStart.toISOString()),
    service.from("pricing_configs").select("ngn, usd").order("updated_at", { ascending: false }).limit(1).single(),
    service.from("profiles").select("id, display_name, currency, banned, created_at").order("created_at", { ascending: false }).limit(200),
    service.from("shoots")
      .select("id, status, owner_email, user_id, mode, aspect_ratio, package_size, currency, created_at")
      .order("created_at", { ascending: false })
      .limit(80),
  ]);

  // --- Image counts per shoot ---
  const shootIds = (recentShoots ?? []).map(s => s.id);
  const { data: imageRows } = shootIds.length
    ? await service.from("shoot_images").select("shoot_id, status").in("shoot_id", shootIds)
    : { data: [] };

  const imageMap: Record<string, { total: number; done: number; failed: number }> = {};
  for (const img of imageRows ?? []) {
    if (!imageMap[img.shoot_id]) imageMap[img.shoot_id] = { total: 0, done: 0, failed: 0 };
    imageMap[img.shoot_id].total++;
    if (img.status === "DONE") imageMap[img.shoot_id].done++;
    if (img.status === "FAILED") imageMap[img.shoot_id].failed++;
  }

  const shoots = (recentShoots ?? []).map(s => ({
    ...s,
    imageCounts: imageMap[s.id] ?? { total: 0, done: 0, failed: 0 },
  }));

  // --- Revenue from template_purchases (graceful: table may not exist yet) ---
  let revenueAll = 0, revenueMonth = 0, revenueToday = 0, totalTemplateSales = 0;
  let totalCreators = 0, publishedTemplates = 0;
  try {
    const [{ data: purchases }, { count: creatorCount }, { count: templateCount }] = await Promise.all([
      service.from("template_purchases").select("amount_ngn, created_at").eq("status", "success"),
      service.from("creators").select("*", { count: "exact", head: true }).eq("is_active", true),
      service.from("templates").select("*", { count: "exact", head: true }).eq("status", "published"),
    ]);
    totalTemplateSales = purchases?.length ?? 0;
    revenueAll = purchases?.reduce((s, p) => s + (p.amount_ngn ?? 0), 0) ?? 0;
    revenueMonth = purchases?.filter(p => new Date(p.created_at) >= monthStart).reduce((s, p) => s + (p.amount_ngn ?? 0), 0) ?? 0;
    revenueToday = purchases?.filter(p => new Date(p.created_at) >= todayStart).reduce((s, p) => s + (p.amount_ngn ?? 0), 0) ?? 0;
    totalCreators = creatorCount ?? 0;
    publishedTemplates = templateCount ?? 0;
  } catch { /* marketplace not yet migrated */ }

  // --- Enrich users with auth email ---
  const { data: authData } = await service.auth.admin.listUsers({ perPage: 500 });
  const authUsers = authData?.users ?? [];
  const enrichedUsers = (profiles ?? []).map(u => {
    const au = authUsers.find(a => a.id === u.id);
    return { ...u, email: au?.email ?? "—" };
  });
  const totalUsers = authUsers.length;

  return NextResponse.json({
    pricing: pricing ?? { ngn: 15000, usd: 10 },
    users: enrichedUsers,
    shoots,
    metrics: {
      totalUsers,
      totalShoots: totalShoots ?? 0,
      completedShoots: completedShoots ?? 0,
      failedShoots: failedShoots ?? 0,
      queueDepth: queueDepth ?? 0,
      todayShoots: todayShoots ?? 0,
    },
    revenue: {
      today: revenueToday,
      month: revenueMonth,
      total: revenueAll,
      totalSales: totalTemplateSales,
    },
    marketplace: {
      totalCreators,
      publishedTemplates,
    },
  });
}
