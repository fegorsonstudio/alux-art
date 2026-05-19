import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user || user.email !== process.env.ADMIN_EMAIL) return null;
  return user;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const service = createServiceClient();
  const { data, error } = await service
    .from("creators")
    .select("id, user_id, display_name, bank_name, account_number, account_name, paystack_subaccount_code, is_active, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Failed to load creators" }, { status: 500 });

  const withCounts = await Promise.all((data ?? []).map(async (c) => {
    const { count } = await service
      .from("templates")
      .select("id", { count: "exact", head: true })
      .eq("creator_id", c.id);
    return { ...c, templateCount: count ?? 0 };
  }));

  return NextResponse.json({ creators: withCounts });
}

export async function PATCH(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json() as { id?: string; isActive?: boolean };
  if (typeof body.id !== "string" || typeof body.isActive !== "boolean") {
    return NextResponse.json({ error: "id and isActive required" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("creators")
    .update({ is_active: body.isActive, updated_at: new Date().toISOString() })
    .eq("id", body.id)
    .select()
    .single();

  if (error || !data) return NextResponse.json({ error: "Update failed" }, { status: 500 });
  return NextResponse.json({ creator: data });
}
