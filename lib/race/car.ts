import { BoxGeometry, Color, CylinderGeometry, Group, MathUtils, Mesh, MeshStandardMaterial, PointLight } from "three";
import { type Branch, type GEdge, type GNode, type RoadGraph } from "./graph";

/**
 * The hunter's car: a low-poly hatchback built from boxes, and an arcade
 * model that keeps it on the road graph. Throttle and brake set the speed,
 * grip limits how fast it can take a corner, nitro adds a burst, and the
 * steering does two things: it shifts the car across the lane, and at a
 * junction it picks the branch.
 */

export type CarInput = { throttle: number; brake: number; steer: number; nitro: boolean };

export type CarEvent = { type: "junction"; node: GNode; heading: number } | { type: "road"; name: string | null };

const MAX_SPEED = 48;        // m/s, about 170 km/h
const NITRO_SPEED = 64;
const ACCEL = 7.5;
const BRAKE = 14;
const DRAG = 0.0022;

/** The hatchback, origin at the ground under its middle, facing -z. */
export function buildCarBody(color: string, opts: { ghost?: boolean } = {}): { body: Group; wheels: Mesh[]; brakeLights: MeshStandardMaterial } {
  const ghost = !!opts.ghost;
  const paint = new MeshStandardMaterial({ color: new Color(color), roughness: 0.35, metalness: 0.4, transparent: ghost, opacity: ghost ? 0.45 : 1 });
  const dark = new MeshStandardMaterial({ color: 0x1b1e22, roughness: 0.6, transparent: ghost, opacity: ghost ? 0.45 : 1 });
  const glass = new MeshStandardMaterial({ color: 0x8fc8ff, roughness: 0.1, metalness: 0.6, transparent: true, opacity: ghost ? 0.35 : 0.8 });
  const brakeLights = new MeshStandardMaterial({ color: 0x5a0d0d, emissive: new Color(0xff2a1a), emissiveIntensity: 0.1, transparent: ghost, opacity: ghost ? 0.45 : 1 });
  const head = new MeshStandardMaterial({ color: 0xffffff, emissive: new Color(0xfff2c0), emissiveIntensity: 0.8, transparent: ghost, opacity: ghost ? 0.45 : 1 });
  const body = new Group();
  const chassis = new Mesh(new BoxGeometry(1.9, 0.62, 4.3), paint); chassis.position.y = 0.62; body.add(chassis);
  const bonnet = new Mesh(new BoxGeometry(1.8, 0.22, 1.3), paint); bonnet.position.set(0, 0.98, 1.3); body.add(bonnet);
  const cabin = new Mesh(new BoxGeometry(1.7, 0.62, 2.0), glass); cabin.position.set(0, 1.22, -0.25); body.add(cabin);
  const roof = new Mesh(new BoxGeometry(1.72, 0.08, 2.02), paint); roof.position.set(0, 1.56, -0.25); body.add(roof);
  const sill = new Mesh(new BoxGeometry(2.0, 0.18, 4.4), dark); sill.position.y = 0.34; body.add(sill);
  for (const sx of [-0.62, 0.62]) {
    const hl = new Mesh(new BoxGeometry(0.4, 0.16, 0.06), head); hl.position.set(sx, 0.72, 2.16); body.add(hl);
    const tl = new Mesh(new BoxGeometry(0.45, 0.16, 0.06), brakeLights); tl.position.set(sx, 0.74, -2.16); body.add(tl);
  }
  const wheelGeo = new CylinderGeometry(0.36, 0.36, 0.26, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels: Mesh[] = [];
  for (const [sx, sz] of [[-0.92, 1.35], [0.92, 1.35], [-0.92, -1.35], [0.92, -1.35]]) {
    const w = new Mesh(wheelGeo, dark); w.position.set(sx, 0.36, sz); body.add(w); wheels.push(w);
  }
  if (!ghost) { const lamp = new PointLight(0xfff2c0, 0, 18, 2); lamp.position.set(0, 1, 2.5); body.add(lamp); }
  return { body, wheels, brakeLights };
}

export class Car {
  readonly group = new Group();
  speed = 0;
  nitro = 1;              // 0..1
  heading = 0;            // radians, compass style
  lane = 0;               // metres right of the centre line
  x = 0; z = 0;
  edge: GEdge;
  dir: 1 | -1 = 1;
  s = 0;
  private wheels: Mesh[] = [];
  private brakeLights: MeshStandardMaterial;
  private body: Group;
  private visited = new Set<number>();
  private lastRoad = -1;
  private bodyRoll = 0;

  constructor(private graph: RoadGraph, start: { edge: GEdge; t: number }, color = "#d9342b") {
    this.edge = start.edge;
    this.s = start.t * start.edge.len;
    this.lane = start.edge.width * 0.22;
    this.heading = graph.heading(this.edge, this.dir);

    const built = buildCarBody(color);
    this.body = built.body;
    this.wheels = built.wheels;
    this.brakeLights = built.brakeLights;
    this.group.add(this.body);
    this.place();
  }

  get kmh() { return Math.round(Math.abs(this.speed) * 3.6); }
  get roadName() { return this.edge.name; }

  update(dt: number, input: CarInput, events: CarEvent[]) {
    const g = this.graph;
    // Speed.
    const top = input.nitro && this.nitro > 0 ? NITRO_SPEED : MAX_SPEED;
    let a = 0;
    if (input.throttle > 0) a += ACCEL * input.throttle * (input.nitro && this.nitro > 0 ? 1.8 : 1);
    if (input.brake > 0) a -= BRAKE * input.brake * Math.sign(this.speed || 1);
    a -= DRAG * this.speed * Math.abs(this.speed);
    this.speed += a * dt;
    if (input.throttle === 0 && input.brake === 0) this.speed *= 1 - 0.25 * dt;
    this.speed = MathUtils.clamp(this.speed, -8, top);
    if (input.nitro && this.nitro > 0 && input.throttle > 0) this.nitro = Math.max(0, this.nitro - dt / 3.5);
    else this.nitro = Math.min(1, this.nitro + dt / 14);

    // Lane: the steering slides the car across the road, within the kerbs.
    const half = this.edge.width / 2 - 0.9;
    this.lane = MathUtils.clamp(this.lane + input.steer * (4 + Math.abs(this.speed) * 0.18) * dt, -half, half);

    // Along the edge, through nodes.
    let remaining = this.speed * dt;
    let guard = 0;
    while (Math.abs(remaining) > 0 && guard++ < 6) {
      const forward = remaining > 0;
      const room = forward ? this.edge.len - this.s : this.s;
      if (Math.abs(remaining) <= room) { this.s += remaining; remaining = 0; break; }
      // Leave the edge.
      remaining -= forward ? room : -room;
      const travelDir: 1 | -1 = forward ? this.dir : (this.dir === 1 ? -1 : 1);
      const node = g.endNode(this.edge, travelDir);
      const arriving = g.heading(this.edge, travelDir);
      const branches: Branch[] = g.branches(node, arriving, this.edge.id);
      const next = g.choose(branches, forward ? input.steer : -input.steer);
      // Corner speed: grip scrubs speed on a sharp turn.
      const turn = Math.abs(next.turn);
      if (turn > 0.5) this.speed *= MathUtils.clamp(1 - (turn - 0.5) * 0.35, 0.45, 1);
      if (node.edges.length >= 3 && !this.visited.has(node.id)) {
        this.visited.add(node.id);
        events.push({ type: "junction", node, heading: next.heading });
      }
      this.edge = next.edge;
      this.dir = forward ? next.dir : (next.dir === 1 ? -1 : 1);
      this.s = forward ? 0 : this.edge.len;
      if (this.edge.road !== this.lastRoad) { this.lastRoad = this.edge.road; events.push({ type: "road", name: this.edge.name }); }
      const half2 = this.edge.width / 2 - 0.9;
      this.lane = MathUtils.clamp(this.lane, -half2, half2);
    }
    this.place(dt, input);
  }

  private place(dt = 0, input?: CarInput) {
    const g = this.graph;
    const p = g.pointOn(this.edge, this.dir, this.s);
    const target = g.heading(this.edge, this.dir);
    // Ease the heading round so corners sweep instead of snapping.
    let d = target - this.heading;
    while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    this.heading += d * (dt ? Math.min(1, dt * 6) : 1);
    const rx = Math.cos(this.heading), rz = Math.sin(this.heading);   // right-hand vector (east of heading)
    this.x = p.x + rx * this.lane; this.z = p.z + rz * this.lane;
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = -this.heading;
    // Body: a little yaw from the steering at speed (drift feel) and roll into corners.
    const steer = input?.steer ?? 0;
    const yaw = steer * Math.min(0.35, Math.abs(this.speed) / 90);
    this.bodyRoll += ((-steer * Math.min(0.12, Math.abs(this.speed) / 300)) - this.bodyRoll) * (dt ? Math.min(1, dt * 5) : 1);
    this.body.rotation.set(0, -yaw, this.bodyRoll);
    const wheelTurn = (this.speed * (dt || 0)) / 0.36;
    for (const w of this.wheels) w.rotation.x += wheelTurn;
    this.brakeLights.emissiveIntensity = input && input.brake > 0 ? 2.2 : 0.15;
  }
}
