import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { r2Upload } from "@/lib/r2";
import {
  requireAdmin, cleanId, loadPost, publishState, slidesFor, withdraw, canPublishTo,
  BUCKET, MAX_SLIDES,
} from "@/lib/carousel/posts";

/**
 * Hand an approved post to the publisher (POST), or take it back (DELETE).
 *
 * The slides are drawn here, at full size, from exactly what was approved,
 * stored in R2 (Instagram fetches every image by URL) and queued in
 * scheduled_carousels, where /api/cron/publish-carousel posts them on time.
 *
 * Unlike the laptop's route, a resend can never put a post back in the queue
 * once Instagram has it: the old upsert reset ANY row to `queued`, so sending
 * a published post again would have posted it twice.
 */

export const maxDuration = 300;

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

/** A post due sooner than this would go out on the publisher's very next run. */
const LEAD_MS = 2 * 60 * 1000;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return fail(403, "Forbidden");
  const id = cleanId((await params).id);
  const row = await loadPost(id);
  if (!row) return fail(404, "No such post.");

  const pub = await publishState(id);
  if (pub?.status === "publishing" || pub?.status === "published") return fail(409, "This post is already on Instagram.");
  if (row.status === "scheduled" && pub?.status === "queued") return NextResponse.json({ ok: true, already: true });
  // A post the publisher gave up on (it says why in the list) may be sent
  // again as it is; anything else has to be approved first.
  const retry = row.status === "scheduled" && pub?.status === "failed";
  if (row.status !== "approved" && !retry) {
    return fail(400, row.status === "needs_photos" ? "Add the before and after photos first."
      : row.status === "needs_pictures" ? "This episode still needs its two story pictures."
      : "Approve it first: press Preview, read every slide, then press Approve.");
  }
  if (!row.scheduled_for) return fail(400, "Set a date and time first.");
  if (new Date(row.scheduled_for).getTime() < Date.now() + LEAD_MS) {
    return fail(400, "That time has already passed, so the post would go out the moment it arrived. Give it a new date, save, then schedule it.");
  }
  if (!(await canPublishTo(row.account))) {
    return fail(400, `The server has no working Instagram access for @${row.account}.`);
  }

  let slides: Buffer[];
  try {
    slides = await slidesFor(row);
  } catch (e) {
    return fail(500, `Could not draw the slides: ${(e as Error).message}`.slice(0, 200));
  }
  if (slides.length < 2) return fail(400, "A carousel needs at least 2 slides.");
  if (slides.length > MAX_SLIDES) return fail(400, `That is ${slides.length} slides; Instagram stops at ${MAX_SLIDES}.`);

  // Under its own date, like every other scheduled carousel, so a month's
  // posts sit together in storage.
  const stamp = new Date(row.scheduled_for).toISOString().slice(0, 10);
  const paths: string[] = [];
  try {
    for (let i = 0; i < slides.length; i++) {
      const path = `carousels/${stamp}/${id}/${String(i + 1).padStart(2, "0")}.jpg`;
      await r2Upload(BUCKET, path, slides[i], "image/jpeg");
      paths.push(path);
    }
  } catch (e) {
    return fail(500, `Could not store the slides: ${(e as Error).message}`.slice(0, 200));
  }

  // One row per post, so a resend updates rather than duplicating — but only
  // while Instagram does not have it yet.
  const [queued] = await sql<{ id: string }[]>`
    INSERT INTO scheduled_carousels (local_id, ig_account, caption, slide_paths, scheduled_for)
    VALUES (${id}, ${row.account}, ${row.caption}, ${paths}, ${row.scheduled_for})
    ON CONFLICT (local_id) WHERE local_id IS NOT NULL
    DO UPDATE SET ig_account = EXCLUDED.ig_account, caption = EXCLUDED.caption,
                  slide_paths = EXCLUDED.slide_paths, scheduled_for = EXCLUDED.scheduled_for,
                  status = 'queued', attempts = 0, last_error = NULL, updated_at = NOW()
      WHERE scheduled_carousels.status NOT IN ('publishing', 'published')
    RETURNING id`;
  if (!queued) return fail(409, "This post is already on Instagram.");

  await sql`UPDATE carousel_posts SET status = 'scheduled', slide_count = ${slides.length} WHERE local_id = ${id}`;
  return NextResponse.json({ ok: true, slides: slides.length, scheduledFor: row.scheduled_for });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return fail(403, "Forbidden");
  const id = cleanId((await params).id);
  const row = await loadPost(id);
  if (!row) return fail(404, "No such post.");

  const pub = await publishState(id);
  if (pub?.status === "publishing" || pub?.status === "published") {
    return fail(409, "This post is already on Instagram — it has to be deleted there by hand.");
  }
  const withdrawn = await withdraw(id);
  await sql`UPDATE carousel_posts SET status = 'approved' WHERE local_id = ${id} AND status = 'scheduled'`;
  return NextResponse.json({ ok: true, withdrawn });
}
