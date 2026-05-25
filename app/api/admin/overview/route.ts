import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    [{ total_shoots }],
    [{ completed_shoots }],
    [{ failed_shoots }],
    [{ queue_depth }],
    [{ today_shoots }],
    pricing,
    profiles,
    recentShoots,
  ] = await Promise.all([
    sql`SELECT COUNT(*)::int AS total_shoots FROM shoots`,
    sql`SELECT COUNT(*)::int AS completed_shoots FROM shoots WHERE status = 'COMPLETE'`,
    sql`SELECT COUNT(*)::int AS failed_shoots FROM shoots WHERE status = 'FAILED'`,
    sql`SELECT COUNT(*)::int AS queue_depth FROM shoots WHERE status = ANY(${["QUEUED", "PROCESSING", "BASE_LOCKING", "BASE_REVIEW"]})`,
    sql`SELECT COUNT(*)::int AS today_shoots FROM shoots WHERE created_at >= ${todayStart.toISOString()}`,
    sql`SELECT ngn, usd FROM pricing_configs ORDER BY updated_at DESC LIMIT 1`,
    sql`SELECT id, display_name, email, currency, banned, created_at FROM profiles ORDER BY created_at DESC LIMIT 200`,
    sql`
      SELECT id, status, owner_email, user_id, mode, aspect_ratio, package_size, currency, created_at
      FROM shoots ORDER BY created_at DESC LIMIT 80
    `,
  ]);

  const shootIds = recentShoots.map((s) => s.id);
  const imageRows = shootIds.length
    ? await sql`SELECT shoot_id, status FROM shoot_images WHERE shoot_id = ANY(${shootIds})`
    : [];

  const imageMap: Record<string, { total: number; done: number; failed: number }> = {};
  for (const img of imageRows) {
    if (!imageMap[img.shoot_id]) imageMap[img.shoot_id] = { total: 0, done: 0, failed: 0 };
    imageMap[img.shoot_id].total++;
    if (img.status === "DONE") imageMap[img.shoot_id].done++;
    if (img.status === "FAILED") imageMap[img.shoot_id].failed++;
  }

  const shoots = recentShoots.map((s) => ({
    ...s,
    imageCounts: imageMap[s.id] ?? { total: 0, done: 0, failed: 0 },
  }));

  let revenueAll = 0, revenueMonth = 0, revenueToday = 0, totalTemplateSales = 0;
  let totalCreators = 0, publishedTemplates = 0;
  try {
    const [purchases, [{ creator_count }], [{ template_count }]] = await Promise.all([
      sql`SELECT amount_ngn, created_at FROM template_purchases WHERE status = 'success'`,
      sql`SELECT COUNT(*)::int AS creator_count FROM creators WHERE is_active = true`,
      sql`SELECT COUNT(*)::int AS template_count FROM templates WHERE status = 'published'`,
    ]);
    totalTemplateSales = purchases.length;
    revenueAll = purchases.reduce((s, p) => s + (p.amount_ngn ?? 0), 0);
    revenueMonth = purchases.filter((p) => new Date(p.created_at) >= monthStart).reduce((s, p) => s + (p.amount_ngn ?? 0), 0);
    revenueToday = purchases.filter((p) => new Date(p.created_at) >= todayStart).reduce((s, p) => s + (p.amount_ngn ?? 0), 0);
    totalCreators = creator_count ?? 0;
    publishedTemplates = template_count ?? 0;
  } catch { /* marketplace not yet migrated */ }

  const [{ total_users }] = await sql`SELECT COUNT(*)::int AS total_users FROM profiles`;

  return NextResponse.json({
    pricing: pricing[0] ?? { ngn: 15000, usd: 10 },
    users: profiles,
    shoots,
    metrics: {
      totalUsers: total_users ?? 0,
      totalShoots: total_shoots ?? 0,
      completedShoots: completed_shoots ?? 0,
      failedShoots: failed_shoots ?? 0,
      queueDepth: queue_depth ?? 0,
      todayShoots: today_shoots ?? 0,
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
