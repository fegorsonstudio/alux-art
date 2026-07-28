import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { isAdminEmail } from "@/lib/auth";

// Free bookings skip the payment gateway, so no Paystack split ever runs and the
// creator's share becomes money Alux Art owes them. This route surfaces that
// liability and lets an admin mark it settled once paid by hand.

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return null;
  return user;
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const settled = request.nextUrl.searchParams.get("settled") === "true";

  const bookings = await sql`
    SELECT b.id, b.shoot_id, b.email, b.package_size, b.source,
           b.creator_payout_ngn, b.payout_settled, b.created_at,
           t.title AS template_title,
           c.display_name AS creator_name, c.id AS creator_id
    FROM free_bookings b
    LEFT JOIN templates t ON t.id = b.template_id
    LEFT JOIN creators c ON c.id = t.creator_id
    WHERE b.payout_settled = ${settled}
    ORDER BY b.created_at DESC
    LIMIT 200
  `;

  // What is still owed, per creator — the number the admin actually acts on.
  const owed = await sql`
    SELECT c.id AS creator_id, c.display_name AS creator_name,
           SUM(b.creator_payout_ngn)::int AS owed_ngn,
           COUNT(*)::int AS bookings
    FROM free_bookings b
    JOIN templates t ON t.id = b.template_id
    JOIN creators c ON c.id = t.creator_id
    WHERE b.payout_settled = false AND b.creator_payout_ngn > 0
    GROUP BY c.id, c.display_name
    ORDER BY owed_ngn DESC
  `;

  return NextResponse.json({ bookings, owed });
}

// Mark one booking, or every unsettled booking for a creator, as paid.
export async function PATCH(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const { bookingId, creatorId, settled } = body;
  const value = typeof settled === "boolean" ? settled : true;

  if (typeof bookingId === "string") {
    const [row] = await sql`
      UPDATE free_bookings SET payout_settled = ${value} WHERE id = ${bookingId} RETURNING id
    `;
    if (!row) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    return NextResponse.json({ ok: true, updated: 1 });
  }

  if (typeof creatorId === "string") {
    const rows = await sql`
      UPDATE free_bookings SET payout_settled = ${value}
      WHERE payout_settled = ${!value}
        AND template_id IN (SELECT id FROM templates WHERE creator_id = ${creatorId})
      RETURNING id
    `;
    return NextResponse.json({ ok: true, updated: rows.length });
  }

  return NextResponse.json({ error: "bookingId or creatorId is required" }, { status: 400 });
}
