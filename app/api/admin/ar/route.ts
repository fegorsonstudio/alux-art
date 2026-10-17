import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { requireAdmin } from "@/lib/carousel/posts";
import { viewOf, bountyCountsOf, type ArCampaignRow } from "@/lib/ar/campaign";

/**
 * Every AR balloon campaign, newest first, and the one switch the owner has:
 * suspend / unsuspend. A suspended campaign's page says the experience has
 * ended; nothing is deleted.
 */

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function GET() {
  if (!(await requireAdmin())) return fail(403, "Forbidden");

  const rows = await sql<(ArCampaignRow & { owner_email: string | null; booked_at: Date })[]>`
    SELECT c.*, s.owner_email, s.created_at AS booked_at
    FROM ar_campaigns c JOIN shoots s ON s.id = c.shoot_id
    ORDER BY c.created_at DESC LIMIT 200`;
  const counts = await sql<{ campaign_id: string; type: string; n: number }[]>`
    SELECT campaign_id, type, count(*)::int AS n FROM ar_campaign_events
    WHERE NOT is_preview AND campaign_id = ANY(${rows.map((r) => r.id)}::uuid[])
    GROUP BY campaign_id, type`;
  const byId = new Map<string, Record<string, number>>();
  for (const c of counts) {
    const m = byId.get(c.campaign_id) ?? {};
    m[c.type] = c.n;
    byId.set(c.campaign_id, m);
  }
  const bounties = await Promise.all(rows.map((r) => bountyCountsOf(r.id)));
  const campaigns = rows.map((r, i) => ({
    ...viewOf(r, byId.get(r.id) ?? {}, bounties[i]),
    buyerEmail: r.owner_email,
    bookedAt: new Date(r.booked_at).toISOString(),
    colors: [r.color_primary, r.color_secondary],
  }));
  return NextResponse.json({ campaigns });
}

export async function PATCH(request: NextRequest) {
  if (!(await requireAdmin())) return fail(403, "Forbidden");
  const body = await request.json().catch(() => ({})) as { id?: unknown; status?: unknown };
  const id = String(body.id ?? "");
  const status = body.status === "suspended" ? "suspended" : body.status === "active" ? "active" : null;
  if (!/^[0-9a-f-]{36}$/.test(id) || !status) return fail(400, "Say which campaign and whether it is active or suspended.");
  const [row] = await sql<{ id: string }[]>`
    UPDATE ar_campaigns SET status = ${status}, updated_at = now() WHERE id = ${id} RETURNING id`;
  if (!row) return fail(404, "No such campaign.");
  return NextResponse.json({ ok: true, id, status });
}
