import "server-only";
import crypto from "node:crypto";
import sql from "@/lib/db";
import { RoadGraph } from "./graph";
import { nearestNode, pickDrop } from "./route";
import { getTile } from "./osm";
import type { ArCampaignRow } from "@/lib/ar/campaign";

/**
 * The bounty behind a campaign: prize codes, hunts (races) and the rules that
 * make the prize safe to hand out from a phone.
 */

/** Codes a cashier can read out: no 0/O, 1/I, 8/B. */
const ALPHABET = "ACDEFGHJKLMNPQRTUVWXY2345679";
export function prizeCode(): string {
  const b = crypto.randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += ALPHABET[b[i] % ALPHABET.length];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export async function createPrizes(campaignId: string, count: number, label: string): Promise<number> {
  const n = Math.max(0, Math.min(200, Math.round(count)));
  if (!n) return 0;
  const rows = Array.from({ length: n }, () => ({ campaign_id: campaignId, code: prizeCode(), label }));
  await sql`INSERT INTO race_prizes ${sql(rows)} ON CONFLICT DO NOTHING`;
  const [c] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM race_prizes WHERE campaign_id = ${campaignId}`;
  return c.n;
}

export type BountyCounts = { prizes: number; prizesLeft: number; races: number; finished: number };

export async function bountyCounts(campaignId: string): Promise<BountyCounts> {
  const [p] = await sql<{ n: number; left: number }[]>`
    SELECT count(*)::int AS n, count(*) FILTER (WHERE claimed_at IS NULL)::int AS left FROM race_prizes WHERE campaign_id = ${campaignId}`;
  const [r] = await sql<{ n: number; f: number }[]>`
    SELECT count(*)::int AS n, count(*) FILTER (WHERE status = 'finished')::int AS f FROM races WHERE campaign_id = ${campaignId}`;
  return { prizes: p?.n ?? 0, prizesLeft: p?.left ?? 0, races: r?.n ?? 0, finished: r?.f ?? 0 };
}

export type StartAnswer =
  | { status: "pending" }
  | { status: "full" }
  | { status: "noroads" }
  | { status: "ok"; raceId: string; drop: { x: number; z: number }; finish: { x: number; z: number }; routeM: number; tile: { lat: number; lng: number } };

/** A new hunt: a drop point on a real street some way from the pin. */
export async function startRace(c: ArCampaignRow, player: string, ipHash: string): Promise<StartAnswer> {
  const [n] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM races WHERE campaign_id = ${c.id}`;
  if (n.n >= c.max_races) return { status: "full" };
  const t = await getTile(c.lat, c.lng, 2500);
  if (t.status === "pending") return { status: "pending" };
  if (t.status === "failed") throw new Error(t.error);
  const graph = new RoadGraph(t.tile);
  // The pin in tile coordinates: the tile is centred on the rounded key, not the pin itself.
  const mx = 111_320 * Math.cos((t.tile.lat * Math.PI) / 180), mz = 110_540;
  const fx = (c.lng - t.tile.lng) * mx, fz = -(c.lat - t.tile.lat) * mz;
  const finish = nearestNode(graph, fx, fz);
  if (!finish) return { status: "noroads" };
  const drop = pickDrop(graph, finish);
  if (!drop) return { status: "noroads" };
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO races (campaign_id, player, drop_x, drop_z, route_m, ip_hash)
    VALUES (${c.id}, ${player.slice(0, 24)}, ${drop.node.x}, ${drop.node.z}, ${drop.routeM}, ${ipHash}) RETURNING id`;
  return { status: "ok", raceId: row.id, drop: { x: drop.node.x, z: drop.node.z }, finish: { x: finish.x, z: finish.z }, routeM: drop.routeM, tile: { lat: t.tile.lat, lng: t.tile.lng } };
}

/** The fastest a car can possibly cover the route, with a margin. */
const FASTEST_MS_PER_M = 1000 / 70;

export type FinishAnswer =
  | { status: "notfound" }
  | { status: "refused"; reason: string }
  | { status: "finished"; place: number; elapsedMs: number; prize: { code: string; label: string } | null; prizesLeft: number };

export async function finishRace(campaignId: string, raceId: string, elapsedMs: number): Promise<FinishAnswer> {
  return sql.begin(async (tx) => {
    const [race] = await tx<{ id: string; status: string; route_m: number; started_at: Date }[]>`
      SELECT id, status, route_m, started_at FROM races WHERE id = ${raceId} AND campaign_id = ${campaignId} FOR UPDATE`;
    if (!race) return { status: "notfound" } as FinishAnswer;
    if (race.status !== "running") return { status: "refused", reason: "This hunt is already over." } as FinishAnswer;
    const wall = Date.now() - new Date(race.started_at).getTime();
    const ms = Math.round(elapsedMs);
    const tooFast = ms < race.route_m * FASTEST_MS_PER_M;
    const clockLies = ms > wall + 15_000;
    if (!Number.isFinite(ms) || ms <= 0 || tooFast || clockLies) {
      await tx`UPDATE races SET status = 'refused', elapsed_ms = ${Number.isFinite(ms) ? ms : null}, finished_at = now() WHERE id = ${raceId}`;
      return { status: "refused", reason: "That time is not possible on these roads." } as FinishAnswer;
    }
    const [prize] = await tx<{ id: string; code: string; label: string }[]>`
      SELECT id, code, label FROM race_prizes WHERE campaign_id = ${campaignId} AND claimed_at IS NULL
      ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`;
    if (prize) await tx`UPDATE race_prizes SET claimed_at = now(), race_id = ${raceId} WHERE id = ${prize.id}`;
    await tx`UPDATE races SET status = 'finished', elapsed_ms = ${ms}, finished_at = now(), prize_id = ${prize?.id ?? null} WHERE id = ${raceId}`;
    const [rank] = await tx<{ place: number }[]>`
      SELECT count(*)::int + 1 AS place FROM races WHERE campaign_id = ${campaignId} AND status = 'finished' AND elapsed_ms < ${ms}`;
    const [left] = await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM race_prizes WHERE campaign_id = ${campaignId} AND claimed_at IS NULL`;
    return { status: "finished", place: rank.place, elapsedMs: ms, prize: prize ? { code: prize.code, label: prize.label } : null, prizesLeft: left.n } as FinishAnswer;
  });
}

export async function leaderboard(campaignId: string) {
  return sql<{ player: string; elapsed_ms: number; finished_at: Date; won: boolean }[]>`
    SELECT player, elapsed_ms, finished_at, (prize_id IS NOT NULL) AS won FROM races
    WHERE campaign_id = ${campaignId} AND status = 'finished' ORDER BY elapsed_ms ASC LIMIT 10`;
}
