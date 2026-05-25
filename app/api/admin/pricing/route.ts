import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { ngn, usd } = await request.json();
  const nextNgn = Number(ngn);
  const nextUsd = Number(usd);
  if (!Number.isFinite(nextNgn) || nextNgn <= 0 || !Number.isFinite(nextUsd) || nextUsd <= 0) {
    return NextResponse.json({ error: "Enter valid positive prices" }, { status: 400 });
  }

  try {
    const [pricing] = await sql`
      INSERT INTO pricing_configs (id, ngn, usd, updated_at)
      VALUES (1, ${nextNgn}, ${nextUsd}, NOW())
      ON CONFLICT (id) DO UPDATE SET ngn = EXCLUDED.ngn, usd = EXCLUDED.usd, updated_at = NOW()
      RETURNING ngn, usd, updated_at
    `;
    return NextResponse.json({ pricing });
  } catch (err) {
    console.error("[admin/pricing] save failed", err);
    return NextResponse.json({ error: "Unable to save pricing" }, { status: 500 });
  }
}
