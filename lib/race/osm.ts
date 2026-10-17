import "server-only";
import sql from "@/lib/db";
import { projector, type RoadKind, type RoadTile, type TileBuilding, type TileRoad } from "./types";

/**
 * The real streets around a point, from OpenStreetMap through the Overpass
 * API, cached in `road_tiles`. One Overpass call per tile, ever (refreshed
 * after 30 days); a tile is about 100 m of rounding, so two races near the
 * same spot share one.
 *
 * Overpass is a free, shared service: this asks for roads within the radius
 * and buildings within half of it, with a 25 s server-side timeout, and
 * never more than one in-flight fetch per key.
 */

const ROADS_RE = "^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$";
const OVERPASS = process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";
const TTL_MS = 30 * 86_400_000;
const MAX_BUILDINGS = 2500;

export const tileKey = (lat: number, lng: number, radiusM: number) => `${lat.toFixed(3)},${lng.toFixed(3)},${radiusM}`;

const inflight = new Map<string, Promise<RoadTile>>();

type OsmWay = {
  type: "way"; id: number; tags?: Record<string, string>;
  nodes?: number[]; geometry?: { lat: number; lon: number }[];
};

function kindOf(h: string): RoadKind {
  if (/_link$/.test(h)) return "link";
  return (["motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential", "living_street"] as RoadKind[])
    .includes(h as RoadKind) ? (h as RoadKind) : "unclassified";
}

function buildingHeight(tags: Record<string, string> | undefined, seed: number): number {
  const h = parseFloat(tags?.height ?? "");
  if (h > 2 && h < 300) return h;
  const levels = parseInt(tags?.["building:levels"] ?? "", 10);
  if (levels > 0 && levels < 80) return levels * 3.2 + 1;
  // Lagos streets: mostly one to three storeys, the odd tall block.
  const r = Math.abs(Math.sin(seed * 12.9898) * 43758.5453) % 1;
  return r < 0.7 ? 4 + r * 6 : r < 0.95 ? 9 + r * 8 : 18 + r * 20;
}

async function fetchOverpass(lat: number, lng: number, radiusM: number): Promise<OsmWay[]> {
  const q = `[out:json][timeout:25];
(
  way["highway"~"${ROADS_RE}"](around:${radiusM},${lat},${lng});
  way["building"](around:${Math.round(radiusM * 0.55)},${lat},${lng});
);
out geom;`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const res = await fetch(OVERPASS, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "aluxartandframes.shop bounty-run (contact: support@aluxartandframes.shop)" },
      body: "data=" + encodeURIComponent(q),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Overpass ${res.status}`);
    const j = await res.json() as { elements?: OsmWay[] };
    return (j.elements ?? []).filter((e) => e.type === "way");
  } finally {
    clearTimeout(t);
  }
}

function compact(lat: number, lng: number, radiusM: number, ways: OsmWay[]): Omit<RoadTile, "key" | "fetchedAt"> {
  const { toXZ } = projector(lat, lng);
  const roads: TileRoad[] = [];
  const buildings: TileBuilding[] = [];
  for (const w of ways) {
    const tags = w.tags ?? {};
    const geom = w.geometry ?? [];
    if (geom.length < 2) continue;
    if (tags.highway) {
      const pts = geom.map((g) => toXZ(g.lat, g.lon).map((v) => Math.round(v * 10) / 10) as [number, number]);
      roads.push({
        id: w.id, kind: kindOf(tags.highway), name: tags.name ?? null,
        oneway: tags.oneway === "yes" || tags.oneway === "-1",
        nodes: w.nodes ?? geom.map((_, i) => -(w.id * 1000 + i)),
        pts,
      });
    } else if (tags.building && geom.length >= 4) {
      const pts = geom.slice(0, -1).map((g) => toXZ(g.lat, g.lon).map((v) => Math.round(v * 10) / 10) as [number, number]);
      if (pts.length < 3 || pts.length > 60) continue;
      buildings.push({ pts, height: Math.round(buildingHeight(tags, w.id) * 10) / 10 });
    }
  }
  // Nearest buildings first, so a cap keeps the ones around the start.
  buildings.sort((a, b) => dist2(a.pts) - dist2(b.pts));
  return { lat, lng, radiusM, roads, buildings: buildings.slice(0, MAX_BUILDINGS) };
}

const dist2 = (pts: [number, number][]) => { const p = pts[0]; return p[0] * p[0] + p[1] * p[1]; };

export async function loadTile(lat: number, lng: number, radiusM = 2500): Promise<RoadTile> {
  const r = Math.min(4000, Math.max(800, Math.round(radiusM)));
  const key = tileKey(lat, lng, r);
  const [row] = await sql<{ data: RoadTile; fetched_at: Date }[]>`SELECT data, fetched_at FROM road_tiles WHERE key = ${key}`;
  if (row && Date.now() - new Date(row.fetched_at).getTime() < TTL_MS) return row.data;

  const pending = inflight.get(key);
  if (pending) return pending;
  const job = (async () => {
    const ways = await fetchOverpass(Number(key.split(",")[0]), Number(key.split(",")[1]), r);
    const tile: RoadTile = { key, fetchedAt: new Date().toISOString(), ...compact(Number(key.split(",")[0]), Number(key.split(",")[1]), r, ways) };
    await sql`INSERT INTO road_tiles (key, lat, lng, radius_m, data, roads, buildings, fetched_at)
      VALUES (${key}, ${tile.lat}, ${tile.lng}, ${r}, ${sql.json(tile as never)}, ${tile.roads.length}, ${tile.buildings.length}, now())
      ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, roads = EXCLUDED.roads, buildings = EXCLUDED.buildings, fetched_at = now()`;
    return tile;
  })().finally(() => inflight.delete(key));
  inflight.set(key, job);
  // A stale tile beats a failed fetch.
  try { return await job; } catch (e) { if (row) return row.data; throw e; }
}
