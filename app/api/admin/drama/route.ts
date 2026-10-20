import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { requireAdmin } from "@/lib/carousel/posts";
import { r2SignedDownloadUrl } from "@/lib/r2";
import { shelfStories, storyBySlug } from "@/lib/drama/data";
import {
  approveEpisode, artFor, captionFor, loadArt, queueState, scheduleEpisode, slidesForEpisode, syncPosted, unscheduleEpisode, writtenEpisode,
  storyForSlides, type EpisodeRow,
} from "@/lib/drama/episodes";
import { renderEpisodeSlides } from "@/lib/drama/slides";

/**
 * The owner's drama desk (/admin/drama).
 *   GET                       every story with its episodes, votes, cast and brand slots
 *   POST { action, ... }      preview | approve | schedule | unschedule | cast | placement
 * Nothing posts without the owner pressing Approve and then Schedule.
 */
export const maxDuration = 300;
const fail = (status: number, error: string) => NextResponse.json({ error }, { status });
const sign = (bucket: string | null, path: string | null) => (bucket && path ? r2SignedDownloadUrl(bucket, path, 3600).catch(() => null) : Promise.resolve(null));

export async function GET() {
  if (!(await requireAdmin())) return fail(403, "Forbidden");
  await syncPosted().catch(() => {});
  const stories = await shelfStories();
  const ids = stories.map((s) => s.id);
  const artRows = await sql<{ story_id: string; episode_n: number; slide: number; bucket: string; path: string; caption_at: string; source: string }[]>`
    SELECT story_id, episode_n, slide, bucket, path, caption_at, source FROM drama_art WHERE story_id = ANY(${ids}::uuid[])`;
  const [eps, votes, cast, places] = await Promise.all([
    sql<EpisodeRow[]>`SELECT * FROM drama_episodes WHERE story_id = ANY(${ids}::uuid[]) ORDER BY n`,
    sql<{ episode_id: string; word: string; voter: string; created_at: string }[]>`
      SELECT v.episode_id, v.word, v.voter, v.created_at FROM drama_votes v JOIN drama_episodes e ON e.id = v.episode_id
      WHERE e.story_id = ANY(${ids}::uuid[]) ORDER BY v.created_at`,
    sql<{ id: string; story_id: string; role_key: string; display_name: string; status: string; price_ngn: number; photo_bucket: string | null; photo_path: string | null; created_at: string }[]>`
      SELECT id, story_id, role_key, display_name, status, price_ngn, photo_bucket, photo_path, created_at FROM drama_cast
      WHERE story_id = ANY(${ids}::uuid[]) AND status <> 'withdrawn' ORDER BY created_at DESC`,
    sql<{ id: string; story_id: string; episode_n: number; slot_key: string; brand_name: string; contact_name: string | null; contact_email: string | null; contact_phone: string | null; note: string | null; status: string; price_ngn: number; product_bucket: string | null; product_path: string | null; created_at: string }[]>`
      SELECT * FROM drama_placements WHERE story_id = ANY(${ids}::uuid[]) ORDER BY created_at DESC`,
  ]);
  const queue = await queueState(eps.map((e) => e.id));
  const out = await Promise.all(stories.map(async (s) => ({
    slug: s.slug, title: s.title, status: s.status, igAccount: s.ig_account, minVotes: s.min_votes,
    cast: (s.content.cast ?? []).map((c) => ({ key: c.key, name: c.name, tier: c.tier })),
    written: await Promise.all((s.content.episodes ?? []).map(async (w) => {
      const made = eps.find((e) => e.story_id === s.id && e.n === w.n);
      const q = made ? queue.get(made.id) : undefined;
      const v = made ? votes.filter((x) => x.episode_id === made.id) : [];
      return {
        n: w.n, title: w.title, options: w.choice.options,
        made: made ? { id: made.id, status: made.status, decided: made.decided_word, postedAt: made.posted_at, caption: made.content.caption } : null,
        queue: q ? { status: q.status, at: q.scheduled_for, error: q.last_error } : null,
        votes: v.map((x) => ({ word: x.word, voter: x.voter, at: x.created_at })),
        art: await Promise.all(artRows.filter((a) => a.story_id === s.id && a.episode_n === w.n).map(async (a) => ({
          slide: a.slide, captionAt: a.caption_at, source: a.source, url: await sign(a.bucket, a.path),
        }))),
      };
    })),
    claims: await Promise.all(cast.filter((c) => c.story_id === s.id).map(async (c) => ({
      id: c.id, role: c.role_key, name: c.display_name, status: c.status, price: c.price_ngn, at: c.created_at, photo: await sign(c.photo_bucket, c.photo_path),
    }))),
    placements: await Promise.all(places.filter((p) => p.story_id === s.id).map(async (p) => ({
      id: p.id, episode: p.episode_n, slot: p.slot_key, brand: p.brand_name, contact: [p.contact_name, p.contact_email, p.contact_phone].filter(Boolean).join(" · "),
      note: p.note, status: p.status, price: p.price_ngn, at: p.created_at, picture: await sign(p.product_bucket, p.product_path),
    }))),
  })));
  return NextResponse.json({ stories: out });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return fail(403, "Forbidden");
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(b.action ?? "");

  if (action === "cast" || action === "placement") {
    const id = String(b.id ?? "");
    const to = b.decision === "approve" ? (action === "cast" ? "approved" : "approved") : b.decision === "reject" ? "rejected" : null;
    if (!/^[0-9a-f-]{36}$/i.test(id) || !to) return fail(400, "Bad request.");
    const rows = action === "cast"
      ? await sql`UPDATE drama_cast SET status = ${to}, updated_at = now() WHERE id = ${id} AND status IN ('submitted', 'approved', 'sheet_ready') RETURNING id`
      : await sql`UPDATE drama_placements SET status = ${to}, updated_at = now() WHERE id = ${id} AND status IN ('paid', 'approved') RETURNING id`;
    if (!rows.length) return fail(409, "That one has moved on — refresh.");
    return NextResponse.json({ ok: true, status: to, note: to === "rejected" ? "Rejected. If they paid, refund them in Paystack." : undefined });
  }

  const story = await storyBySlug(String(b.slug ?? ""));
  if (!story) return fail(404, "No such story.");
  const n = Number(b.n);
  const [frozen] = await sql<EpisodeRow[]>`SELECT * FROM drama_episodes WHERE story_id = ${story.id} AND n = ${n}`;

  try {
    if (action === "preview") {
      // What will post: the frozen copy once approved, else the written episode as it stands.
      const written = writtenEpisode(story, n);
      if (!written && !frozen) return fail(404, `Episode ${n} is not written yet.`);
      const slides = frozen && frozen.status !== "draft" ? await slidesForEpisode(story, frozen) : await renderEpisodeSlides(storyForSlides(story), written!, await loadArt(await artFor(story.id, n)));
      return NextResponse.json({
        slides: slides.map((x) => `data:image/jpeg;base64,${x.toString("base64")}`),
        caption: frozen?.content.caption || (await captionFor(story, written)),
        frozen: !!frozen && frozen.status !== "draft",
      });
    }
    if (action === "approve") {
      const caption = String(b.caption ?? "").trim();
      if (caption.length < 20 || caption.length > 2200) return fail(400, "The caption must be between 20 and 2,200 characters.");
      const row = await approveEpisode(story, n, caption);
      return NextResponse.json({ ok: true, status: row.status });
    }
    if (action === "schedule") {
      if (!frozen) return fail(400, "Approve the episode first.");
      const when = new Date(`${String(b.when ?? "")}:00+01:00`); // Lagos time from <input type="datetime-local">
      if (Number.isNaN(when.getTime())) return fail(400, "Pick a date and time.");
      const count = await scheduleEpisode(story, frozen, when);
      return NextResponse.json({ ok: true, slides: count, at: when.toISOString() });
    }
    if (action === "unschedule") {
      if (!frozen) return fail(400, "Nothing to take back.");
      const ok = await unscheduleEpisode(frozen);
      return ok ? NextResponse.json({ ok: true }) : fail(409, "It is already posting or posted — delete it on Instagram if it must go.");
    }
  } catch (e) {
    return fail(400, (e as Error).message.slice(0, 300));
  }
  return fail(400, "Unknown action.");
}
