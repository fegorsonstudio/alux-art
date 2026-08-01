/**
 * Soul ID — turning a handful of the buyer's photographs into a trained identity.
 *
 * Three steps, each resumable because each writes its result to the row before
 * the next begins:
 *
 *   1. RENDER   four character reference sheets from the buyer's uploads.
 *   2. APPROVE  the buyer confirms it looks like them (the API route does this).
 *   3. TRAIN    slice the sheets into ~20 frames, add the originals, zip, and
 *               train a FLUX LoRA on fal.
 *
 * The result is a `lora_url` that lib/generate.ts hands to fal-ai/flux-lora on
 * every boudoir slot, so likeness comes from trained weights rather than from
 * reference photographs re-read (and re-interpreted) on each generation.
 */

import { fal } from "@fal-ai/client";
import sharp from "sharp";
import sql from "./db";
import { r2Upload, r2Download, r2SignedDownloadUrl } from "./r2";
import {
  CHARACTER_SHEETS,
  buildCharacterSheetPrompt,
  panelRects,
  characterSheetById,
  type CharacterSheet,
} from "./character-sheet";

export const SHEET_BUCKET = "character-bases";
const SIGNED_TTL = 3600;

/** fal's portrait trainer defaults to 2500 steps; that is tuned for exactly this
 *  job (one person, 20-30 images) and is what Higgsfield-class results use. */
const TRAINING_STEPS = 2500;

export interface SourceRef { bucket: string; path: string }

export interface SoulIdRow {
  id: string;
  user_id: string;
  label: string;
  trigger_phrase: string;
  source_identity_refs: SourceRef[];
  sheet_paths: Record<string, string>;
  identity_profile: string;
  lora_url: string | null;
  status: string;
}

/**
 * The token the LoRA binds to. It has to be rare enough that FLUX has no prior
 * for it — a real word would blend the person with whatever the model already
 * associates with that word.
 */
export function makeTriggerPhrase(): string {
  const id = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `sks${id} person`;
}

// ── Step 1: render the sheets ───────────────────────────────────────────────

/**
 * One sheet. Deliberately a local fal call rather than reusing generate.ts's
 * private helper: that file is the live shoot path and is not worth destabilising
 * to save fifteen lines here.
 */
async function renderSheet(
  sheet: CharacterSheet,
  identityUrls: string[],
  identityProfile: string
): Promise<Buffer> {
  const prompt = buildCharacterSheetPrompt(sheet, identityProfile);
  const response = await fal.subscribe("fal-ai/nano-banana-2/edit", {
    input: {
      prompt,
      num_images: 1,
      aspect_ratio: sheet.aspect as unknown as "1:1",
      output_format: "png",
      safety_tolerance: "6",
      image_urls: identityUrls.slice(0, 8),
      limit_generations: false,
      resolution: "4K" as unknown as "4K",
    },
  });
  const out = ((response as Record<string, unknown>).data || response) as { images?: Array<{ url: string }> };
  const url = out.images?.[0]?.url;
  if (!url) throw new Error(`sheet "${sheet.id}" returned no image`);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`sheet "${sheet.id}" download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Render all four sheets and park them for approval. Sheets are rendered one at
 * a time on purpose: they share an identity and rendering them in parallel gave
 * fal no reason to keep them consistent, while costing the same.
 */
export async function renderSoulIdSheets(loraId: string): Promise<void> {
  const [row] = await sql<SoulIdRow[]>`
    SELECT id, user_id, trigger_phrase, source_identity_refs, identity_profile
    FROM character_loras WHERE id = ${loraId}`;
  if (!row) throw new Error(`Soul ID ${loraId} not found`);

  const refs = (row.source_identity_refs ?? []) as SourceRef[];
  if (refs.length === 0) throw new Error("Soul ID has no source photographs");

  const identityUrls = (await Promise.all(
    refs.map((r) => r2SignedDownloadUrl(r.bucket, r.path, SIGNED_TTL).catch(() => ""))
  )).filter(Boolean);
  if (identityUrls.length === 0) throw new Error("none of the source photographs could be signed");

  const paths: Record<string, string> = {};
  try {
    for (const sheet of CHARACTER_SHEETS) {
      const buf = await renderSheet(sheet, identityUrls, row.identity_profile ?? "");
      const path = `${row.user_id}/${loraId}/sheet-${sheet.id}.png`;
      await r2Upload(SHEET_BUCKET, path, buf, "image/png");
      paths[sheet.id] = path;
      // Written as each one lands, so a failure on sheet four does not throw
      // away the three that already cost money.
      await sql`UPDATE character_loras SET sheet_paths = ${sql.json(paths)}, updated_at = NOW() WHERE id = ${loraId}`;
    }
    await sql`UPDATE character_loras SET status = 'SHEETS_REVIEW', updated_at = NOW() WHERE id = ${loraId}`;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await sql`UPDATE character_loras SET status = 'FAILED', failure_reason = ${reason.slice(0, 500)}, updated_at = NOW() WHERE id = ${loraId}`;
    throw err;
  }
}

// ── Step 3: slice, zip, train ───────────────────────────────────────────────

/**
 * Cut each sheet back into its panels.
 *
 * We authored the grid and forbade outer margins, so the rectangles in
 * panelRects() are exact — no vision call is needed to find the panels. Each
 * crop is re-encoded as a standalone JPEG, which is what the trainer wants.
 */
export async function buildTrainingImages(loraId: string): Promise<Array<{ name: string; buffer: Buffer }>> {
  const [row] = await sql<SoulIdRow[]>`
    SELECT id, user_id, sheet_paths, source_identity_refs FROM character_loras WHERE id = ${loraId}`;
  if (!row) throw new Error(`Soul ID ${loraId} not found`);

  const images: Array<{ name: string; buffer: Buffer }> = [];

  for (const [sheetId, path] of Object.entries(row.sheet_paths ?? {})) {
    const sheet = characterSheetById(sheetId);
    if (!sheet) continue;
    const { buffer } = await r2Download(SHEET_BUCKET, path);
    const meta = await sharp(buffer).metadata();
    const W = meta.width ?? 0;
    const H = meta.height ?? 0;
    if (!W || !H) throw new Error(`sheet "${sheetId}" has no dimensions`);

    for (const rect of panelRects(sheet)) {
      const crop = await sharp(buffer)
        .extract({
          left: Math.round(rect.left * W),
          top: Math.round(rect.top * H),
          width: Math.round(rect.width * W),
          height: Math.round(rect.height * H),
        })
        // The trainer does its own resizing; 1024 on the long edge keeps the zip
        // small without throwing away detail it can use.
        .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 92 })
        .toBuffer();
      images.push({ name: `${sheetId}-${rect.panel.id}.jpg`, buffer: crop });
    }
  }

  // The buyer's real photographs go in too. The sheets are generated, and a LoRA
  // trained only on generated frames drifts toward the generator's idea of the
  // face rather than the face itself.
  for (const [i, ref] of ((row.source_identity_refs ?? []) as SourceRef[]).entries()) {
    try {
      const { buffer } = await r2Download(ref.bucket, ref.path);
      const norm = await sharp(buffer)
        .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 92 })
        .toBuffer();
      images.push({ name: `source-${i + 1}.jpg`, buffer: norm });
    } catch (err) {
      console.warn("[soul-id] source photo unreadable, skipping:", ref.path, err instanceof Error ? err.message : err);
    }
  }

  return images;
}

/**
 * Zip the training set, hand it to fal, and record the trained weights.
 *
 * Runs after the buyer approves the sheets — training a LoRA on a sheet that
 * does not look like them bakes the wrong face into everything that follows.
 */
export async function trainSoulId(loraId: string): Promise<string> {
  const [row] = await sql<SoulIdRow[]>`
    SELECT id, trigger_phrase FROM character_loras WHERE id = ${loraId}`;
  if (!row) throw new Error(`Soul ID ${loraId} not found`);

  try {
    const images = await buildTrainingImages(loraId);
    if (images.length < 12) {
      throw new Error(`only ${images.length} training images — too few for a stable identity`);
    }

    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    for (const img of images) zip.file(img.name, img.buffer);
    const zipBuf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });

    const zipUrl = await fal.storage.upload(
      new File([new Uint8Array(zipBuf)], `soul-id-${loraId}.zip`, { type: "application/zip" })
    );

    await sql`
      UPDATE character_loras
      SET status = 'TRAINING', training_image_count = ${images.length}, updated_at = NOW()
      WHERE id = ${loraId}`;

    const result = await fal.subscribe("fal-ai/flux-lora-portrait-trainer", {
      input: {
        images_data_url: zipUrl,
        trigger_phrase: row.trigger_phrase,
        steps: TRAINING_STEPS,
        // Crops each frame to the subject, so the varied backdrops across the
        // four sheets do not end up as part of what is learned.
        subject_crop: true,
        multiresolution_training: true,
      },
    });

    const data = ((result as Record<string, unknown>).data || result) as {
      diffusers_lora_file?: { url?: string };
    };
    const loraUrl = data.diffusers_lora_file?.url;
    if (!loraUrl) throw new Error("training finished but returned no LoRA file");

    const requestId = (result as { requestId?: string }).requestId ?? null;
    await sql`
      UPDATE character_loras
      SET status = 'READY', lora_url = ${loraUrl}, training_request_id = ${requestId}, updated_at = NOW()
      WHERE id = ${loraId}`;

    return loraUrl;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await sql`UPDATE character_loras SET status = 'FAILED', failure_reason = ${reason.slice(0, 500)}, updated_at = NOW() WHERE id = ${loraId}`;
    throw err;
  }
}

/** Signed URLs for the approval screen. */
export async function signSheetUrls(sheetPaths: Record<string, string>): Promise<Array<{ id: string; label: string; url: string }>> {
  const out: Array<{ id: string; label: string; url: string }> = [];
  for (const sheet of CHARACTER_SHEETS) {
    const path = sheetPaths?.[sheet.id];
    if (!path) continue;
    const url = await r2SignedDownloadUrl(SHEET_BUCKET, path, SIGNED_TTL).catch(() => "");
    if (url) out.push({ id: sheet.id, label: sheet.label, url });
  }
  return out;
}

/** The buyer's usable Soul ID, if they have one. */
export async function readySoulIdFor(userId: string): Promise<{ id: string; lora_url: string; trigger_phrase: string } | null> {
  const [row] = await sql<Array<{ id: string; lora_url: string; trigger_phrase: string }>>`
    SELECT id, lora_url, trigger_phrase
    FROM character_loras
    WHERE user_id = ${userId} AND status = 'READY' AND lora_url IS NOT NULL AND is_archived = FALSE
    ORDER BY created_at DESC LIMIT 1`;
  return row ?? null;
}
