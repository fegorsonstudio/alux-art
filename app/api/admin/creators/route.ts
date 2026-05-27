import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminEmail } from "@/lib/auth";
import sql from "@/lib/db";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return null;
  return user;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const creators = await sql`
    SELECT c.id, c.user_id, c.display_name, c.bank_name, c.account_number, c.account_name,
           c.paystack_subaccount_code, c.is_active, c.status, c.created_at,
           u.email
    FROM creators c
    LEFT JOIN auth.users u ON u.id = c.user_id
    ORDER BY c.created_at DESC
  `;

  const withCounts = await Promise.all(creators.map(async (c) => {
    const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM templates WHERE creator_id = ${c.id}`;
    return { ...c, templateCount: count ?? 0 };
  }));

  return NextResponse.json({ creators: withCounts });
}

export async function PATCH(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json() as { id?: string; isActive?: boolean; action?: string };
  if (typeof body.id !== "string") {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  // Approve / decline actions
  if (body.action === "approve") {
    const [creator] = await sql`
      UPDATE creators SET is_active = true, status = 'approved', updated_at = NOW()
      WHERE id = ${body.id} RETURNING *
    `;
    if (!creator) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Send welcome email via Resend if configured
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const [profile] = await sql`SELECT email FROM auth.users WHERE id = ${creator.user_id}`;
      if (profile?.email) {
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: `Alux Art <support@aluxartandframes.shop>`,
            to: [profile.email],
            subject: "Your Alux Art creator application has been approved!",
            html: `<p>Hi ${creator.display_name},</p><p>Great news — your Alux Art creator application has been approved. You can now log in and start building your templates.</p><p><a href="https://aluxartandframes.shop/creator-dashboard">Go to your creator dashboard →</a></p><p>— The Alux Art team</p>`,
          }),
        }).catch(() => {});
      }
    }

    return NextResponse.json({ creator });
  }

  if (body.action === "decline") {
    const [creator] = await sql`
      UPDATE creators SET is_active = false, status = 'declined', updated_at = NOW()
      WHERE id = ${body.id} RETURNING *
    `;
    if (!creator) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ creator });
  }

  // Legacy toggle
  if (typeof body.isActive !== "boolean") {
    return NextResponse.json({ error: "action or isActive required" }, { status: 400 });
  }
  const [creator] = await sql`
    UPDATE creators SET is_active = ${body.isActive}, updated_at = NOW()
    WHERE id = ${body.id} RETURNING *
  `;
  if (!creator) return NextResponse.json({ error: "Update failed" }, { status: 500 });
  return NextResponse.json({ creator });
}
