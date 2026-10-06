import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import sql from "@/lib/db";
import { r2Download, r2ProxyUrl } from "@/lib/r2";
import {
  requireAdmin, cleanId, loadPost, gifRoute, gifTags, BUCKET, EPISODE_KICKER,
} from "@/lib/carousel/posts";

/**
 * A post's story GIF, for Instagram comments.
 *
 *   make    — draw it from the post's before and after photos and its lines
 *   clear   — record (or withdraw) the owner's tick that everyone in the
 *             photos agreed to a public GIF
 *   publish — put it on the Aluxart GIPHY channel: only with the tick, and
 *             only once, because GIPHY has no delete
 *
 * The making and publishing are /api/carousel/gif's, unchanged — the same
 * route the laptop studio used, called here on this machine.
 */

export const maxDuration = 120;

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

/** The GIF is encoded 480 wide; anything past 1400 is bytes for nothing. */
async function small(path: string): Promise<string> {
  const { buffer } = await r2Download(BUCKET, path);
  const out = await sharp(buffer).rotate()
    .resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 88 }).toBuffer();
  return out.toString("base64");
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return fail(403, "Forbidden");
  const id = cleanId((await params).id);
  const body = ((await request.json().catch(() => null)) ?? {}) as { action?: string; lines?: unknown; cleared?: unknown };
  const row = await loadPost(id);
  if (!row) return fail(404, "No such post.");

  if (body.action === "clear") {
    await sql`UPDATE carousel_posts SET gif_cleared = ${body.cleared === true} WHERE local_id = ${id}`;
    return NextResponse.json({ ok: true, cleared: body.cleared === true });
  }

  if (body.action === "make") {
    if (!row.before_path || !row.after_path) {
      return fail(400, "This post needs its before and after photos before it can have a GIF.");
    }
    const lines = (Array.isArray(body.lines) && body.lines.length ? body.lines : row.gif_lines ?? [])
      .map((s) => String(s ?? "").trim()).filter(Boolean);
    const r = await gifRoute({
      action: "render", localId: id,
      before: await small(row.before_path), after: await small(row.after_path),
      // Every episode, either season, carries the series name on its frames.
      lines, kicker: row.storyboard ? EPISODE_KICKER : undefined,
    });
    if (!r.ok) return fail(r.status, r.error);

    // The lines it was made from are the post's lines from now on.
    const edited = JSON.stringify(lines) !== JSON.stringify(row.gif_lines ?? []);
    await sql`
      UPDATE carousel_posts SET gif_lines = ${sql.json(lines)}, gif_lines_edited = gif_lines_edited OR ${edited}
      WHERE local_id = ${id}`;
    return NextResponse.json({
      ok: true,
      gif: {
        url: `${r2ProxyUrl(BUCKET, `carousels/gifs/${id}.gif`)}&v=${Date.now()}`,
        bytes: r.body.bytes, seconds: r.body.seconds, giphyUrl: r.body.giphyUrl ?? null,
      },
    });
  }

  if (body.action === "publish") {
    if (body.cleared !== true && !row.gif_cleared) {
      return fail(400, "Tick the box first: everyone in these photos must have agreed to a public GIF.");
    }
    if (!row.gif_cleared) await sql`UPDATE carousel_posts SET gif_cleared = true WHERE local_id = ${id}`;
    const r = await gifRoute({ action: "publish", localId: id, cleared: true, tags: gifTags(row) });
    if (!r.ok) return fail(r.status, r.error);
    return NextResponse.json({ ok: true, giphyUrl: r.body.giphyUrl ?? null, already: Boolean(r.body.already) });
  }

  return fail(400, "Unknown action.");
}
