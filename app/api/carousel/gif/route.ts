import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { r2Upload, r2Download } from "@/lib/r2";
import { renderArFrames, encodeGif } from "@/lib/gif-loop";
import { publishLoop } from "@/lib/giphy";
import { cleanTags } from "@/lib/giphy-publish";

/**
 * A story GIF for one carousel post — made here, published separately.
 *
 * The studio (/admin/carousel) sends the post's before and after photographs
 * and four or five short lines; this composes them with the same engine as the paid GIF
 * Maker, which was built for the one size that matters here: a GIF in an
 * Instagram comment is about 200 pixels wide, so it carries three or four huge
 * words beside the photograph and nothing small at all.
 *
 * Two actions, on purpose:
 *
 *   render  — make the GIF and keep the master in R2. Free, repeatable, and
 *             what the owner looks at before anything goes public.
 *   publish — put that exact GIF on the Aluxart GIPHY channel. Refused unless
 *             the owner has ticked that everyone in the photos agreed to a
 *             public GIF, and refused a second time for the same post: GIPHY
 *             has no delete in its API, so a duplicate stays up for good.
 *
 * Internal only. The website's admin studio calls it on this machine with the
 * internal secret (gifRoute in lib/carousel/posts.ts), so there is one GIF
 * maker and one publish-once rule.
 */

const BUCKET = "generated-4k";
/** GIPHY's guidance; their hard limit is 100MB, but 8MB is what plays smoothly. */
const MAX_BYTES = 8 * 1024 * 1024;
/** Composed at video width, then encoded small: comment GIFs are shown tiny. */
const COMPOSE_WIDTH = 960;
const GIF_WIDTHS = [480, 360];
const MAX_LINES = 6;
const MAX_LINE_CHARS = 32;

const keyFor = (localId: string) => `carousels/gifs/${localId}.gif`;
const cleanId = (s: unknown) => String(s ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);

export async function POST(request: NextRequest) {
  if (!process.env.INTERNAL_API_SECRET ||
      request.headers.get("x-internal-secret") !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const localId = cleanId(body.localId);
  if (!localId) return NextResponse.json({ error: "Which post is this for?" }, { status: 400 });

  if (body.action === "render") return render(localId, body);
  if (body.action === "publish") return publish(localId, body);
  return NextResponse.json({ error: "action must be render or publish" }, { status: 400 });
}

async function render(localId: string, body: Record<string, unknown>) {
  const before = Buffer.from(String(body.before ?? ""), "base64");
  const after = Buffer.from(String(body.after ?? ""), "base64");
  if (before.length < 100 || after.length < 100) {
    return NextResponse.json({ error: "The GIF needs the post's before and after photos." }, { status: 400 });
  }

  const lines = (Array.isArray(body.lines) ? body.lines : [])
    .map((l) => String(l ?? "").trim()).filter(Boolean);
  if (lines.length < 2 || lines.length > MAX_LINES) {
    return NextResponse.json({ error: `Give the GIF between 2 and ${MAX_LINES} lines.` }, { status: 400 });
  }
  const long = lines.find((l) => l.length > MAX_LINE_CHARS);
  if (long) {
    return NextResponse.json({
      error: `"${long}" is too long to read at comment size. Keep each line under ${MAX_LINE_CHARS} characters — three or four words.`,
    }, { status: 400 });
  }
  const kicker = typeof body.kicker === "string" && body.kicker.trim() ? body.kicker.trim().slice(0, 24) : undefined;

  // The address closes every loop: the one line a stranger who finds the GIF
  // in a comment can act on. The engine sets it centred and smaller, and puts
  // the reveal on the beat before it — the last story line.
  const beats = [...lines, "aluxartandframes.shop"].map((text) => ({ text }));

  let frames: Buffer[]; let fps: number;
  try {
    ({ frames, fps } = await renderArFrames({
      before, after, headline: lines[0], beats, kicker,
      width: COMPOSE_WIDTH, ratio: "16:9",
    }));
  } catch (e) {
    return NextResponse.json({ error: `Could not compose the GIF: ${(e as Error).message}`.slice(0, 200) }, { status: 500 });
  }

  // Smallest acceptable file at the largest width that fits GIPHY's guidance.
  let gif: Buffer | null = null;
  for (const w of GIF_WIDTHS) {
    gif = await encodeGif(frames, fps, w);
    if (gif.length <= MAX_BYTES) break;
  }
  if (!gif || gif.length > MAX_BYTES) {
    return NextResponse.json({ error: "The GIF came out too large even at the smallest size. Cut a line and try again." }, { status: 422 });
  }
  const seconds = Math.round((frames.length / fps) * 100) / 100;

  const key = keyFor(localId);
  await r2Upload(BUCKET, key, gif, "image/gif");
  // A re-render replaces the master, but never forgets a publication: the GIF
  // already on GIPHY is still up and still this post's.
  await sql`
    INSERT INTO carousel_gifs (local_id, r2_key, bytes, seconds)
    VALUES (${localId}, ${key}, ${gif.length}, ${seconds})
    ON CONFLICT (local_id) DO UPDATE
      SET r2_key = EXCLUDED.r2_key, bytes = EXCLUDED.bytes,
          seconds = EXCLUDED.seconds, updated_at = NOW()`;

  const [row] = await sql<{ giphy_url: string | null }[]>`SELECT giphy_url FROM carousel_gifs WHERE local_id = ${localId}`;
  return NextResponse.json({
    ok: true, bytes: gif.length, seconds, gif: gif.toString("base64"),
    giphyUrl: row?.giphy_url ?? null,
  });
}

async function publish(localId: string, body: Record<string, unknown>) {
  if (body.cleared !== true) {
    return NextResponse.json({
      error: "Tick the box saying everyone in these photos agreed to a public GIF first. GIPHY is public: anyone can find, download and reuse it.",
    }, { status: 400 });
  }

  const [row] = await sql<{ r2_key: string; giphy_id: string | null; giphy_url: string | null; giphy_tag: string | null }[]>`
    SELECT r2_key, giphy_id, giphy_url, giphy_tag FROM carousel_gifs WHERE local_id = ${localId}`;
  if (!row) return NextResponse.json({ error: "Make the GIF first, then publish it." }, { status: 400 });

  // Once only. GIPHY's API has no delete, so a second upload is a second copy
  // on the channel for good — which is the opposite of what pressing a button
  // twice should do.
  if (row.giphy_id) {
    return NextResponse.json({ ok: true, already: true, giphyUrl: row.giphy_url, tag: row.giphy_tag });
  }

  const { buffer: gif } = await r2Download(BUCKET, row.r2_key);
  // The post id, without the studio's "plan-" prefix, becomes the GIF's own
  // findable tag (aluxartm01, aluxartp12) through giphyTagFor.
  const out = await publishLoop(gif, {
    shootId: localId.replace(/^plan-/, ""),
    extraTags: cleanTags(body.tags),
  });
  if (!out.ok) {
    return NextResponse.json({ error: `GIPHY said no: ${out.error}` }, { status: 502 });
  }

  await sql`
    UPDATE carousel_gifs
    SET giphy_id = ${out.id}, giphy_url = ${out.url}, giphy_tag = ${out.tag},
        cleared = true, cleared_at = COALESCE(cleared_at, NOW()),
        published_at = NOW(), updated_at = NOW()
    WHERE local_id = ${localId}`;
  return NextResponse.json({ ok: true, giphyUrl: out.url, tag: out.tag });
}
