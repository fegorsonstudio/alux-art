import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { makeTriggerPhrase, renderSoulIdSheets, signSheetUrls } from "@/lib/soul-id";

/**
 * A buyer's Soul IDs — trained identities they keep and reuse.
 *
 * GET  lists them.
 * POST starts a new one from photographs already in their identity library, and
 *      renders the four reference sheets for approval. It does NOT train: that
 *      costs money and happens only once the buyer has confirmed the sheets look
 *      like them.
 */

export const dynamic = "force-dynamic";

interface Row {
  id: string;
  label: string;
  status: string;
  training_image_count: number;
  sheet_paths: Record<string, string>;
  failure_reason: string | null;
  created_at: Date;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await sql<Row[]>`
    SELECT id, label, status, training_image_count, sheet_paths, failure_reason, created_at
    FROM character_loras
    WHERE user_id = ${user.id} AND is_archived = FALSE
    ORDER BY created_at DESC`;

  return NextResponse.json({
    soulIds: rows.map((r) => ({
      id: r.id,
      label: r.label,
      status: r.status,
      trainingImageCount: r.training_image_count,
      sheetCount: Object.keys(r.sheet_paths ?? {}).length,
      failureReason: r.failure_reason,
      createdAt: r.created_at,
    })),
  });
}

interface Body {
  label?: string;
  identityImageIds?: string[];
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { label, identityImageIds } = (await request.json()) as Body;
  if (!Array.isArray(identityImageIds) || identityImageIds.length === 0) {
    return NextResponse.json({ error: "Choose the photos to build this from." }, { status: 400 });
  }

  // Three is the floor. Below that the sheets have too little to work from and
  // the model starts inventing a face rather than reproducing one.
  const refs = await sql<Array<{ storage_bucket: string; storage_path: string }>>`
    SELECT storage_bucket, storage_path FROM identity_images
    WHERE user_id = ${user.id} AND id = ANY(${identityImageIds})`;
  if (refs.length < 3) {
    return NextResponse.json(
      { error: `Pick at least 3 photos — you chose ${refs.length}. More angles and expressions make a stronger likeness.` },
      { status: 400 }
    );
  }

  // One in flight at a time. Sheets cost four generations, and a buyer clicking
  // twice should not pay for eight.
  const [busy] = await sql<Array<{ id: string }>>`
    SELECT id FROM character_loras
    WHERE user_id = ${user.id} AND is_archived = FALSE
      AND status IN ('SHEETS_GENERATING', 'TRAINING')
    LIMIT 1`;
  if (busy) {
    return NextResponse.json({ error: "One is already being built. Wait for it to finish." }, { status: 409 });
  }

  const [row] = await sql<Array<{ id: string }>>`
    INSERT INTO character_loras ${sql({
      user_id: user.id,
      label: typeof label === "string" && label.trim() ? label.trim().slice(0, 60) : "My Soul ID",
      trigger_phrase: makeTriggerPhrase(),
      source_identity_refs: sql.json(refs.map((r) => ({ bucket: r.storage_bucket, path: r.storage_path })) as never),
    })} RETURNING id`;

  // Rendering four 4K sheets takes about three minutes, so it runs detached and
  // the buyer polls. We run under PM2, not a serverless function, so a detached
  // promise here genuinely survives; the row records its own progress either way.
  renderSoulIdSheets(row.id).catch((err) => {
    console.error("[soul-id] sheet rendering failed:", row.id, err instanceof Error ? err.message : err);
  });

  return NextResponse.json({ id: row.id, status: "SHEETS_GENERATING" }, { status: 201 });
}
