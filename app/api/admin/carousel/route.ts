import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { requireAdmin, EXPERIMENT, planDate } from "@/lib/carousel/posts";

/**
 * The carousel studio's list, and the two buttons that load and remove the
 * Photo Wahala experiment as a block.
 */

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function GET() {
  if (!(await requireAdmin())) return fail(403, "Forbidden");

  // Where each post stands, with what the publisher and the GIF maker know
  // about it, soonest first: the list is a work list, read in the order the
  // work has to happen.
  const posts = await sql`
    SELECT p.local_id, p.batch, p.title, p.account, p.scheduled_for, p.status, p.slide_count,
           p.gif_cleared, (p.before_path IS NOT NULL AND p.after_path IS NOT NULL) AS has_photos,
           (g.local_id IS NOT NULL) AS gif_made, g.giphy_url,
           s.status AS publish_status, s.last_error AS publish_error, s.published_at
    FROM carousel_posts p
    LEFT JOIN carousel_gifs g ON g.local_id = p.local_id
    LEFT JOIN scheduled_carousels s ON s.local_id = p.local_id
    WHERE NOT p.hidden
    ORDER BY p.scheduled_for NULLS LAST, p.local_id`;

  const [counts] = await sql<{ total: number; experiment_total: number; experiment_loaded: number }[]>`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE batch = ${EXPERIMENT})::int AS experiment_total,
           count(*) FILTER (WHERE batch = ${EXPERIMENT} AND NOT hidden)::int AS experiment_loaded
    FROM carousel_posts`;

  return NextResponse.json({
    posts,
    total: counts?.total ?? 0,
    experiment: { total: counts?.experiment_total ?? 0, loaded: counts?.experiment_loaded ?? 0 },
  });
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) return fail(403, "Forbidden");
  const body = (await request.json().catch(() => null)) as { action?: string; startMonday?: string } | null;
  if (body?.action === "load-experiment") return loadExperiment(String(body.startMonday ?? ""));
  if (body?.action === "remove-experiment") return removeExperiment();
  return fail(400, "Unknown action.");
}

/**
 * Show the 44 episodes, dated from a start Monday.
 *
 * A Monday only: the episodes' own slides name the day the next one comes out
 * ("Ep 2 on Wednesday"). A date the owner set by hand is kept. An episode
 * already handed to the publisher whose date moves is taken back off the
 * schedule — otherwise it would still go out on the old date.
 */
async function loadExperiment(startMonday: string) {
  const start = new Date(`${startMonday}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startMonday) || Number.isNaN(start.getTime())) {
    return fail(400, "Pick the Monday the experiment should start on.");
  }
  if (start.getUTCDay() !== 1) {
    return fail(400, "The experiment has to start on a Monday — its episodes say which day the next one comes out.");
  }

  const rows = await sql<{ local_id: string; week: number | null; slot: string | null; post_hour: number | null;
                           date_edited: boolean; scheduled_for: Date | null; status: string }[]>`
    SELECT local_id, week, slot, post_hour, date_edited, scheduled_for, status
    FROM carousel_posts WHERE batch = ${EXPERIMENT}`;
  if (!rows.length) return fail(400, "The experiment's episodes have not been loaded onto the server yet.");

  let unscheduled = 0;
  const live: string[] = [];
  for (const r of rows) {
    const when = r.date_edited && r.scheduled_for
      ? r.scheduled_for
      : planDate(startMonday, r.week ?? 1, r.slot ?? "A", r.post_hour ?? 13);
    const moved = !r.scheduled_for || new Date(r.scheduled_for).getTime() !== when.getTime();

    let status = r.status;
    if (moved && r.status === "scheduled") {
      const [pub] = await sql<{ status: string }[]>`SELECT status FROM scheduled_carousels WHERE local_id = ${r.local_id}`;
      if (pub && (pub.status === "publishing" || pub.status === "published")) {
        // Already on Instagram: its date is history, not a plan.
        live.push(r.local_id);
        await sql`UPDATE carousel_posts SET hidden = false WHERE local_id = ${r.local_id}`;
        continue;
      }
      await sql`
        UPDATE scheduled_carousels SET status = 'cancelled', updated_at = NOW()
        WHERE local_id = ${r.local_id} AND status IN ('queued', 'failed')`;
      status = "approved";
      unscheduled++;
    }
    await sql`
      UPDATE carousel_posts SET hidden = false, scheduled_for = ${when}, status = ${status}
      WHERE local_id = ${r.local_id}`;
  }

  return NextResponse.json({ loaded: rows.length, unscheduled, live });
}

/**
 * Take the experiment down: hide every episode and withdraw any already
 * scheduled.
 *
 * Hidden, not deleted, so photographs and story pictures already added come
 * back if it is loaded again. Episodes Instagram already has come back by
 * name — its API cannot delete a post, so those come down by hand.
 */
async function removeExperiment() {
  const ids = (await sql<{ local_id: string }[]>`
    SELECT local_id FROM carousel_posts WHERE batch = ${EXPERIMENT}`).map((r) => r.local_id);
  if (!ids.length) return NextResponse.json({ removed: 0, cancelled: 0, live: [] });

  const cancelled = await sql`
    UPDATE scheduled_carousels SET status = 'cancelled', updated_at = NOW()
    WHERE local_id = ANY(${ids}) AND status IN ('queued', 'failed')
    RETURNING local_id`;
  const live = await sql<{ local_id: string }[]>`
    SELECT local_id FROM scheduled_carousels
    WHERE local_id = ANY(${ids}) AND status IN ('publishing', 'published')`;
  const removed = await sql`
    UPDATE carousel_posts
    SET hidden = true, status = CASE WHEN status = 'scheduled' THEN 'approved' ELSE status END
    WHERE batch = ${EXPERIMENT} AND NOT hidden
    RETURNING local_id`;

  return NextResponse.json({
    removed: removed.length,
    cancelled: cancelled.length,
    live: live.map((r) => r.local_id),
  });
}
