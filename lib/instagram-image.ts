import "server-only";
import sharp from "sharp";
import sql from "@/lib/db";
import { r2Download, r2Upload } from "@/lib/r2";

/**
 * A copy of a finished image that Instagram will actually accept.
 *
 * Instagram refuses an image attachment over 8MB with error_subcode 2018047 —
 * "an error occurred while uploading the attachment", which says nothing about
 * size and arrived in Russian. A 4K relight is a ~21MB PNG, so EVERY delivery
 * failed silently and retried forever.
 *
 * Unlike WhatsApp there is no document escape hatch: Instagram's messaging API
 * takes image, audio and video attachments only. So the best quality that can
 * reach a DM is the largest JPEG that fits under the cap, and the true 4K file
 * stays on the website.
 *
 * Made once and recorded on the row, so a retry or a second delivery does not
 * re-encode a 21MB PNG every two minutes.
 */

/** Instagram's hard limit is 8MB. Aim under it — their check is on the fetched bytes. */
const TARGET_BYTES = 7_600_000;

/** Full resolution first. Only shrink when quality alone cannot get under the cap. */
const QUALITY_STEPS = [92, 88, 82, 74];
const WIDTH_STEPS = [null, 3000, 2400, 2000];

export type IgReadyCopy = { bucket: string; path: string; bytes: number; width: number; height: number };

export async function instagramReadyCopy(
  imageId: string,
  sourceBucket: string,
  sourcePath: string,
): Promise<IgReadyCopy | null> {
  // Already made for this image.
  const [existing] = await sql<{ b: string | null; p: string | null; s: number | null }[]>`
    SELECT instagram_storage_bucket AS b, instagram_storage_path AS p, instagram_file_size AS s
    FROM shoot_images WHERE id = ${imageId}`;
  if (existing?.p && existing.b) {
    return { bucket: existing.b, path: existing.p, bytes: existing.s ?? 0, width: 0, height: 0 };
  }

  let source: Buffer;
  try {
    source = (await r2Download(sourceBucket, sourcePath)).buffer;
  } catch (e) {
    console.error("[ig image] could not read source:", (e as Error).message);
    return null;
  }

  let chosen: { buffer: Buffer; width: number; height: number } | null = null;

  // Quality first at full resolution, because a smaller file at native size
  // still looks sharper on a phone than a downscaled one at high quality.
  outer:
  for (const width of WIDTH_STEPS) {
    for (const quality of QUALITY_STEPS) {
      const pipeline = sharp(source).rotate();
      if (width) pipeline.resize({ width, withoutEnlargement: true });
      const buffer = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
      if (buffer.byteLength <= TARGET_BYTES) {
        const meta = await sharp(buffer).metadata();
        chosen = { buffer, width: meta.width ?? 0, height: meta.height ?? 0 };
        break outer;
      }
    }
  }

  if (!chosen) {
    console.error("[ig image] could not get under the cap even at the smallest step");
    return null;
  }

  const path = sourcePath.replace(/\.[a-z0-9]+$/i, "") + "-ig.jpg";
  try {
    await r2Upload(sourceBucket, path, chosen.buffer, "image/jpeg");
  } catch (e) {
    console.error("[ig image] upload failed:", (e as Error).message);
    return null;
  }

  await sql`
    UPDATE shoot_images
    SET instagram_storage_bucket = ${sourceBucket},
        instagram_storage_path   = ${path},
        instagram_file_size      = ${chosen.buffer.byteLength}
    WHERE id = ${imageId}`.catch((e) => {
      // The file is written and usable; failing to record it only costs a
      // re-encode next time, so this must not abort a delivery.
      console.warn("[ig image] could not record the copy:", (e as Error).message);
    });

  console.log(
    `[ig image] made ${chosen.width}x${chosen.height} JPEG, ` +
    `${(chosen.buffer.byteLength / 1048576).toFixed(1)}MB (source was ` +
    `${(source.byteLength / 1048576).toFixed(1)}MB)`
  );
  return { bucket: sourceBucket, path, bytes: chosen.buffer.byteLength, width: chosen.width, height: chosen.height };
}
