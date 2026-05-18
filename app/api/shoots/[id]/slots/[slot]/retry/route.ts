import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import { startGenerationWorker } from "@/lib/generate";

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

  const service = createServiceClient();
  const now = new Date().toISOString();

  // Verify ownership
  const { data: shoot } = await service
    .from("shoots")
    .select("user_id, status")
    .eq("id", id)
    .single();

  if (!shoot) return NextResponse.json({ error: "Shoot not found" }, { status: 404 });
  const isAdmin = user.email === process.env.ADMIN_EMAIL;
  if (shoot.user_id !== user.id && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Verify the specific slot is FAILED
  const { data: slotRow } = await service
    .from("shoot_images")
    .select("id, status")
    .eq("shoot_id", id)
    .eq("slot", slotNum)
    .maybeSingle();

  if (!slotRow) return NextResponse.json({ error: "Slot not found" }, { status: 404 });
  if (slotRow.status !== "FAILED") {
    return NextResponse.json({ error: "Slot is not in FAILED state", status: slotRow.status }, { status: 409 });
  }

  // Reset this specific slot to QUEUED — shoot_brief already has the sanitized prompt
  await service.from("shoot_images").update({
    status: "QUEUED",
    stage: "Queued for retry",
    provider_error: null,
    updated_at: now,
  }).eq("id", slotRow.id);

  // Ensure shoot is in PROCESSING state (may be COMPLETE if other slots finished)
  await service.from("shoots").update({
    status: "PROCESSING",
    updated_at: now,
  }).eq("id", id);

  // Fire generation worker for this one slot
  const body = await req.json().catch(() => ({}));
  const resolution: string = typeof body.resolution === "string" ? body.resolution : "1K";

  startGenerationWorker(id, { maxSlots: 1, resolution }).catch((err) => {
    console.error(`[retry] slot ${slotNum} worker error:`, err);
  });

  return NextResponse.json({ ok: true, slot: slotNum });
}
