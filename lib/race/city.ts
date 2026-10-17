import {
  BackSide, BufferAttribute, BufferGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry, DoubleSide,
  ExtrudeGeometry, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial,
  MeshLambertMaterial, MeshStandardMaterial, PlaneGeometry, RepeatWrapping, Shape, ShaderMaterial, SphereGeometry,
  SRGBColorSpace,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { RoadTile } from "./types";
import type { RoadGraph } from "./graph";

/**
 * The stylised city: every road as a ribbon with kerbs and markings, every
 * building extruded from its real footprint, trees along the quieter streets,
 * a sky dome and the ground. Low-poly on purpose; everything is merged into a
 * handful of draw calls so a mid-range phone keeps 30 fps on a 2.5 km tile.
 */

function roadTexture(centre: "yellow" | "white"): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#3a3d42";
  ctx.fillRect(0, 0, 256, 256);
  // Grain.
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = `rgba(${200 + Math.random() * 55},${200 + Math.random() * 55},${210 + Math.random() * 45},${0.05 + Math.random() * 0.08})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  // Edge lines.
  ctx.fillStyle = "rgba(235,235,235,0.9)";
  ctx.fillRect(10, 0, 4, 256);
  ctx.fillRect(242, 0, 4, 256);
  // Centre dash: 8 m per repeat, a 3 m dash.
  ctx.fillStyle = centre === "yellow" ? "#e2c044" : "#e8e8e8";
  ctx.fillRect(125, 20, 6, 96);
  const t = new CanvasTexture(c);
  t.wrapS = RepeatWrapping; t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A ribbon along a polyline: positions, uvs (u across, v along in 8 m units), indices. */
function ribbon(pts: [number, number][], width: number, y: number): BufferGeometry | null {
  if (pts.length < 2) return null;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let along = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i];
    const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)];
    let dx = next[0] - prev[0], dz = next[1] - prev[1];
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const nx = -dz, nz = dx;
    if (i > 0) along += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
    pos.push(x + nx * width / 2, y, z + nz * width / 2, x - nx * width / 2, y, z - nz * width / 2);
    uv.push(0, along / 8, 1, along / 8);
    if (i > 0) {
      const b = i * 2;
      idx.push(b - 2, b, b - 1, b - 1, b, b + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A round cap at a junction so ribbons meet cleanly. */
function disc(x: number, z: number, r: number, y: number): BufferGeometry {
  const n = 12, pos: number[] = [x, y, z], uv: number[] = [0.5, 0.5], idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    pos.push(x + Math.cos(a) * r, y, z + Math.sin(a) * r);
    uv.push(0.5 + Math.cos(a) * 0.45, 0.5);
    if (i > 0) idx.push(0, i, i + 1);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const PALETTE = ["#d9c7a6", "#e8e2d2", "#c7a27c", "#bfc3c8", "#d4b48c", "#e3d0b8", "#a9b5a0", "#cfae9a"];

function buildings(tile: RoadTile): Mesh | null {
  const parts: BufferGeometry[] = [];
  tile.buildings.forEach((b, i) => {
    // Extruded sides face outward only when the footprint runs anticlockwise
    // in the shape's own plane; OSM draws them either way, so fix the winding
    // (a clockwise one came out as a black box).
    let area = 0;
    for (let k = 0; k < b.pts.length; k++) {
      const [x1, z1] = b.pts[k], [x2, z2] = b.pts[(k + 1) % b.pts.length];
      area += x1 * -z2 - x2 * -z1;
    }
    const pts = area < 0 ? [...b.pts].reverse() : b.pts;
    const shape = new Shape();
    pts.forEach(([x, z], k) => (k === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z)));
    shape.closePath();
    let g: BufferGeometry;
    try { g = new ExtrudeGeometry(shape, { depth: b.height, bevelEnabled: false, steps: 1 }); } catch { return; }
    g.rotateX(-Math.PI / 2);
    const col = new Color(PALETTE[i % PALETTE.length]).multiplyScalar(0.9 + ((i * 7919) % 13) / 60);
    const n = g.getAttribute("position").count;
    const colors = new Float32Array(n * 3);
    const normal = g.getAttribute("normal");
    for (let v = 0; v < n; v++) {
      // Roofs a touch darker, so the massing reads from above.
      const k = normal.getY(v) > 0.9 ? 0.78 : 1;
      colors[v * 3] = col.r * k; colors[v * 3 + 1] = col.g * k; colors[v * 3 + 2] = col.b * k;
    }
    g.setAttribute("color", new BufferAttribute(colors, 3));
    g.deleteAttribute("uv");
    parts.push(g);
  });
  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  if (!merged) return null;
  return new Mesh(merged, new MeshLambertMaterial({ vertexColors: true, side: DoubleSide }));
}

function trees(tile: RoadTile): InstancedMesh | null {
  const spots: { x: number; z: number; s: number }[] = [];
  for (const r of tile.roads) {
    if (r.kind !== "residential" && r.kind !== "tertiary" && r.kind !== "living_street" && r.kind !== "unclassified") continue;
    const w = r.kind === "tertiary" ? 9 : 7;
    let carry = 10 + Math.random() * 20;
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const dx = (bx - ax) / len, dz = (bz - az) / len, nx = -dz, nz = dx;
      for (let s = carry; s < len; s += 22 + Math.random() * 18) {
        const side = Math.random() < 0.5 ? 1 : -1;
        spots.push({ x: ax + dx * s + nx * side * (w / 2 + 3.5), z: az + dz * s + nz * side * (w / 2 + 3.5), s: 0.8 + Math.random() * 0.6 });
        if (spots.length >= 1500) break;
      }
      carry = Math.max(0, carry - len);
      if (spots.length >= 1500) break;
    }
    if (spots.length >= 1500) break;
  }
  if (!spots.length) return null;
  const trunk = new CylinderGeometry(0.25, 0.35, 2.4, 6);
  trunk.translate(0, 1.2, 0);
  const crown = new SphereGeometry(2.2, 7, 6);
  crown.translate(0, 3.6, 0);
  const tc = new Float32Array(trunk.getAttribute("position").count * 3).fill(0);
  for (let i = 0; i < tc.length; i += 3) { tc[i] = 0.36; tc[i + 1] = 0.25; tc[i + 2] = 0.16; }
  trunk.setAttribute("color", new BufferAttribute(tc, 3));
  const cc = new Float32Array(crown.getAttribute("position").count * 3);
  for (let i = 0; i < cc.length; i += 3) { const k = 0.85 + Math.random() * 0.3; cc[i] = 0.30 * k; cc[i + 1] = 0.52 * k; cc[i + 2] = 0.24 * k; }
  crown.setAttribute("color", new BufferAttribute(cc, 3));
  trunk.deleteAttribute("uv"); crown.deleteAttribute("uv");
  const geo = mergeGeometries([trunk, crown], false)!;
  const mesh = new InstancedMesh(geo, new MeshLambertMaterial({ vertexColors: true }), spots.length);
  const m = new Matrix4();
  spots.forEach((p, i) => {
    m.makeScale(p.s, p.s, p.s);
    m.setPosition(p.x, 0, p.z);
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function sky(): Mesh {
  const g = new SphereGeometry(3000, 24, 12);
  const m = new ShaderMaterial({
    side: BackSide, depthWrite: false,
    uniforms: { top: { value: new Color("#4f8fd6") }, horizon: { value: new Color("#dbe9f5") } },
    vertexShader: "varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: "uniform vec3 top; uniform vec3 horizon; varying vec3 vW; void main(){ float h = clamp(vW.y / 1400.0, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.6)), 1.0); }",
  });
  return new Mesh(g, m);
}

export type City = { group: Group; counts: { roads: number; buildings: number; trees: number } };

export function buildCity(tile: RoadTile, graph: RoadGraph): City {
  const group = new Group();

  const ground = new Mesh(new PlaneGeometry(9000, 9000), new MeshLambertMaterial({ color: new Color("#b8b08c") }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  group.add(ground);
  group.add(sky());

  // Roads: two layers, the pavement underneath and the asphalt with markings on top.
  const paveParts: BufferGeometry[] = [], yellowParts: BufferGeometry[] = [], whiteParts: BufferGeometry[] = [];
  for (const r of tile.roads) {
    const w = graph.edges.find((e) => e.road === tile.roads.indexOf(r))?.width ?? 7;
    const p = ribbon(r.pts, w + 3.2, 0.01);
    if (p) { p.deleteAttribute("uv"); paveParts.push(p); }
    const a = ribbon(r.pts, w, 0.03);
    if (a) (r.kind === "primary" || r.kind === "secondary" || r.kind === "trunk" || r.kind === "motorway" ? yellowParts : whiteParts).push(a);
  }
  for (const j of graph.junctions) {
    const w = Math.max(...j.edges.map((id) => graph.edges[id].width));
    whiteParts.push(disc(j.x, j.z, w / 2, 0.035));
    const pd = disc(j.x, j.z, w / 2 + 1.6, 0.012); pd.deleteAttribute("uv"); paveParts.push(pd);
  }
  const pave = mergeGeometries(paveParts, false);
  if (pave) group.add(new Mesh(pave, new MeshLambertMaterial({ color: new Color("#8e8f8a") })));
  const yellow = mergeGeometries(yellowParts, false);
  if (yellow) group.add(new Mesh(yellow, new MeshStandardMaterial({ map: roadTexture("yellow"), roughness: 0.95, metalness: 0 })));
  const white = mergeGeometries(whiteParts, false);
  if (white) group.add(new Mesh(white, new MeshStandardMaterial({ map: roadTexture("white"), roughness: 0.95, metalness: 0 })));
  [...paveParts, ...yellowParts, ...whiteParts].forEach((g) => g.dispose());

  const b = buildings(tile);
  if (b) group.add(b);
  const t = trees(tile);
  if (t) group.add(t);

  return { group, counts: { roads: tile.roads.length, buildings: tile.buildings.length, trees: t?.count ?? 0 } };
}

/** A translucent marker on the road: the start, a checkpoint, the finish. */
export function marker(color: string): Mesh {
  const g = new ConeGeometry(2.2, 6, 10, 1, true);
  g.translate(0, 3, 0);
  const m = new Mesh(g, new MeshBasicMaterial({ color: new Color(color), transparent: true, opacity: 0.55, side: DoubleSide, depthWrite: false }));
  return m;
}
