import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { isAdminEmail } from "@/lib/auth";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
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
    profiles,
    recentShoots,
  ] = await Promise.all([
    sql`SELECT COUNT(*)::int AS total_shoots FROM shoots`,
    sql`SELECT COUNT(*)::int AS completed_shoots FROM shoots WHERE status = 'COMPLETE'`,
    sql`SELECT COUNT(*)::int AS failed_shoots FROM shoots WHERE status = 'FAILED'`,
    sql`SELECT COUNT(*)::int AS queue_depth FROM shoots WHERE status = ANY(${["QUEUED", "PROCESSING", "BASE_LOCKING", "BASE_REVIEW"]})`,
    sql`SELECT COUNT(*)::int AS today_shoots FROM shoots WHERE created_at >= ${todayStart.toISOString()}`,
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

  // ── Direct studio revenue (payments table) — separate from marketplace sales ──
  // Guarded: any schema difference degrades to 0 rather than breaking the endpoint.
  let directTotal = 0, directToday = 0, directMonth = 0, directCount = 0;
  try {
    const directRows = await sql`SELECT amount_ngn, created_at FROM payments WHERE status = 'success'`;
    directCount = directRows.length;
    directTotal = directRows.reduce((s, p) => s + (Number(p.amount_ngn) || 0), 0);
    directMonth = directRows.filter((p) => new Date(p.created_at as string) >= monthStart).reduce((s, p) => s + (Number(p.amount_ngn) || 0), 0);
    directToday = directRows.filter((p) => new Date(p.created_at as string) >= todayStart).reduce((s, p) => s + (Number(p.amount_ngn) || 0), 0);
  } catch { /* payments table shape differs — leave at 0 */ }

  // ── Conversion funnel — where buyers stop ────────────────────────────────────
  const funnel = { checkoutsStarted: 0, paid: 0, abandonedAtPayment: 0, shootsCompleted: 0, shootsFailed: 0, regenEligible: 0 };
  try {
    const [[{ started }], [{ paid }], [{ regen }]] = await Promise.all([
      sql`SELECT COUNT(*)::int AS started FROM template_purchases`,
      sql`SELECT COUNT(*)::int AS paid FROM template_purchases WHERE status = 'success'`,
      sql`SELECT COUNT(*)::int AS regen FROM shoots WHERE regeneration_status = 'eligible'`,
    ]);
    funnel.checkoutsStarted = started ?? 0;
    funnel.paid = paid ?? 0;
    funnel.abandonedAtPayment = Math.max(0, (started ?? 0) - (paid ?? 0));
    funnel.shootsCompleted = completed_shoots ?? 0;
    funnel.shootsFailed = failed_shoots ?? 0;
    funnel.regenEligible = regen ?? 0;
  } catch { /* leave funnel at zeros */ }

  // ── Best-selling templates ───────────────────────────────────────────────────
  let topTemplates: Array<{ id: string; title: string; category: string; sales: number }> = [];
  try {
    const rows = await sql`
      SELECT id, title, category, purchase_count
      FROM templates WHERE status = 'published'
      ORDER BY purchase_count DESC NULLS LAST LIMIT 8
    `;
    topTemplates = rows.map((t) => ({
      id: t.id as string,
      title: t.title as string,
      category: (t.category as string) ?? "other",
      sales: Number(t.purchase_count) || 0,
    }));
  } catch { /* leave empty */ }

  return NextResponse.json({
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
      // Marketplace (template sales) — unchanged keys for backward compatibility
      today: revenueToday,
      month: revenueMonth,
      total: revenueAll,
      totalSales: totalTemplateSales,
      // Direct studio shoots (payments table)
      directToday,
      directMonth,
      directTotal,
      directCount,
      // Combined
      combinedToday: revenueToday + directToday,
      combinedMonth: revenueMonth + directMonth,
      combinedTotal: revenueAll + directTotal,
    },
    marketplace: {
      totalCreators,
      publishedTemplates,
    },
    funnel,
    topTemplates,
  });
}
