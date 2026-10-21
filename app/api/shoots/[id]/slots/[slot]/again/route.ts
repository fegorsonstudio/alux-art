import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { startGenerationWorker } from "@/lib/generate";
import sql from "@/lib/db";
import { isAdminEmail } from "@/lib/auth";
import { r2Copy } from "@/lib/r2";
import { safeResolution } from "@/lib/internal-auth";
import { withShootLock } from "@/lib/worker-lock";
import { INTERNAL_BASE_URL } from "@/lib/site-url";

/**
 * "Run again" on a FINISHED photo (owner, 2026-10-22): the same photo is made
 * once more from everything the shoot already has — the saved brief and its
 * per-slot prompt, the same references, lighting, styling and choices — so
 * only the model's own randomness changes. Nothing is set up again.
 *
 * The photo that is already there is KEPT: its file is copied to a new name
 * and a new row ("earlier take of #N", after the last slot) points at the copy,
 * then the slot itself is queued and re-made in place (same slot number, so the
 * same prompt). A worse result never costs a good one. lib/generate.ts and
 * lib/shortfall.ts leave "earlier take" rows out of a per-image order's count,
 * so a kept take is never treated as a missing or refundable photo.
 *
 * Admins only for now (owner's call): every run is a paid generation.
 * Failed photos keep their own Retry (../retry).
 */

export const maxDuration = 300;

const EARLIER_TAKE = /^earlier take/;
const BUSY = ["PROCESSING", "QUEUED", "GENERATING", "BASE_LOCKING", "BASE_REVIEW", "PENDING_PAYMENT"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; slot: string }> }) {
  const { id, slot: slotParam } = await params;
  const slotNum = parseInt(slotParam, 10);
  if (isNaN(slotNum) || slotNum < 1) return NextResponse.json({ error: "Invalid slot" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Run again is only available to the studio for now." }, { status: 403 });
  }

  const [shoot] = await sql`
    SELECT s.user_id, s.status, s.expires_at, s.character_base_id, t.category
    FROM shoots s LEFT JOIN templates t ON t.id = COALESCE(s.template_showcase_id, s.template_id)
    WHERE s.id = ${id}`;
  if (!shoot) return NextResponse.json({ error: "Shoot not found" }, { status: 404 });

  // Neither is made by lib/generate.ts photo by photo: a loop is one render, a
  // Glow Retouch photo is redone by the retouch worker.
  if (shoot.category === "gif_loop" || shoot.category === "photo_retouch") {
    return NextResponse.json({ error: "This kind of order can't be run again." }, { status: 409 });
  }
  if (BUSY.includes(shoot.status as string)) {
    return NextResponse.json({ error: "This order is still being made. Run a photo again once it has finished." }, { status: 409 });
  }
  if (shoot.expires_at && new Date(shoot.expires_at as string).getTime() <= Date.now()) {
    return NextResponse.json({ error: "This order has expired and its files were removed." }, { status: 410 });
  }
  // The customer's own photos are deleted 48 hours after a shoot; without them
  // the photo can't be made again (same rule as /regenerate).
  if (!shoot.character_base_id) {
    const [{ n } = { n: 0 }] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM shoot_references WHERE shoot_id = ${id} AND purpose = 'identity'`;
    if (n === 0) {
      return NextResponse.json({ error: "The photos this order was made from were removed after 48 hours, so it can't be run again." }, { status: 409 });
    }
  }

  // Keep the current photo and queue the slot, one request at a time.
  const prepared = await withShootLock(id, async () => {
    const [row] = await sql`SELECT * FROM shoot_images WHERE shoot_id = ${id} AND slot = ${slotNum}`;
    if (!row) return { error: "Photo not found", status: 404 } as const;
    if (EARLIER_TAKE.test(String(row.kind ?? ""))) {
      return { error: "This is a kept earlier take. Run the photo it came from instead.", status: 409 } as const;
    }
    if (row.status !== "COMPLETE") {
      return { error: row.status === "FAILED" ? "This photo failed — use Retry instead." : "This photo is still being made.", status: 409 } as const;
    }
    const downloadPath = (row.download_storage_path ?? row.preview_storage_path) as string | null;
    const downloadBucket = (row.download_storage_bucket ?? row.preview_storage_bucket) as string | null;
    if (!downloadPath || !downloadBucket) return { error: "This photo has no file to keep.", status: 409 } as const;

    // The kept file gets its own name: the slot's file is overwritten by the new take.
    const stamp = Date.now().toString(36);
    const takeName = (p: string) => (/\.\w+$/.test(p) ? p.replace(/\.(\w+)$/, `-take-${stamp}.$1`) : `${p}-take-${stamp}`);
    const keptDownload = takeName(downloadPath);
    await r2Copy(downloadBucket, downloadPath, downloadBucket, keptDownload);
    let keptPreview = keptDownload, keptPreviewBucket = downloadBucket;
    if (row.preview_storage_path && row.preview_storage_bucket
        && (row.preview_storage_path !== downloadPath || row.preview_storage_bucket !== downloadBucket)) {
      keptPreview = takeName(row.preview_storage_path as string);
      keptPreviewBucket = row.preview_storage_bucket as string;
      await r2Copy(keptPreviewBucket, row.preview_storage_path as string, keptPreviewBucket, keptPreview);
    }

    const [{ next }] = await sql<{ next: number }[]>`SELECT COALESCE(MAX(slot), 0)::int + 1 AS next FROM shoot_images WHERE shoot_id = ${id}`;
    await sql`
      INSERT INTO shoot_images (id, shoot_id, user_id, slot, kind, status, stage, provider, configured_model, api_model, prompt,
        preview_storage_bucket, preview_storage_path, download_storage_bucket, download_storage_path,
        width, height, file_size, preview_file_size, download_file_size, created_at, updated_at)
      VALUES (${crypto.randomUUID()}, ${id}, ${row.user_id}, ${next}, ${`earlier take of #${slotNum}`}, 'COMPLETE',
        ${`Earlier take of photo ${slotNum}, kept when it was run again`}, ${row.provider ?? null}, ${row.configured_model ?? null},
        ${row.api_model ?? null}, ${row.prompt ?? null},
        ${keptPreviewBucket}, ${keptPreview}, ${downloadBucket}, ${keptDownload},
        ${row.width ?? null}, ${row.height ?? null}, ${row.file_size ?? null}, ${row.preview_file_size ?? null},
        ${row.download_file_size ?? null}, NOW(), NOW())`;

    const queued = await sql`
      UPDATE shoot_images SET status = 'QUEUED', stage = 'Queued to run again', provider_error = NULL, updated_at = NOW()
      WHERE id = ${row.id} AND status = 'COMPLETE' RETURNING id`;
    if (!queued.length) return { error: "This photo changed while it was being queued. Try again.", status: 409 } as const;
    await sql`UPDATE shoots SET status = 'PROCESSING', pipeline_stage = ${`Running photo ${slotNum} again`}, updated_at = NOW() WHERE id = ${id}`;
    await sql`
      INSERT INTO generation_events (id, shoot_id, user_id, type, payload, created_at)
      VALUES (${crypto.randomUUID()}, ${id}, ${shoot.user_id}, 'run_again', ${sql.json({ slot: String(slotNum), keptAs: next, by: user.email })}, NOW())`
      .catch(() => {});
    return { keptAs: next } as const;
  });

  if (!prepared.locked) {
    return NextResponse.json({ error: "This order is busy. Try again in a moment." }, { status: 409 });
  }
  if ("error" in prepared.value) {
    return NextResponse.json({ error: prepared.value.error }, { status: prepared.value.status });
  }

  const body = await req.json().catch(() => ({}));
  const resolution = safeResolution((body as { resolution?: unknown }).resolution);

  // Same hand-off as Retry: run the worker here, and continue through /start
  // if anything is still queued when it returns.
  withShootLock(id, () => startGenerationWorker(id, { maxSlots: 1, resolution }))
    .then((run) => {
      if (run.locked && !run.value.done) {
        fetch(`${INTERNAL_BASE_URL}/api/shoots/${id}/start`, {
          method: "POST",
          headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "", "Content-Type": "application/json" },
          body: JSON.stringify({ resolution }),
        }).catch((err) => console.error("[run-again] continuation failed:", err));
      }
    })
    .catch((err) => console.error(`[run-again] slot ${slotNum} worker error:`, err));

  return NextResponse.json({ ok: true, slot: slotNum, keptAs: prepared.value.keptAs });
}
