import { NextResponse } from "next/server";
import sql from "@/lib/db";

/** How many days one campaign runs: the checkout shows it beside the start date. */
export const dynamic = "force-dynamic";

export async function GET() {
  const [row] = await sql<{ value: string }[]>`SELECT value FROM app_config WHERE key = 'ar_campaign_days'`
    .catch(() => [] as { value: string }[]);
  const n = parseInt(row?.value ?? "", 10);
  return NextResponse.json({ days: n >= 1 && n <= 3650 ? n : 30 });
}
