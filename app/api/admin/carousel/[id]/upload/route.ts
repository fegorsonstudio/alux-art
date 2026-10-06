import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import sql from "@/lib/db";
import { r2Upload, r2Delete, r2ProxyUrl } from "@/lib/r2";
import {
  requireAdmin, cleanId, isLive, readiness, withdraw, BUCKET, type PostRow,
} from "@/lib/carousel/posts";

/**
 * Put a photograph or a story picture into its place on a post.
 *
 *   slot = before | after | scene-0 | scene-1 ...
 *
 * The slot comes from the box it was dropped on, never from the file's name:
 * Google Flow names its downloads ".png" whatever is inside, and the owner
 * names files however they like. The picture is read for what it is and stored
 * as one JPEG under a new key each time, so a replaced photo can never be
 * shown from a browser's cache in place of the new one.
 */

export const maxDuration = 120;

/** fal's per-image limit, which every other upload on the site agrees with. */
const MAX_SIZE = 30 * 1024 * 1024;
/** Well above anything a slide (1080 wide) or a GIF (1400) is drawn from. */
const MAX_SIDE = 3000;

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return fail(403, "Forbidden");
  const id = cleanId((await params).id);
  if (await isLive(id)) return fail(409, "This post is already on Instagram, so its pictures can't be changed here.");

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const slot = String(form?.get("slot") ?? "");
  if (!file || typeof file === "string") return fail(400, "Choose a picture.");
  if (file.size > MAX_SIZE) return fail(400, "That file is over 30MB.");
  if (file.type === "image/svg+xml" || /\.svg$/i.test(file.name)) return fail(400, "SVG files can't be used. Save it as a JPEG or PNG.");

  const scene = /^scene-(\d{1,2})$/.exec(slot);
  if (slot !== "before" && slot !== "after" && !scene) return fail(400, "Which picture is this?");

  let jpeg: Buffer;
  try {
    jpeg = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 92 })
      .toBuffer();
  } catch {
    return fail(400, "That file isn't a picture the server can read. Save it as a JPEG or PNG and try again.");
  }

  const key = `carousels/studio/${id}/${slot}-${Date.now()}.jpg`;
  await r2Upload(BUCKET, key, jpeg, "image/jpeg");

  type Outcome =
    | { error: string; code: number }
    | { status: string; old: string | null; unschedule: boolean; version: Date };
  // Under a row lock: two pictures dropped at once must both land.
  const out: Outcome = await sql.begin(async (trx): Promise<Outcome> => {
    const [row] = await trx<PostRow[]>`SELECT * FROM carousel_posts WHERE local_id = ${id} FOR UPDATE`;
    if (!row) return { error: "No such post.", code: 404 };

    let old: string | null = null;
    const next = { ...row, scene_paths: [...(row.scene_paths ?? [])] };
    if (slot === "before") { old = row.before_path; next.before_path = key; }
    else if (slot === "after") { old = row.after_path; next.after_path = key; }
    else {
      const i = Number(scene![1]);
      const count = row.storyboard?.scenes?.length ?? 0;
      if (i >= count) return { error: "This post has no such story picture.", code: 400 };
      while (next.scene_paths.length < count) next.scene_paths.push(null);
      old = next.scene_paths[i] ?? null;
      next.scene_paths[i] = key;
    }

    // A new picture is a change to what would be posted: approval goes.
    const status = readiness(next);
    const [saved] = await trx<{ updated_at: Date }[]>`
      UPDATE carousel_posts SET
        before_path = ${next.before_path}, after_path = ${next.after_path},
        scene_paths = ${trx.json(next.scene_paths)}, status = ${status},
        approved_at = NULL, updated_at = NOW()
      WHERE local_id = ${id}
      RETURNING updated_at`;
    return { status, old, unschedule: row.status === "scheduled", version: saved.updated_at };
  });

  if ("error" in out) {
    await r2Delete(BUCKET, [key]).catch(() => {});
    return fail(out.code, out.error);
  }
  const withdrawn = out.unschedule ? await withdraw(id) : false;
  // The replaced file belongs to nothing now — the slides already handed to
  // the publisher are copies under their own keys.
  if (out.old) await r2Delete(BUCKET, [out.old]).catch(() => {});

  return NextResponse.json({
    ok: true, url: `${r2ProxyUrl(BUCKET, key)}&width=800`,
    status: out.status, version: out.version, withdrawn,
  });
}
