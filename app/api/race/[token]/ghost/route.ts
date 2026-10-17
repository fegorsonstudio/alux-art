import { NextRequest, NextResponse } from "next/server";
import { resolveArCampaign } from "@/lib/ar/campaign";
import { ghostPath } from "@/lib/race/bounty";

/** The fastest run on this bounty, as a path to race against when nobody else is online. */
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = await resolveArCampaign(token);
  if (!c) return NextResponse.json({ error: "This bounty does not exist." }, { status: 404 });
  const g = await ghostPath(c.id);
  return NextResponse.json({ ghost: g }, { headers: { "Cache-Control": "no-store" } });
}
