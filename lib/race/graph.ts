import { ROAD_WIDTH, type RoadKind, type RoadTile } from "./types";

/**
 * The streets as a graph the car drives on: nodes where roads meet, edges for
 * every straight piece between two points. The car is always on an edge, a
 * distance along it, going one way or the other; at a node the steering
 * picks the next edge. Headings are compass-style: 0 = north (-z), clockwise
 * positive, in radians.
 */

export type GNode = { id: number; x: number; z: number; edges: number[] };
export type GEdge = {
  id: number; a: number; b: number; road: number; kind: RoadKind; name: string | null;
  width: number; len: number; ax: number; az: number; bx: number; bz: number;
};
export type Branch = { edge: GEdge; dir: 1 | -1; turn: number; heading: number };

export const headingOf = (dx: number, dz: number) => Math.atan2(dx, -dz);
export const normAngle = (a: number) => { while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return a; };

export class RoadGraph {
  nodes = new Map<number, GNode>();
  edges: GEdge[] = [];
  /** Junction nodes (three or more ways meet). */
  junctions: GNode[] = [];

  constructor(public tile: RoadTile) {
    tile.roads.forEach((road, ri) => {
      const width = ROAD_WIDTH[road.kind] ?? 7;
      for (let i = 0; i < road.pts.length; i++) {
        const id = road.nodes[i] ?? -(road.id * 1000 + i);
        if (!this.nodes.has(id)) this.nodes.set(id, { id, x: road.pts[i][0], z: road.pts[i][1], edges: [] });
      }
      for (let i = 0; i + 1 < road.pts.length; i++) {
        const a = road.nodes[i] ?? -(road.id * 1000 + i), b = road.nodes[i + 1] ?? -(road.id * 1000 + i + 1);
        if (a === b) continue;
        const [ax, az] = road.pts[i], [bx, bz] = road.pts[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.5) continue;
        const e: GEdge = { id: this.edges.length, a, b, road: ri, kind: road.kind, name: road.name, width, len, ax, az, bx, bz };
        this.edges.push(e);
        this.nodes.get(a)!.edges.push(e.id);
        this.nodes.get(b)!.edges.push(e.id);
      }
    });
    for (const n of this.nodes.values()) if (n.edges.length >= 3) this.junctions.push(n);
  }

  /** The closest edge to a point, with the fraction along it. */
  nearest(x: number, z: number): { edge: GEdge; t: number; d: number } | null {
    let best: { edge: GEdge; t: number; d: number } | null = null;
    for (const e of this.edges) {
      const vx = e.bx - e.ax, vz = e.bz - e.az;
      const t = Math.max(0, Math.min(1, ((x - e.ax) * vx + (z - e.az) * vz) / (e.len * e.len)));
      const px = e.ax + vx * t, pz = e.az + vz * t;
      const d = Math.hypot(x - px, z - pz);
      if (!best || d < best.d) best = { edge: e, t, d };
    }
    return best;
  }

  /** Where the car ends up when it leaves `edge` travelling `dir`. */
  endNode(edge: GEdge, dir: 1 | -1): GNode { return this.nodes.get(dir === 1 ? edge.b : edge.a)!; }

  heading(edge: GEdge, dir: 1 | -1): number {
    return dir === 1 ? headingOf(edge.bx - edge.ax, edge.bz - edge.az) : headingOf(edge.ax - edge.bx, edge.az - edge.bz);
  }

  /** The ways out of a node, each with its turn relative to the heading we arrive with. */
  branches(node: GNode, arriving: number, fromEdge: number): Branch[] {
    const out: Branch[] = [];
    for (const id of node.edges) {
      const e = this.edges[id];
      const dir: 1 | -1 = e.a === node.id ? 1 : -1;
      const h = this.heading(e, dir);
      const turn = normAngle(h - arriving);
      out.push({ edge: e, dir, turn, heading: h });
    }
    // Prefer not to turn straight back unless it is the only way.
    const forward = out.filter((b) => !(b.edge.id === fromEdge && Math.abs(b.turn) > 2.5));
    return forward.length ? forward : out;
  }

  /**
   * The branch the steering asks for: pushed right takes the sharpest sensible
   * right, pushed left the sharpest sensible left, otherwise straight on.
   */
  choose(branches: Branch[], steer: number): Branch {
    const straight = branches.reduce((p, c) => (Math.abs(c.turn) < Math.abs(p.turn) ? c : p));
    if (Math.abs(steer) < 0.3 || branches.length === 1) return straight;
    const want = steer > 0 ? 1 : -1;
    const side = branches.filter((b) => Math.sign(b.turn) === want && Math.abs(b.turn) > 0.26 && Math.abs(b.turn) < 2.6);
    if (!side.length) return straight;
    return side.reduce((p, c) => (Math.abs(c.turn) < Math.abs(p.turn) ? c : p));
  }

  pointOn(edge: GEdge, dir: 1 | -1, s: number): { x: number; z: number } {
    const t = dir === 1 ? s / edge.len : 1 - s / edge.len;
    return { x: edge.ax + (edge.bx - edge.ax) * t, z: edge.az + (edge.bz - edge.az) * t };
  }
}
