import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { isAdminEmail } from "@/lib/auth";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return null;
  return user;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const coupons = await sql`SELECT * FROM coupons ORDER BY created_at DESC`;
  return NextResponse.json({ coupons });
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

  try {
    const [coupon] = await sql`
      INSERT INTO coupons (code, description, discount_type, discount_value, max_uses, expires_at, is_active, created_at)
      VALUES (
        ${(code as string).toUpperCase()},
        ${typeof description === "string" ? description.trim() : null},
        ${discountType as string},
        ${discountValue as number},
        ${Number.isInteger(maxUses) && (maxUses as number) > 0 ? maxUses as number : null},
        ${typeof expiresAt === "string" && expiresAt ? expiresAt : null},
        true, NOW()
      ) RETURNING *
    `;
    return NextResponse.json({ coupon }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: msg.includes("unique") ? "Coupon code already exists" : "Failed to create coupon" },
      { status: 409 }
    );
  }
}
