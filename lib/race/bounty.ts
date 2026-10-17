import "server-only";
import crypto from "node:crypto";
import sql from "@/lib/db";
import { RoadGraph, type GNode } from "./graph";
import { nearestNode, pickDrop, shortestPath } from "./route";
import { getRoad, roadView, type RoadView } from "@/lib/road/tracks";
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

/** Tile metres → degrees. */
export function tileToLatLng(tile: { lat: number; lng: number }, x: number, z: number): { lat: number; lng: number } {
  const mx = 111_320 * Math.cos((tile.lat * Math.PI) / 180), mz = 110_540;
  return { lat: tile.lat - z / mz, lng: tile.lng + x / mx };
}

export type StartAnswer =
  | { status: "pending" }
  | { status: "full" }
  | { status: "noroads" }
  | { status: "nostart" }
  | { status: "tooclose" }
  | { status: "noroad" }
  | { status: "ok"; raceId: string; drop: { x: number; z: number }; finish: { x: number; z: number }; dropLatLng: { lat: number; lng: number }; finishLatLng: { lat: number; lng: number }; routeM: number; tile: { lat: number; lng: number }; startsAt?: string; route?: { lat: number; lng: number }[]; road?: RoadView };

/**
 * A hunt on a road a player recorded: the whole video is the course, from
 * its first frame to its last; the prize floats over its end. The road's
 * length (from the GPS track) is the distance the 70 m/s rule checks.
 */
async function roadStart(c: ArCampaignRow, roadId: string): Promise<{ status: "noroad" } | { status: "ok"; view: RoadView; routeM: number; dropLatLng: { lat: number; lng: number }; finishLatLng: { lat: number; lng: number } }> {
  const r = await getRoad(c.id, roadId);
  if (!r || r.status !== "ready") return { status: "noroad" };
  const view = roadView(r, c.token);
  const t = view.track;
  const dropLatLng = t.length ? { lat: t[0][1], lng: t[0][2] } : { lat: c.lat, lng: c.lng };
  const finishLatLng = t.length ? { lat: t[t.length - 1][1], lng: t[t.length - 1][2] } : { lat: c.lat, lng: c.lng };
  return { status: "ok", view, routeM: Math.max(30, view.lengthM), dropLatLng, finishLatLng };
}

/** A chosen start must still be a drive: at least this far from the prize by road. */
const MIN_CHOSEN_ROUTE_M = 500;

/** The road route from a node to the finish as lat/lng points (at most ~400), for the minimap and the photo preload. */
function routeOf(graph: RoadGraph, tile: { lat: number; lng: number }, fromId: number, toId: number): { lat: number; lng: number }[] | undefined {
  const p = shortestPath(graph, fromId, toId);
  if (!p) return undefined;
  const step = Math.max(1, Math.ceil(p.nodes.length / 400));
  const out = p.nodes.filter((_, i) => i % step === 0 || i === p.nodes.length - 1).map((n) => tileToLatLng(tile, n.x, n.z));
  return out;
}

/** A new hunt: a drop point on a real street some way from the pin. */
export type Group = { id: string; drop: { x: number; z: number }; finish: { x: number; z: number }; routeM: number; startsAt: string; tile: { lat: number; lng: number }; roadId?: string };

/** The streets, the finish node and a fresh drop for this campaign. */
async function layout(c: ArCampaignRow) {
  const t = await getTile(c.lat, c.lng, 2500);
  if (t.status !== "ready") return t;
  const graph = new RoadGraph(t.tile);
  const mx = 111_320 * Math.cos((t.tile.lat * Math.PI) / 180), mz = 110_540;
  const fx = (c.lng - t.tile.lng) * mx, fz = -(c.lat - t.tile.lat) * mz;
  const finish = nearestNode(graph, fx, fz);
  if (!finish) return { status: "noroads" as const };
  const drop = pickDrop(graph, finish);
  if (!drop) return { status: "noroads" as const };
  return { status: "ready" as const, tile: t.tile, finish, drop };
}

/** A shared start for several hunters: one drop, one start time a few seconds ahead. */
export async function createGroup(c: ArCampaignRow, roadId?: string): Promise<{ status: "pending" } | { status: "noroads" } | { status: "noroad" } | { status: "ok"; group: Group }> {
  if (roadId) {
    const rs = await roadStart(c, roadId);
    if (rs.status !== "ok") return rs;
    const startsAt = new Date(Date.now() + 12_000);
    const [g] = await sql<{ id: string }[]>`
      INSERT INTO race_groups (campaign_id, drop_x, drop_z, route_m, starts_at, road_id)
      VALUES (${c.id}, 0, 0, ${rs.routeM}, ${startsAt}, ${roadId}) RETURNING id`;
    return { status: "ok", group: { id: g.id, drop: { x: 0, z: 0 }, finish: { x: 0, z: 0 }, routeM: rs.routeM, startsAt: startsAt.toISOString(), tile: { lat: c.lat, lng: c.lng }, roadId } };
  }
  const l = await layout(c);
  if (l.status === "pending") return { status: "pending" };
  if (l.status === "failed") throw new Error(l.error);
  if (l.status === "noroads") return { status: "noroads" };
  const startsAt = new Date(Date.now() + 12_000);
  const [g] = await sql<{ id: string }[]>`
    INSERT INTO race_groups (campaign_id, drop_x, drop_z, route_m, starts_at)
    VALUES (${c.id}, ${l.drop.node.x}, ${l.drop.node.z}, ${l.drop.routeM}, ${startsAt}) RETURNING id`;
  return { status: "ok", group: { id: g.id, drop: { x: l.drop.node.x, z: l.drop.node.z }, finish: { x: l.finish.x, z: l.finish.z }, routeM: l.drop.routeM, startsAt: startsAt.toISOString(), tile: { lat: l.tile.lat, lng: l.tile.lng } } };
}

export async function startRace(c: ArCampaignRow, player: string, ipHash: string, groupId?: string, from?: { lat: number; lng: number }, roadId?: string): Promise<StartAnswer> {
  const [n] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM races WHERE campaign_id = ${c.id}`;
  if (n.n >= c.max_races) return { status: "full" };
  if (groupId) {
    const [g] = await sql<{ id: string; drop_x: number; drop_z: number; route_m: number; starts_at: Date; road_id: string | null }[]>`
      SELECT id, drop_x, drop_z, route_m, starts_at, road_id FROM race_groups WHERE id = ${groupId} AND campaign_id = ${c.id}`;
    if (!g) return { status: "noroads" };
    if (g.road_id) {
      const rs = await roadStart(c, g.road_id);
      if (rs.status !== "ok") return rs;
      const [row] = await sql<{ id: string }[]>`
        INSERT INTO races (campaign_id, player, drop_x, drop_z, route_m, ip_hash, group_id, started_at, road_id)
        VALUES (${c.id}, ${player.slice(0, 24)}, 0, 0, ${rs.routeM}, ${ipHash}, ${g.id}, ${g.starts_at}, ${g.road_id}) RETURNING id`;
      return { status: "ok", raceId: row.id, drop: { x: 0, z: 0 }, finish: { x: 0, z: 0 }, dropLatLng: rs.dropLatLng, finishLatLng: rs.finishLatLng, routeM: rs.routeM, tile: { lat: c.lat, lng: c.lng }, startsAt: new Date(g.starts_at).toISOString(), road: rs.view };
    }
    const t = await getTile(c.lat, c.lng, 2500);
    if (t.status !== "ready") return t.status === "pending" ? { status: "pending" } : { status: "noroads" };
    const graph = new RoadGraph(t.tile);
    const mx = 111_320 * Math.cos((t.tile.lat * Math.PI) / 180), mz = 110_540;
    const finish = nearestNode(graph, (c.lng - t.tile.lng) * mx, -(c.lat - t.tile.lat) * mz);
    if (!finish) return { status: "noroads" };
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO races (campaign_id, player, drop_x, drop_z, route_m, ip_hash, group_id, started_at)
      VALUES (${c.id}, ${player.slice(0, 24)}, ${g.drop_x}, ${g.drop_z}, ${g.route_m}, ${ipHash}, ${g.id}, ${g.starts_at}) RETURNING id`;
    const gNode = nearestNode(graph, g.drop_x, g.drop_z);
    return { status: "ok", raceId: row.id, drop: { x: g.drop_x, z: g.drop_z }, finish: { x: finish.x, z: finish.z }, dropLatLng: tileToLatLng(t.tile, g.drop_x, g.drop_z), finishLatLng: { lat: c.lat, lng: c.lng }, routeM: g.route_m, tile: { lat: t.tile.lat, lng: t.tile.lng }, startsAt: new Date(g.starts_at).toISOString(), route: gNode ? routeOf(graph, t.tile, gNode.id, finish.id) : undefined };
  }
  if (roadId) {
    const rs = await roadStart(c, roadId);
    if (rs.status !== "ok") return rs;
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO races (campaign_id, player, drop_x, drop_z, route_m, ip_hash, road_id)
      VALUES (${c.id}, ${player.slice(0, 24)}, 0, 0, ${rs.routeM}, ${ipHash}, ${roadId}) RETURNING id`;
    return { status: "ok", raceId: row.id, drop: { x: 0, z: 0 }, finish: { x: 0, z: 0 }, dropLatLng: rs.dropLatLng, finishLatLng: rs.finishLatLng, routeM: rs.routeM, tile: { lat: c.lat, lng: c.lng }, road: rs.view };
  }
  const t = await getTile(c.lat, c.lng, 2500);
  if (t.status === "pending") return { status: "pending" };
  if (t.status === "failed") throw new Error(t.error);
  const graph = new RoadGraph(t.tile);
  // The pin in tile coordinates: the tile is centred on the rounded key, not the pin itself.
  const mx = 111_320 * Math.cos((t.tile.lat * Math.PI) / 180), mz = 110_540;
  const fx = (c.lng - t.tile.lng) * mx, fz = -(c.lat - t.tile.lat) * mz;
  const finish = nearestNode(graph, fx, fz);
  if (!finish) return { status: "noroads" };
  let drop: { node: GNode; routeM: number } | null;
  if (from) {
    // The player chose where to start: the nearest mapped road point, if one is close.
    const sx = (from.lng - t.tile.lng) * mx, sz = -(from.lat - t.tile.lat) * mz;
    const n = nearestNode(graph, sx, sz);
    if (!n || Math.hypot(n.x - sx, n.z - sz) > 250) return { status: "nostart" };
    const p = shortestPath(graph, n.id, finish.id);
    if (!p) return { status: "nostart" };
    if (p.m < MIN_CHOSEN_ROUTE_M) return { status: "tooclose" };
    drop = { node: n, routeM: p.m };
  } else drop = pickDrop(graph, finish);
  if (!drop) return { status: "noroads" };
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO races (campaign_id, player, drop_x, drop_z, route_m, ip_hash)
    VALUES (${c.id}, ${player.slice(0, 24)}, ${drop.node.x}, ${drop.node.z}, ${drop.routeM}, ${ipHash}) RETURNING id`;
  return { status: "ok", raceId: row.id, drop: { x: drop.node.x, z: drop.node.z }, finish: { x: finish.x, z: finish.z }, dropLatLng: tileToLatLng(t.tile, drop.node.x, drop.node.z), finishLatLng: { lat: c.lat, lng: c.lng }, routeM: drop.routeM, tile: { lat: t.tile.lat, lng: t.tile.lng }, route: routeOf(graph, t.tile, drop.node.id, finish.id) };
}

/** The fastest a car can possibly cover the route, with a margin. */
const FASTEST_MS_PER_M = 1000 / 70;

export type FinishAnswer =
  | { status: "notfound" }
  | { status: "refused"; reason: string }
  | { status: "finished"; place: number; elapsedMs: number; prize: { code: string; label: string } | null; prizesLeft: number };

export type PathSample = [number, number, number]; // x, z, heading, every half second

export async function finishRace(campaignId: string, raceId: string, elapsedMs: number, path: PathSample[] | null = null): Promise<FinishAnswer> {
  return sql.begin(async (tx) => {
    const [race] = await tx<{ id: string; status: string; route_m: number; started_at: Date; group_id: string | null }[]>`
      SELECT id, status, route_m, started_at, group_id FROM races WHERE id = ${raceId} AND campaign_id = ${campaignId} FOR UPDATE`;
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
    const keep = Array.isArray(path) && path.length <= 2400 ? path.map((s) => [Math.round(s[0] * 10) / 10, Math.round(s[1] * 10) / 10, Math.round(s[2] * 100) / 100]) : null;
    await tx`UPDATE races SET status = 'finished', elapsed_ms = ${ms}, finished_at = now(), prize_id = ${prize?.id ?? null}, path = ${keep ? sql.json(keep as never) : null} WHERE id = ${raceId}`;
    const [rank] = race.group_id
      ? await tx<{ place: number }[]>`SELECT count(*)::int + 1 AS place FROM races WHERE group_id = ${race.group_id} AND status = 'finished' AND elapsed_ms < ${ms}`
      : await tx<{ place: number }[]>`SELECT count(*)::int + 1 AS place FROM races WHERE campaign_id = ${campaignId} AND status = 'finished' AND elapsed_ms < ${ms}`;
    const [left] = await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM race_prizes WHERE campaign_id = ${campaignId} AND claimed_at IS NULL`;
    return { status: "finished", place: rank.place, elapsedMs: ms, prize: prize ? { code: prize.code, label: prize.label } : null, prizesLeft: left.n } as FinishAnswer;
  });
}

/** The fastest run that kept its path: the ghost a solo hunter races against. */
export async function ghostPath(campaignId: string, roadId: string | null = null): Promise<{ player: string; elapsedMs: number; path: PathSample[] } | null> {
  const [r] = await sql<{ player: string; elapsed_ms: number; path: PathSample[] }[]>`
    SELECT player, elapsed_ms, path FROM races WHERE campaign_id = ${campaignId} AND status = 'finished' AND path IS NOT NULL
      AND (${roadId}::uuid IS NULL OR road_id = ${roadId}::uuid)
    ORDER BY elapsed_ms ASC LIMIT 1`;
  return r ? { player: r.player || "A hunter", elapsedMs: r.elapsed_ms, path: r.path } : null;
}

export async function leaderboard(campaignId: string, roadId: string | null = null) {
  return sql<{ player: string; elapsed_ms: number; finished_at: Date; won: boolean }[]>`
    SELECT player, elapsed_ms, finished_at, (prize_id IS NOT NULL) AS won FROM races
    WHERE campaign_id = ${campaignId} AND status = 'finished' AND (${roadId}::uuid IS NULL OR road_id = ${roadId}::uuid)
    ORDER BY elapsed_ms ASC LIMIT 10`;
}
