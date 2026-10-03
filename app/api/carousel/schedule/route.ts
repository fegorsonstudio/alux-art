import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { r2Upload } from "@/lib/r2";

/**
 * Take a carousel built on the owner's laptop and hold it until its time.
 *
 * The studio app renders the slides locally, which is the point — it needs no
 * subscription and no AI. What it cannot do is be awake at 11am on a Tuesday,
 * so the finished slides come here and this server publishes them.
 *
 * Internal only. There is no browser session behind the laptop app, so it
 * presents the internal secret, the same door the WhatsApp and Instagram bots
 * use.
 */

export const maxDuration = 300;

/** 10 is Instagram's own ceiling for a carousel. */
const MAX_SLIDES = 10;

export async function POST(request: NextRequest) {
  if (!process.env.INTERNAL_API_SECRET ||
      request.headers.get("x-internal-secret") !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as {
    localId?: string; account?: string; caption?: string;
    scheduledFor?: string; images?: string[];
  } | null;
  if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const images = Array.isArray(body.images) ? body.images.filter(Boolean) : [];
  if (images.length < 2) {
    return NextResponse.json({ error: "A carousel needs at least 2 slides." }, { status: 400 });
  }
  if (images.length > MAX_SLIDES) {
    return NextResponse.json(
      { error: `Instagram takes at most ${MAX_SLIDES} slides; this post has ${images.length}.` },
      { status: 400 });
  }

  const when = new Date(body.scheduledFor ?? "");
  if (Number.isNaN(when.getTime())) {
    return NextResponse.json({ error: "Give the post a date and time." }, { status: 400 });
  }

  const account = String(body.account ?? "fegorson_studio");
  // Only accounts this server actually holds a token for. A post scheduled to
  // an account we cannot publish to would sit in the queue failing quietly.
  const tokenKey = `IG_${account.toUpperCase()}_TOKEN`;
  if (!process.env[tokenKey]) {
    return NextResponse.json({ error: `No access token for @${account} on this server.` }, { status: 400 });
  }

  // Slides go to R2 under their own date, so a month's posts sit together and
  // the retention sweep can see what they are.
  const stamp = when.toISOString().slice(0, 10);
  const key = body.localId ? String(body.localId).replace(/[^a-zA-Z0-9_-]/g, "") : `${Date.now()}`;
  const paths: string[] = [];
  try {
    for (let i = 0; i < images.length; i++) {
      const bytes = Buffer.from(images[i], "base64");
      const path = `carousels/${stamp}/${key}/${String(i + 1).padStart(2, "0")}.jpg`;
      await r2Upload("generated-4k", path, bytes, "image/jpeg");
      paths.push(path);
    }
  } catch (e) {
    return NextResponse.json(
      { error: `Could not store the slides: ${(e as Error).message}`.slice(0, 200) }, { status: 500 });
  }

  // Re-sending the same post replaces it rather than adding a second one: a
  // duplicate row here is a duplicate on the feed, which cannot be taken back.
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO scheduled_carousels (local_id, ig_account, caption, slide_paths, scheduled_for)
    VALUES (${body.localId ?? null}, ${account}, ${body.caption ?? ""}, ${paths}, ${when})
    ON CONFLICT (local_id) WHERE local_id IS NOT NULL
    DO UPDATE SET ig_account = EXCLUDED.ig_account, caption = EXCLUDED.caption,
                  slide_paths = EXCLUDED.slide_paths, scheduled_for = EXCLUDED.scheduled_for,
                  status = 'queued', attempts = 0, last_error = NULL, updated_at = NOW()
    RETURNING id`;

  return NextResponse.json({ id: row.id, slides: paths.length, scheduledFor: when.toISOString() });
}

/** What is queued, for the app's own list. */
export async function GET(request: NextRequest) {
  if (!process.env.INTERNAL_API_SECRET ||
      request.headers.get("x-internal-secret") !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rows = await sql`
    SELECT id, local_id, ig_account, scheduled_for, status, attempts, last_error, ig_media_id, published_at
    FROM scheduled_carousels ORDER BY scheduled_for DESC LIMIT 100`;
  return NextResponse.json({ queue: rows });
}
