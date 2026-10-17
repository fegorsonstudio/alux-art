import "server-only";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sql from "@/lib/db";
import { r2ProxyUrl, r2SignedDownloadUrl } from "@/lib/r2";

/**
 * Roads that players record themselves for Bounty Run. A road is a phone
 * video of the real road plus the GPS track logged while filming. The phone
 * uploads the video in parts (nginx allows 32 MB a request), the parts wait
 * on disk, and scripts/road-transcode.mjs turns them into a playable mp4 in
 * the template-images bucket (public through /api/road/.../file, never
 * purged). Status: uploading → uploaded → processing → ready | failed; hidden
 * is the owner's switch to take a road down.
 */

export const ROAD_BUCKET = "template-images";
export const MAX_BYTES = 200 * 1024 * 1024;
export const PART_BYTES = 8 * 1024 * 1024;
export const MAX_PARTS = 40;
export const MAX_SECONDS = 180;
export const MIN_SECONDS = 6;

/** Where the uploaded parts wait for the transcoder (the worker script uses the same rule). */
export const uploadDir = () =>
  process.env.ROAD_UPLOAD_DIR || (process.platform === "linux" ? "/home/aluxart/road-uploads" : path.join(os.tmpdir(), "road-uploads"));

export type TrackSample = [number, number, number]; // seconds from the start of the recording, lat, lng
export type RoadRow = {
  id: string; campaign_id: string; name: string; recorder: string; status: string; mime: string; bytes: number; parts: number;
  duration_s: number | null; length_m: number | null; track: TrackSample[] | null; video_path: string | null; poster_path: string | null;
  width: number | null; height: number | null; error: string | null; created_at: Date;
};
export type RoadView = {
  id: string; name: string; recorder: string; durationS: number; lengthM: number; width: number; height: number;
  posterUrl: string | null; videoUrl: string; track: TrackSample[]; runs: number; createdAt: string;
};

const MIMES = new Set(["video/webm", "video/mp4", "video/quicktime", "video/x-matroska"]);
export const mimeOk = (m: string) => MIMES.has(m.split(";")[0].trim().toLowerCase());
const ID_RE = /^[0-9a-f-]{36}$/;
export const roadIdOk = (id: unknown): id is string => typeof id === "string" && ID_RE.test(id);
const partFile = (id: string, n: number) => path.join(uploadDir(), id, `part-${String(n).padStart(3, "0")}`);

export async function createRoad(campaignId: string, name: string, recorder: string, mime: string, bytes: number, ipHash: string): Promise<string> {
  const [r] = await sql<{ id: string }[]>`
    INSERT INTO road_tracks (campaign_id, name, recorder, mime, bytes, ip_hash)
    VALUES (${campaignId}, ${name.slice(0, 60)}, ${recorder.slice(0, 24)}, ${mime.slice(0, 80)}, ${bytes}, ${ipHash}) RETURNING id`;
  await fs.mkdir(path.join(uploadDir(), r.id), { recursive: true });
  return r.id;
}

export async function savePart(campaignId: string, id: string, n: number, data: Uint8Array): Promise<{ ok: true } | { ok: false; error: string }> {
  const [r] = await sql<{ status: string }[]>`SELECT status FROM road_tracks WHERE id = ${id} AND campaign_id = ${campaignId}`;
  if (!r) return { ok: false, error: "Unknown upload." };
  if (r.status !== "uploading") return { ok: false, error: "This upload is closed." };
  if (!Number.isInteger(n) || n < 0 || n >= MAX_PARTS) return { ok: false, error: "Bad part number." };
  if (data.byteLength === 0 || data.byteLength > PART_BYTES) return { ok: false, error: "Bad part size." };
  await fs.mkdir(path.join(uploadDir(), id), { recursive: true });
  await fs.writeFile(partFile(id, n), data);
  return { ok: true };
}

/** The GPS samples as the phone sent them, tidied: finite, in time order, within the recording, accurate enough. */
export function cleanTrack(raw: unknown): TrackSample[] {
  if (!Array.isArray(raw)) return [];
  const out: TrackSample[] = [];
  let lastT = -1;
  for (const s of raw.slice(0, 4000)) {
    if (!Array.isArray(s) || s.length < 3) continue;
    const t = Number(s[0]), lat = Number(s[1]), lng = Number(s[2]), acc = s.length > 3 ? Number(s[3]) : 0;
    if (![t, lat, lng].every(Number.isFinite)) continue;
    if (t < 0 || t > MAX_SECONDS + 5 || t <= lastT) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
    if (Number.isFinite(acc) && acc > 60) continue;
    out.push([Math.round(t * 100) / 100, Math.round(lat * 1e6) / 1e6, Math.round(lng * 1e6) / 1e6]);
    lastT = t;
  }
  return out;
}

export async function finishUpload(campaignId: string, id: string, parts: number, track: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const [r] = await sql<{ status: string }[]>`SELECT status FROM road_tracks WHERE id = ${id} AND campaign_id = ${campaignId}`;
  if (!r) return { ok: false, error: "Unknown upload." };
  if (r.status !== "uploading") return { ok: false, error: "This upload is closed." };
  if (!Number.isInteger(parts) || parts < 1 || parts > MAX_PARTS) return { ok: false, error: "Bad part count." };
  let total = 0;
  for (let n = 0; n < parts; n++) {
    try { total += (await fs.stat(partFile(id, n))).size; }
    catch { return { ok: false, error: `Part ${n + 1} of ${parts} did not arrive. Try the upload again.` }; }
  }
  if (total > MAX_BYTES) return { ok: false, error: "The video is too big." };
  const t = cleanTrack(track);
  await sql`UPDATE road_tracks SET status = 'uploaded', parts = ${parts}, bytes = ${total}, track = ${sql.json(t as never)}, updated_at = now() WHERE id = ${id}`;
  return { ok: true };
}

export async function getRoad(campaignId: string, id: string): Promise<RoadRow | null> {
  const [r] = await sql<RoadRow[]>`SELECT * FROM road_tracks WHERE id = ${id} AND campaign_id = ${campaignId}`;
  return r ?? null;
}

/** The roads ready to race on this bounty, newest first, with how many finished runs each has. */
export async function listRoads(campaignId: string, token: string): Promise<RoadView[]> {
  const rows = await sql<(RoadRow & { runs: number })[]>`
    SELECT r.*, (SELECT count(*)::int FROM races WHERE road_id = r.id AND status = 'finished') AS runs
    FROM road_tracks r WHERE r.campaign_id = ${campaignId} AND r.status = 'ready'
    ORDER BY r.created_at DESC LIMIT 30`;
  return rows.map((r) => roadView(r, token, r.runs));
}

/** Roads still being prepared (uploaded or processing) on this bounty. */
export async function pendingRoads(campaignId: string): Promise<number> {
  const [r] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM road_tracks WHERE campaign_id = ${campaignId} AND status IN ('uploaded', 'processing')`;
  return r.n;
}

export function roadView(r: RoadRow, token: string, runs = 0): RoadView {
  return {
    id: r.id, name: r.name || "A road", recorder: r.recorder, durationS: r.duration_s ?? 0, lengthM: r.length_m ?? 0,
    width: r.width ?? 1280, height: r.height ?? 720,
    posterUrl: r.poster_path ? `${r2ProxyUrl(ROAD_BUCKET, r.poster_path)}&width=640&format=webp` : null,
    videoUrl: `/api/road/${token}/file/${r.id}`,
    track: Array.isArray(r.track) ? r.track : [], runs, createdAt: new Date(r.created_at).toISOString(),
  };
}

/** A one-hour link straight to the mp4 on R2 (range requests work there, so the video can seek). */
export async function roadVideoUrl(r: RoadRow): Promise<string | null> {
  if (r.status !== "ready" || !r.video_path) return null;
  return r2SignedDownloadUrl(ROAD_BUCKET, r.video_path, 3600);
}
