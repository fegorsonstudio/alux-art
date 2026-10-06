import { readFile } from "node:fs/promises";
import sharp from "sharp";
import sql from "@/lib/db";
import { createClient } from "@/lib/supabase-server";
import { isAdminEmail } from "@/lib/auth";
import { r2Download } from "@/lib/r2";
import { renderSlides, type Card } from "@/lib/carousel/render";

/**
 * The carousel studio's server side: one post as the website keeps it, and
 * the rules every /api/admin/carousel route shares.
 *
 * The words come from the written plan (tools/carousel, loaded by
 * scripts/carousel-seed.mjs); everything after that — photographs, story
 * pictures, edits, approval, date — is the owner's, made on the website.
 */

export const BUCKET = "generated-4k";
export const EXPERIMENT = "microdrama";
export const EPISODE_KICKER = "#PHOTOWAHALA";
/** Instagram's own ceiling for a carousel. */
export const MAX_SLIDES = 10;
/** The accounts the laptop studio offered. */
export const ACCOUNTS = ["fegorson_studio", "aluxartandframes", "aolivetv"];

export type CastMember = { name: string; real: boolean; note?: string; prompt?: string };
export type Scene = { after: number; attach: string[]; prompt: string };
export type Storyboard = { story: number; cast: CastMember[]; scenes: Scene[]; flow: string };

export type PostRow = {
  local_id: string;
  batch: string;
  title: string;
  account: string;
  product: string | null;
  trigger_word: string | null;
  week: number | null;
  slot: string | null;
  post_hour: number | null;
  photos_hint: string | null;
  cards: Card[];
  caption: string;
  button_text: string;
  storyboard: Storyboard | null;
  gif_lines: string[];
  gif_cleared: boolean;
  scheduled_for: Date | null;
  before_path: string | null;
  after_path: string | null;
  scene_paths: (string | null)[];
  status: string;
  slide_count: number;
  approved_at: Date | null;
  hidden: boolean;
  words_edited: boolean;
  date_edited: boolean;
  gif_lines_edited: boolean;
  created_at: Date;
  updated_at: Date;
};

/** The signed-in admin, or null. Every studio route starts here. */
export async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return null;
  return user;
}

/** Post ids are the plan's ('plan-p01'); nothing else reaches a query or a storage key. */
export const cleanId = (s: unknown) => String(s ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);

export async function loadPost(id: string): Promise<PostRow | null> {
  const [row] = await sql<PostRow[]>`SELECT * FROM carousel_posts WHERE local_id = ${id}`;
  return row ?? null;
}

/**
 * What a post is waiting for before anyone can approve it: its before and
 * after photographs, then — for an episode — both story pictures.
 */
export function readiness(row: Pick<PostRow, "before_path" | "after_path" | "storyboard" | "scene_paths">):
  "needs_photos" | "needs_pictures" | "draft" {
  if (!row.before_path || !row.after_path) return "needs_photos";
  const scenes = row.storyboard?.scenes?.length ?? 0;
  for (let i = 0; i < scenes; i++) if (!row.scene_paths?.[i]) return "needs_pictures";
  return "draft";
}

/** Where the publisher has this post, if it was ever handed over. */
export async function publishState(id: string) {
  const [row] = await sql<{ status: string; last_error: string | null; published_at: Date | null; scheduled_for: Date }[]>`
    SELECT status, last_error, published_at, scheduled_for FROM scheduled_carousels WHERE local_id = ${id}`;
  return row ?? null;
}

/** True once Instagram has it, or is being handed it right now: from then on nothing here can change it. */
export async function isLive(id: string): Promise<boolean> {
  const p = await publishState(id);
  return p?.status === "publishing" || p?.status === "published";
}

/**
 * Take a post off the publisher's queue because what would go out has changed.
 *
 * Only `queued` and `failed` rows are withdrawn — a `publishing` row belongs
 * to a run already talking to Instagram, and a published post cannot be taken
 * back through the API. Callers check isLive() first and refuse the change.
 */
export async function withdraw(id: string): Promise<boolean> {
  const rows = await sql`
    UPDATE scheduled_carousels SET status = 'cancelled', updated_at = NOW()
    WHERE local_id = ${id} AND status IN ('queued', 'failed')
    RETURNING id`;
  return rows.length > 0;
}

/**
 * Every slide of a post as it would go out, drawn from what is saved.
 * Missing story pictures are skipped, so a preview works part-way through.
 */
export async function slidesFor(row: PostRow): Promise<Buffer[]> {
  const get = async (path: string | null | undefined) =>
    path ? (await r2Download(BUCKET, path)).buffer : null;
  const scenes = row.storyboard?.scenes ?? [];
  const [before, after, ...sceneImages] = await Promise.all([
    get(row.before_path), get(row.after_path),
    ...scenes.map((_s, i) => get(row.scene_paths?.[i])),
  ]);
  return renderSlides({
    cards: row.cards ?? [], buttonText: row.button_text,
    before, after, scenes, sceneImages,
  });
}

/** A slide shrunk for the page; the full-size one is only ever made to post. */
export async function previewOf(slide: Buffer): Promise<string> {
  const small = await sharp(slide).resize(540).jpeg({ quality: 80 }).toBuffer();
  return `data:image/jpeg;base64,${small.toString("base64")}`;
}

/**
 * A time typed into the page, read as Lagos time.
 *
 * The date box sends wall-clock time with no zone ("2026-10-07T19:00") and the
 * server runs on UTC, so read bare it would post an hour late — the bug the
 * laptop studio had. Lagos is UTC+1 all year, with no daylight saving.
 * Returns null for "no date", undefined for something that is not a date.
 */
export function parseLagos(input: unknown): Date | null | undefined {
  if (input === null || input === undefined || input === "") return null;
  const s = String(input).trim();
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) ? `${s}:00+01:00` : s;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * When a planned post falls: its week and day counted from a Monday, at its
 * hour, in Lagos. Slots A-D are Monday, Wednesday, Friday and Sunday — the
 * rule tools/carousel/plan.mjs schedules by.
 */
export function planDate(startMonday: string, week: number, slot: string, hour: number): Date {
  const dayOffset = ({ A: 0, B: 2, C: 4, D: 6 } as Record<string, number>)[slot] ?? 0;
  const d = new Date(`${startMonday}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (week - 1) * 7 + dayOffset);
  const day = d.toISOString().slice(0, 10);
  return new Date(`${day}T${String(hour).padStart(2, "0")}:00:00+01:00`);
}

/** GIPHY tags for a post's story GIF — the same rule as tools/carousel/gif-scripts.mjs gifTags. */
export function gifTags(row: Pick<PostRow, "product" | "batch" | "title">): string[] {
  const byProduct: Record<string, string[]> = {
    relight: ["relight", "phone photography", "lighting"],
    studio: ["studio portrait", "phone to studio", "portrait"],
    assets: ["product photography", "vendor", "fashion"],
    gif: ["sticker", "small business"],
    shoot: ["photoshoot", "headshots", "portrait"],
  };
  const base = ["nigeria", "naija", "before after", ...(byProduct[row.product ?? ""] ?? [])];
  // Every post is a Photo Wahala episode; its story is the part of the title
  // after the dash ("S1 · Story 01 · Ep 1 — The Asoebi Group Chat").
  const story = String(row.title ?? "").replace(/^.*?—\s*/, "").toLowerCase();
  return ["photo wahala", "photowahala", "nigerian drama", "story", story, ...base].slice(0, 14);
}

/** Where scripts/instagram-refresh.mjs keeps the tokens it renews every week. */
const TOKEN_STORE = `${process.env.INSTAGRAM_DATA_DIR || "/home/aluxart/instagram-data"}/tokens.json`;

/**
 * Whether the publisher holds credentials for this account — the renewed
 * token first, then .env.local, the same two places it looks when posting.
 * A post scheduled to an account it cannot reach would sit failing quietly.
 */
export async function canPublishTo(handle: string): Promise<boolean> {
  try {
    const stored = JSON.parse(await readFile(TOKEN_STORE, "utf8"))?.[handle];
    if (stored?.token && stored?.id) return true;
  } catch { /* no store on this machine */ }
  const key = handle.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  return Boolean(process.env[`IG_${key}_TOKEN`] && process.env[`IG_${key}_ID`]);
}

/**
 * One call to the story GIF route, from inside the server.
 *
 * /api/carousel/gif is where GIFs are made and put on GIPHY — the laptop studio
 * called it over the internet. The website calls the same route on this
 * machine rather than keeping a second copy of it, so there is one GIF maker
 * and one "publish once" rule.
 */
export async function gifRoute(payload: Record<string, unknown>):
  Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; status: number; error: string }> {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return { ok: false, status: 500, error: "The server has no INTERNAL_API_SECRET, so it cannot make GIFs." };
  try {
    const r = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/carousel/gif`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": secret },
      body: JSON.stringify(payload),
    });
    const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) return { ok: false, status: r.status === 400 ? 400 : 502, error: String(body.error ?? `GIF maker said ${r.status}`) };
    return { ok: true, body };
  } catch (e) {
    return { ok: false, status: 502, error: `Could not reach the GIF maker: ${String(e).slice(0, 120)}` };
  }
}
