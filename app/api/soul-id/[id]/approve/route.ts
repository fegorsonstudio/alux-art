import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { submitTraining } from "@/lib/soul-id";

/**
 * The approval gate. Approving the sheets is what starts training.
 *
 * It exists because a sheet that does not look like the buyer trains a LoRA that
 * does not look like them, and every image generated afterwards inherits that
 * face. Cheaper to ask than to find out later.
 *
 * POST { approved: true }  → training is submitted, returns immediately
 * POST { approved: false } → rejected, no money spent
 */

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { approved } = (await request.json()) as { approved?: boolean };

  const [row] = await sql<Array<{ id: string; status: string; sheet_paths: Record<string, string> }>>`
    SELECT id, status, sheet_paths FROM character_loras
    WHERE id = ${id} AND user_id = ${user.id} AND is_archived = FALSE`;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (approved === false) {
    await sql`UPDATE character_loras SET status = 'SHEETS_REJECTED', updated_at = NOW() WHERE id = ${id}`;
    return NextResponse.json({ status: "SHEETS_REJECTED" });
  }

  // Only from review, and only once — approving twice would submit and pay for
  // two training runs.
  if (row.status !== "SHEETS_REVIEW") {
    return NextResponse.json(
      { error: `This can't be approved from "${row.status}".`, status: row.status },
      { status: 409 }
    );
  }
  if (Object.keys(row.sheet_paths ?? {}).length === 0) {
    return NextResponse.json({ error: "There are no sheets to approve." }, { status: 400 });
  }

  await sql`UPDATE character_loras SET status = 'TRAINING', updated_at = NOW() WHERE id = ${id}`;

  try {
    const requestId = await submitTraining(id);
    return NextResponse.json({ status: "TRAINING", requestId });
  } catch (err) {
    // submitTraining marks the row FAILED itself; surface why rather than a 500.
    const message = err instanceof Error ? err.message : String(err);
    console.error("[soul-id] training submit failed:", id, message);
    return NextResponse.json({ error: message, status: "FAILED" }, { status: 502 });
  }
}
