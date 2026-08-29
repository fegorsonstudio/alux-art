import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import sql from "@/lib/db";
import { isAdminEmail } from "@/lib/auth";
import { giphyTagFor } from "@/lib/giphy";
import { cleanTags, publishShootLoop, publishedAlready } from "@/lib/giphy-publish";

/**
 * Publishing one finished loop to the Alux Art GIPHY channel.
 *
 * WHY THIS IS A ROUTE AND NOT PART OF THE RENDER. It used to be a tickbox at
 * checkout, and the worker published the moment the file existed — which meant
 * the channel filled with loops nobody had even seen yet, including the ones
 * their owner took one look at and would never have posted. A sticker is a
 * public thing. The customer has to see the work first, then decide.
 *
 * The publishing itself lives in lib/giphy-publish, because the Instagram bot
 * offers the same thing at the end of a chat and the two must not drift.
 */

/** Ownership, and the bits of the shoot this route reports on. */
async function authorise(id: string, email: string | undefined, userId: string) {
  const [row] = await sql<{ user_id: string; status: string; enhance: Record<string, unknown> | null; path: string | null }[]>`
    SELECT s.user_id, s.status, s.enhance, i.download_storage_path AS path
    FROM shoots s
    LEFT JOIN shoot_images i
      ON i.shoot_id = s.id AND i.kind = 'landscape-gif' AND i.status = 'COMPLETE'
    WHERE s.id = ${id}
    LIMIT 1`;
  if (!row) return null;
  if (!isAdminEmail(email) && row.user_id !== userId) return null;
  return row;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const row = await authorise(id, user.email, user.id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    // Only a finished loop can be published — there has to be a file, and the
    // whole point is that the customer has already seen it.
    eligible: row.status === "COMPLETE" && !!row.path,
    published: publishedAlready(row.enhance),
    // Always on every upload, so the channel's own work stays findable together
    // and the customer can pull up their own loop and nobody else's.
    autoTags: ["aluxart", "aluxartandframes", giphyTagFor(id)],
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const row = await authorise(id, user.email, user.id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const tags = cleanTags((body as { tags?: unknown }).tags);

  const result = await publishShootLoop(id, tags);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.reason === "unfinished" ? 409 : 502 });
  }

  return NextResponse.json({
    published: { id: result.id, url: result.url, tag: result.tag },
    alreadyPublished: result.already,
    tags,
  });
}
