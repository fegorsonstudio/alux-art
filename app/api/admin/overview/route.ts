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

  const [{ data: pricing }, { data: users }, { data: shoots }, { count: queueDepth }] = await Promise.all([
    service.from("pricing_configs").select("ngn, usd").order("updated_at", { ascending: false }).limit(1).single(),
    service.from("profiles").select("id, display_name, currency, banned, created_at").order("created_at", { ascending: false }).limit(100),
    service.from("shoots").select("id, status, owner_email, created_at").order("created_at", { ascending: false }).limit(50),
    service.from("shoots").select("*", { count: "exact", head: true }).in("status", ["QUEUED", "PROCESSING"]),
  ]);

  const totalShoots = shoots?.length ?? 0;
  const completedShoots = shoots?.filter(s => s.status === "COMPLETE").length ?? 0;

  // Enrich users with email from auth (service role)
  const { data: authUsers } = await service.auth.admin.listUsers();
  const enrichedUsers = (users ?? []).map(u => {
    const authUser = authUsers?.users?.find(au => au.id === u.id);
    return { ...u, email: authUser?.email ?? "—" };
  });

  return NextResponse.json({
    pricing: pricing ?? { ngn: 15000, usd: 10 },
    modelSlots: [],
    users: enrichedUsers,
    shoots: shoots ?? [],
    metrics: {
      totalUsers: users?.length ?? 0,
      totalShoots,
      completedShoots,
      queueDepth: queueDepth ?? 0,
    },
  });
}
