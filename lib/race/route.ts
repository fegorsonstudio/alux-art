import type { RoadGraph, GNode } from "./graph";

/**
 * Shortest road distances from one node to every other (Dijkstra), and the
 * drop point for a hunt: a real road point between 900 m and 2.2 km of
 * driving from the finish, picked at random so every hunt starts somewhere
 * else. Pure, so the server (choosing the drop) and the browser (showing
 * "how far by road") can both use it.
 */

export function distancesFrom(graph: RoadGraph, startId: number): Map<number, number> {
  const dist = new Map<number, number>();
  // A binary heap would be tidier; the tiles are a few thousand edges, so a
  // simple array-based frontier is fine.
  const frontier: { id: number; d: number }[] = [{ id: startId, d: 0 }];
  dist.set(startId, 0);
  while (frontier.length) {
    let bi = 0;
    for (let i = 1; i < frontier.length; i++) if (frontier[i].d < frontier[bi].d) bi = i;
    const { id, d } = frontier.splice(bi, 1)[0];
    if (d > (dist.get(id) ?? Infinity)) continue;
    const node = graph.nodes.get(id);
    if (!node) continue;
    for (const eid of node.edges) {
      const e = graph.edges[eid];
      const other = e.a === id ? e.b : e.a;
      const nd = d + e.len;
      if (nd < (dist.get(other) ?? Infinity)) { dist.set(other, nd); frontier.push({ id: other, d: nd }); }
    }
  }
  return dist;
}

/** The shortest road path from one node to another, as the nodes along it and its length. */
export function shortestPath(graph: RoadGraph, fromId: number, toId: number): { nodes: GNode[]; m: number } | null {
  const dist = new Map<number, number>(), prev = new Map<number, number>();
  const frontier: { id: number; d: number }[] = [{ id: fromId, d: 0 }];
  dist.set(fromId, 0);
  while (frontier.length) {
    let bi = 0;
    for (let i = 1; i < frontier.length; i++) if (frontier[i].d < frontier[bi].d) bi = i;
    const { id, d } = frontier.splice(bi, 1)[0];
    if (d > (dist.get(id) ?? Infinity)) continue;
    if (id === toId) break;
    const node = graph.nodes.get(id);
    if (!node) continue;
    for (const eid of node.edges) {
      const e = graph.edges[eid];
      const other = e.a === id ? e.b : e.a;
      const nd = d + e.len;
      if (nd < (dist.get(other) ?? Infinity)) { dist.set(other, nd); prev.set(other, id); frontier.push({ id: other, d: nd }); }
    }
  }
  if (!dist.has(toId)) return null;
  const nodes: GNode[] = [];
  for (let cur: number | undefined = toId; cur !== undefined; cur = prev.get(cur)) {
    nodes.push(graph.nodes.get(cur)!);
    if (cur === fromId) break;
  }
  nodes.reverse();
  return { nodes, m: dist.get(toId)! };
}

/** The node nearest a point. */
export function nearestNode(graph: RoadGraph, x: number, z: number): GNode | null {
  let best: GNode | null = null, bd = Infinity;
  for (const n of graph.nodes.values()) {
    const d = (n.x - x) ** 2 + (n.z - z) ** 2;
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

export function pickDrop(graph: RoadGraph, finish: GNode, rnd = Math.random): { node: GNode; routeM: number } | null {
  const dist = distancesFrom(graph, finish.id);
  const bands: [number, number][] = [[900, 2200], [600, 2600], [300, 4000]];
  for (const [lo, hi] of bands) {
    const pool: { node: GNode; routeM: number }[] = [];
    for (const [id, d] of dist) {
      if (d < lo || d > hi) continue;
      const n = graph.nodes.get(id)!;
      // Start on a street, not in the middle of a junction.
      if (n.edges.length === 2) pool.push({ node: n, routeM: d });
    }
    if (pool.length) return pool[Math.floor(rnd() * pool.length)];
  }
  return null;
}
