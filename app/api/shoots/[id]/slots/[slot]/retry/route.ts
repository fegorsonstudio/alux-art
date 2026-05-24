import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { startGenerationWorker } from "@/lib/generate";
import sql from "@/lib/db";

export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; slot: string }> }
) {
  const { id, slot: slotParam } = await params;
  const slotNum = parseInt(slotParam, 10);
  if (isNaN(slotNum) || slotNum < 1) {
    return NextResponse.json({ error: "Invalid slot" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date().toISOString();

  const [shoot] = await sql`SELECT user_id, status FROM shoots WHERE id = ${id}`;
  if (!shoot) return NextResponse.json({ error: "Shoot not found" }, { status: 404 });

  const isAdmin = user.email === process.env.ADMIN_EMAIL;
  if (shoot.user_id !== user.id && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [slotRow] = await sql`
    SELECT id, status FROM shoot_images WHERE shoot_id = ${id} AND slot = ${slotNum}
  `;
  if (!slotRow) return NextResponse.json({ error: "Slot not found" }, { status: 404 });
  if (slotRow.status !== "FAILED") {
    return NextResponse.json({ error: "Slot is not in FAILED state", status: slotRow.status }, { status: 409 });
  }

  await sql`
    UPDATE shoot_images SET
      status = 'QUEUED', stage = 'Queued for retry',
      provider_error = null, updated_at = ${now}
    WHERE id = ${slotRow.id}
  `;
  await sql`
    UPDATE shoots SET status = 'PROCESSING', updated_at = ${now}
    WHERE id = ${id}
  `;

  const body = await req.json().catch(() => ({}));
  const resolution: string = typeof body.resolution === "string" ? body.resolution : "1K";

  startGenerationWorker(id, { maxSlots: 1, resolution }).catch((err) => {
    console.error(`[retry] slot ${slotNum} worker error:`, err);
  });

  return NextResponse.json({ ok: true, slot: slotNum });
}
