import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { signSheetUrls, pollTraining } from "@/lib/soul-id";

/**
 * One Soul ID: its state, and the sheets to approve.
 *
 * The buyer's screen polls this. When the row is mid-training it also nudges fal
 * for the result, so the job completes without needing a cron or a worker — the
 * person waiting is the one driving it forward.
 */

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [row] = await sql<Array<{
    id: string; label: string; status: string; sheet_paths: Record<string, string>;
    training_image_count: number; failure_reason: string | null;
  }>>`
    SELECT id, label, status, sheet_paths, training_image_count, failure_reason
    FROM character_loras WHERE id = ${id} AND user_id = ${user.id}`;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let status = row.status;
  if (status === "TRAINING") {
    // Best-effort: a failed poll must not break the page the buyer is watching.
    try {
      const polled = await pollTraining(row.id);
      status = polled.status;
    } catch (err) {
      console.warn("[soul-id] poll failed:", row.id, err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({
    id: row.id,
    label: row.label,
    status,
    trainingImageCount: row.training_image_count,
    failureReason: row.failure_reason,
    sheets: await signSheetUrls(row.sheet_paths ?? {}),
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Archived rather than deleted: shoots reference it, and a buyer removing a
  // Soul ID should not orphan the images it produced.
  const [row] = await sql<Array<{ id: string }>>`
    UPDATE character_loras SET is_archived = TRUE, updated_at = NOW()
    WHERE id = ${id} AND user_id = ${user.id} RETURNING id`;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
