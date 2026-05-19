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
    .from("coupons")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Failed to load coupons" }, { status: 500 });
  return NextResponse.json({ coupons: data ?? [] });
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json() as Record<string, unknown>;
  const { code, description, discountType, discountValue, maxUses, expiresAt } = body;

  if (typeof code !== "string" || !/^[A-Z0-9_-]{3,20}$/i.test(code)) {
    return NextResponse.json({ error: "Code must be 3–20 characters (letters, numbers, - or _)" }, { status: 400 });
  }
  if (!["percent", "fixed"].includes(discountType as string)) {
    return NextResponse.json({ error: "discountType must be 'percent' or 'fixed'" }, { status: 400 });
  }
  if (!Number.isInteger(discountValue) || (discountValue as number) < 1) {
    return NextResponse.json({ error: "discountValue must be a positive integer" }, { status: 400 });
  }
  if (discountType === "percent" && (discountValue as number) > 100) {
    return NextResponse.json({ error: "Percent discount cannot exceed 100" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: coupon, error } = await service.from("coupons").insert({
    code: (code as string).toUpperCase(),
    description: typeof description === "string" ? description.trim() : null,
    discount_type: discountType,
    discount_value: discountValue,
    max_uses: Number.isInteger(maxUses) && (maxUses as number) > 0 ? maxUses : null,
    expires_at: typeof expiresAt === "string" && expiresAt ? expiresAt : null,
    is_active: true,
    created_at: new Date().toISOString(),
  }).select().single();

  if (error) {
    return NextResponse.json(
      { error: error.message.includes("unique") ? "Coupon code already exists" : "Failed to create coupon" },
      { status: 409 }
    );
  }
  return NextResponse.json({ coupon }, { status: 201 });
}
