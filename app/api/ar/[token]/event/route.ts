import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { AR_EVENT_TYPES, AR_TOKEN_RE, type ArEventType } from "@/lib/ar/campaign";
import { allow } from "@/lib/ar/rate-limit";

/**
 * The AR viewer's counts: open, permission_denied, outside, activated, photo.
 * Login-free (the page itself is), rate limited per campaign and address, and
 * it never stores anything about the person: no coordinates, no user agent,
 * no address. Always 204, so a blocked or malformed call never shows up on the
 * phone as an error.
 */

const campaignIds = new Map<string, { id: string | null; at: number }>();

async function campaignIdFor(token: string): Promise<string | null> {
  const hit = campaignIds.get(token);
  if (hit && Date.now() - hit.at < 60_000) return hit.id;
  const [row] = await sql<{ id: string }[]>`SELECT id FROM ar_campaigns WHERE token = ${token}`;
  const id = row?.id ?? null;
  campaignIds.set(token, { id, at: Date.now() });
  return id;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!AR_TOKEN_RE.test(token)) return new NextResponse(null, { status: 204 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }

  const type = String(body.type ?? "");
  if (!(AR_EVENT_TYPES as readonly string[]).includes(type)) return new NextResponse(null, { status: 204 });

  const ip = request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
  const campaignId = await campaignIdFor(token);
  if (!campaignId) return new NextResponse(null, { status: 204 });
  if (!allow(`${campaignId}:${ip}`, 40, 10 * 60_000)) return new NextResponse(null, { status: 204 });

  const which = ["camera", "location", "motion"].includes(String(body.which)) ? String(body.which) : null;
  const d = ["0-50", "50-200", "200-1000", "1000+"].includes(String(body.d)) ? String(body.d) : null;
  const os = ["ios", "android", "other"].includes(String(body.os)) ? String(body.os) : null;

  await sql`INSERT INTO ar_campaign_events (campaign_id, type, detail, distance_bucket, platform, is_preview)
    VALUES (${campaignId}, ${type as ArEventType}, ${which}, ${d}, ${os}, ${body.preview === true})`
    .catch((e) => console.error("[ar] event insert failed:", e instanceof Error ? e.message : e));

  return new NextResponse(null, { status: 204 });
}
