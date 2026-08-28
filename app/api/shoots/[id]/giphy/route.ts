import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { r2Download } from "@/lib/r2";
import sql from "@/lib/db";
import { isAdminEmail } from "@/lib/auth";
import { publishLoop, giphyTagFor } from "@/lib/giphy";

/**
 * Publishing one finished loop to the Alux Art GIPHY channel.
 *
 * WHY THIS IS A ROUTE AND NOT PART OF THE RENDER. It used to be a tickbox at
 * checkout, and the worker published the moment the file existed — which meant
 * the channel filled with loops nobody had even seen yet, including the ones
 * their owner took one look at and would never have posted. A sticker is a
 * public thing. The customer has to see the work first, then decide.
 *
 * So the choice moved here, after delivery: the buyer looks at their loop, and
 * if they want it as an Instagram sticker they ask for it, with their own tags
 * attached so they can find it again.
 */

type Row = {
  user_id: string;
  status: string;
  enhance: Record<string, unknown> | null;
  bucket: string | null;
  path: string | null;
};

/** The shoot, its landscape GIF, and whether it has been published already. */
async function load(id: string): Promise<Row | null> {
  // The landscape GIF specifically: it is the one the picker shows well, and
  // the MP4s are not a thing GIPHY takes as a sticker.
  const [row] = await sql<Row[]>`
    SELECT s.user_id, s.status, s.enhance,
           i.download_storage_bucket AS bucket, i.download_storage_path AS path
    FROM shoots s
    LEFT JOIN shoot_images i
      ON i.shoot_id = s.id AND i.kind = 'landscape-gif' AND i.status = 'COMPLETE'
    WHERE s.id = ${id}
    LIMIT 1`;
  return row ?? null;
}

const published = (enhance: Record<string, unknown> | null) =>
  enhance?.giphyId
    ? { id: String(enhance.giphyId), url: String(enhance.giphyUrl ?? ""), tag: String(enhance.giphyTag ?? "") }
    : null;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const row = await load(id);
  if (!row || (!isAdminEmail(user.email) && row.user_id !== user.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    // Only a finished loop can be published — there has to be a file, and the
    // whole point is that the customer has already seen it.
    eligible: row.status === "COMPLETE" && !!row.path,
    published: published(row.enhance),
    // Always on every upload, so the channel's own work stays findable together
    // and the customer can pull up their own loop and nobody else's.
    autoTags: ["aluxart", "aluxartandframes", giphyTagFor(id)],
  });
}

/**
 * Tags the customer typed.
 *
 * GIPHY matches tags loosely and punctuation is a good way to make a sticker
 * unfindable, so these are flattened to letters, digits and single spaces. A
 * tag that survives that as an empty string is dropped rather than sent.
 */
function cleanTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    // Commas split, so one field can be typed as "lagos, party, glow up".
    for (const part of raw.split(",")) {
      const tag = part.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
      if (tag && !out.includes(tag)) out.push(tag);
    }
  }
  // GIPHY ignores the long tail anyway, and a wall of tags reads as spam.
  return out.slice(0, 20);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const row = await load(id);
  if (!row || (!isAdminEmail(user.email) && row.user_id !== user.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Already up. Hand back what is there rather than posting a duplicate — a
  // double tap on a slow connection must not put the same loop on the channel
  // twice, and there is no way to merge two stickers afterwards.
  const already = published(row.enhance);
  if (already) return NextResponse.json({ published: already, alreadyPublished: true });

  if (row.status !== "COMPLETE" || !row.path) {
    return NextResponse.json({ error: "This loop is not finished yet." }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const tags = cleanTags((body as { tags?: unknown }).tags);

  let bytes: Buffer;
  try {
    bytes = (await r2Download(row.bucket ?? "generated-4k", row.path)).buffer;
  } catch {
    return NextResponse.json({ error: "Could not read the file to publish." }, { status: 500 });
  }

  const result = await publishLoop(bytes, { shootId: id, extraTags: tags });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  // Recorded on the shoot so the panel can show the customer their tag, and so
  // a second attempt is refused above rather than duplicating the sticker.
  await sql`UPDATE shoots SET enhance = COALESCE(enhance, '{}'::jsonb) || ${sql.json({
    giphyId: result.id, giphyUrl: result.url, giphyTag: result.tag, giphyTags: tags,
  } as never)} WHERE id = ${id}`;

  return NextResponse.json({
    published: { id: result.id, url: result.url, tag: result.tag },
    tags,
  });
}
