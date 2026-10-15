import "server-only";
import { timingSafeEqual } from "crypto";
import sharp from "sharp";
import sql from "@/lib/db";
import { r2SignedDownloadUrl, r2Upload } from "@/lib/r2";
import { tellAdmin } from "@/lib/telegram";

/**
 * Glow Retouch jobs for the studio's own computer.
 *
 * Since 15 Oct 2026 the owner's Fegorson Studio (their Windows retoucher, on their laptop)
 * does the retouching while Glow Retouch is being tested: it cannot run on this server (it
 * needs 2-3 GB a photo), and its results are what the owner wants customers to get. A small
 * program on the laptop asks /api/retouch-worker/next for a photo, renders it with the
 * owner's preset and posts the file to /api/retouch-worker/result. Photo N of an order is
 * slot N, the same mapping the server worker (workers/retouch) uses; app_config
 * retouch_engine = 'laptop' stands that worker aside.
 *
 * The laptop holds RETOUCH_WORKER_TOKEN; nothing else reaches these routes.
 */

export function workerAuthorized(req: Request): boolean {
  const want = process.env.RETOUCH_WORKER_TOKEN ?? "";
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (want.length < 32 || got.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

const attempts = (stage: string | null) => Number(/attempt (\d+)/.exec(stage ?? "")?.[1] ?? 0);
/** A photo the laptop took and never answered for (switched off, crashed) is offered again after this. */
const STALE_MINUTES = 15;
/** Taken this many times without an answer: a person finishes it. */
const MAX_TRIES = 2;

export type RetouchJob = {
  imageId: string; shootId: string; slot: number; total: number;
  originalUrl: string; fileName: string; preset: string;
};

async function customer(shootId: string): Promise<string> {
  const [r] = await sql<{ ig_username: string | null; ig_user_id: string | null }[]>`
    SELECT s.ig_username, sh.ig_user_id FROM shoots sh
    LEFT JOIN instagram_sessions s ON s.ig_user_id = sh.ig_user_id AND s.ig_account_id = sh.ig_account_id
    WHERE sh.id = ${shootId} LIMIT 1`.catch(() => []);
  if (r?.ig_username) return `@${r.ig_username}`;
  return r?.ig_user_id ? `Instagram user ${r.ig_user_id}` : "a website order";
}

async function original(shootId: string, slot: number): Promise<{ bucket: string; path: string } | null> {
  const refs = await sql<{ storage_bucket: string; storage_path: string }[]>`
    SELECT storage_bucket, storage_path FROM shoot_references
    WHERE shoot_id = ${shootId} AND purpose = 'identity' ORDER BY created_at ASC, id ASC`;
  const r = refs[slot - 1];
  return r ? { bucket: r.storage_bucket, path: r.storage_path } : null;
}

/** Done when no photo is left to work on: COMPLETE if any came back, FAILED if none did. */
export async function finishShoot(shootId: string): Promise<void> {
  const [c] = await sql<{ done: number; left: number; total: number }[]>`
    SELECT count(*) FILTER (WHERE status = 'COMPLETE')::int AS done,
           count(*) FILTER (WHERE status IN ('PENDING', 'QUEUED', 'GENERATING'))::int AS left,
           count(*)::int AS total
    FROM shoot_images WHERE shoot_id = ${shootId}`;
  if (c.left === 0) {
    await sql`UPDATE shoots SET status = ${c.done > 0 ? "COMPLETE" : "FAILED"}, progress = 100,
                pipeline_stage = ${c.done > 0 ? "Complete" : "No photos could be retouched"},
                completed_at = NOW(), updated_at = NOW()
              WHERE id = ${shootId} AND status IN ('QUEUED', 'PROCESSING')`;
  } else {
    await sql`UPDATE shoots SET progress = ${Math.max(10, Math.round((100 * c.done) / Math.max(1, c.total)))},
                pipeline_stage = ${`Retouched ${c.done}/${c.total}`}, updated_at = NOW()
              WHERE id = ${shootId}`;
  }
}

/** Hand a photo to a person: never sent half-done, the studio is told with the original. */
export async function failJob(imageId: string, reason: string): Promise<boolean> {
  const [img] = await sql<{ shoot_id: string; slot: number }[]>`
    UPDATE shoot_images SET status = 'FAILED', stage = ${("Needs a person: " + reason).slice(0, 200)},
           provider = 'fegorson-studio', provider_error = ${reason.slice(0, 1000)}, updated_at = NOW()
    WHERE id = ${imageId} AND status = 'GENERATING'
    RETURNING shoot_id, slot`;
  if (!img) return false;
  const orig = await original(img.shoot_id, img.slot);
  const link = orig ? await r2SignedDownloadUrl(orig.bucket, orig.path, 3 * 24 * 3600).catch(() => null) : null;
  await tellAdmin(
    `✋ <b>Glow Retouch needs your hands</b>\n\n` +
    `Customer: ${await customer(img.shoot_id)}\nShoot: <code>${img.shoot_id}</code>\n` +
    `Photo ${img.slot}: ${reason.replace(/[<>&]/g, "")}\n\n` +
    `It was NOT sent to the customer. They will be told a person is finishing it.` +
    (link ? `\n\nTheir original (link works 3 days):\n${link}` : "")).catch(() => {});
  await finishShoot(img.shoot_id);
  return true;
}

/** The next photo to retouch, or null. Takes it, so two calls never get the same one. */
export async function claimNext(): Promise<RetouchJob | null> {
  // Photos taken and never answered for go back in the queue, or to a person.
  const stale = await sql<{ id: string; stage: string | null }[]>`
    SELECT i.id, i.stage FROM shoot_images i
    JOIN shoots s ON s.id = i.shoot_id JOIN templates t ON t.id = s.template_id
    WHERE t.category = 'photo_retouch' AND i.status = 'GENERATING'
      AND i.updated_at < NOW() - (${STALE_MINUTES} * interval '1 minute')`;
  for (const s of stale) {
    if (attempts(s.stage) >= MAX_TRIES) {
      await failJob(s.id, "the studio computer took this photo twice and never finished it");
    } else {
      await sql`UPDATE shoot_images SET status = 'QUEUED', updated_at = NOW(),
                  stage = ${`Waiting to retry (attempt ${attempts(s.stage)})`}
                WHERE id = ${s.id} AND status = 'GENERATING'`;
    }
  }

  for (let guard = 0; guard < 5; guard++) {
    const taken = await sql.begin(async (tx) => {
      const [c] = await tx<{ id: string; shoot_id: string; slot: number; stage: string | null }[]>`
        SELECT i.id, i.shoot_id, i.slot, i.stage FROM shoot_images i
        JOIN shoots s ON s.id = i.shoot_id JOIN templates t ON t.id = s.template_id
        WHERE t.category = 'photo_retouch' AND s.status IN ('QUEUED', 'PROCESSING')
          AND i.status IN ('PENDING', 'QUEUED')
        ORDER BY s.created_at ASC, i.slot ASC
        LIMIT 1 FOR UPDATE OF i SKIP LOCKED`;
      if (!c) return null;
      await tx`UPDATE shoot_images SET status = 'GENERATING', updated_at = NOW(),
                 stage = ${`Retouching on the studio computer (attempt ${attempts(c.stage) + 1})`}
               WHERE id = ${c.id}`;
      await tx`UPDATE shoots SET status = 'PROCESSING', progress = GREATEST(COALESCE(progress, 0), 5),
                 pipeline_stage = 'Retouching', updated_at = NOW()
               WHERE id = ${c.shoot_id} AND status = 'QUEUED'`;
      return c;
    });
    if (!taken) return null;

    const orig = await original(taken.shoot_id, taken.slot);
    if (!orig) {
      await failJob(taken.id, "no photo was attached for this slot");
      continue;
    }
    const [{ total }] = await sql<{ total: number }[]>`
      SELECT count(*)::int AS total FROM shoot_images WHERE shoot_id = ${taken.shoot_id}`;
    const [cfg] = await sql<{ value: string }[]>`SELECT value FROM app_config WHERE key = 'retouch_preset'`;
    return {
      imageId: taken.id, shootId: taken.shoot_id, slot: taken.slot, total,
      originalUrl: await r2SignedDownloadUrl(orig.bucket, orig.path, 3600),
      fileName: orig.path.split("/").pop() ?? `photo-${taken.slot}.jpg`,
      preset: cfg?.value || "Hanna",
    };
  }
  return null;
}

/** The finished file from the studio computer: stored, the photo marked done, the order closed if complete. */
export async function saveResult(imageId: string, file: Buffer, engine: string): Promise<{ ok: boolean; error?: string }> {
  const [img] = await sql<{ shoot_id: string; slot: number; user_id: string }[]>`
    SELECT i.shoot_id, i.slot, s.user_id FROM shoot_images i
    JOIN shoots s ON s.id = i.shoot_id JOIN templates t ON t.id = s.template_id
    WHERE i.id = ${imageId} AND i.status = 'GENERATING' AND t.category = 'photo_retouch'`;
  if (!img) return { ok: false, error: "That photo is not being retouched (finished, failed or never taken)." };
  let meta: sharp.Metadata;
  try { meta = await sharp(file).metadata(); } catch { return { ok: false, error: "The file is not a readable image." }; }
  if (meta.format !== "jpeg" || !meta.width || !meta.height) return { ok: false, error: "Send the result as a JPEG." };
  const key = `${img.user_id}/${img.shoot_id}/retouch-${img.slot}.jpg`;
  await r2Upload("generated-4k", key, file, "image/jpeg");
  await sql`UPDATE shoot_images SET status = 'COMPLETE', width = ${meta.width}, height = ${meta.height},
              file_size = ${file.byteLength}, download_file_size = ${file.byteLength}, stage = 'Retouched',
              provider = 'fegorson-studio', configured_model = ${engine.slice(0, 60) || "fegorson-studio"},
              preview_storage_bucket = 'generated-4k', preview_storage_path = ${key},
              download_storage_bucket = 'generated-4k', download_storage_path = ${key},
              provider_error = NULL, updated_at = NOW()
            WHERE id = ${imageId} AND status = 'GENERATING'`;
  await finishShoot(img.shoot_id);
  return { ok: true };
}
