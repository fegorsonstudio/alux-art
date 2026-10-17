"use client";

import { projector, type RoadTile } from "./types";

/**
 * Our own traffic for the Street View hunt: a few cars and people that drive
 * and walk along the OpenStreetMap roads around the player, drawn over the
 * photos as markers. Street View's own cars and people are pixels in a
 * photograph and cannot move; these can. Everything lives in world
 * coordinates, so it keeps going when the player steps to the next photo.
 */

export type AgentKind = "car" | "person";
export type Agent = {
  kind: AgentKind;
  color: string;
  road: number; seg: number; t: number; dir: 1 | -1;
  speed: number;      // m/s along the road
  side: number;       // metres to the right of the direction of travel
  lat: number; lng: number; heading: number;
  alive: boolean; cooldown: number;
};

const CAR_COLORS = ["#d9d9d9", "#1f2a36", "#b22222", "#f2f2f2", "#2d5c9e", "#8a8a8a", "#e0b400", "#3b3b3b"];
const SHIRTS = ["#e63946", "#457b9d", "#2a9d8f", "#f4a261", "#9d4edd", "#ffffff", "#1d3557"];
const SKINS = ["#5c3a21", "#8d5524", "#c68642", "#3b2314"];
const NEAR = 75, FAR = 110;

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

export class Traffic {
  readonly agents: Agent[] = [];
  private toXZ: (lat: number, lng: number) => [number, number];
  private toLatLng: (x: number, z: number) => [number, number];

  constructor(private tile: RoadTile, cars = 3, people = 2) {
    const p = projector(tile.lat, tile.lng);
    this.toXZ = p.toXZ; this.toLatLng = p.toLatLng;
    for (let i = 0; i < cars; i++) this.agents.push(this.blank("car", pick(CAR_COLORS), i * 0.4));
    for (let i = 0; i < people; i++) this.agents.push(this.blank("person", pick(SHIRTS), 0.6 + i * 0.5));
  }

  private blank(kind: AgentKind, color: string, cooldown: number): Agent {
    return { kind, color, road: 0, seg: 0, t: 0, dir: 1, speed: 0, side: 0, lat: 0, lng: 0, heading: 0, alive: false, cooldown };
  }

  /** Advance everyone by dt seconds around the viewer; spawn where slots are free. */
  update(dt: number, viewerLat: number, viewerLng: number) {
    const [vx, vz] = this.toXZ(viewerLat, viewerLng);
    for (const a of this.agents) {
      if (!a.alive) {
        a.cooldown -= dt;
        if (a.cooldown <= 0) this.spawn(a, vx, vz);
        continue;
      }
      a.t += a.speed * a.dir * dt;
      if (!this.settle(a)) { this.kill(a); continue; }
      this.place(a);
      const [x, z] = this.toXZ(a.lat, a.lng);
      const d = Math.hypot(x - vx, z - vz);
      if (d > FAR) { this.kill(a); continue; }
      // A car that reaches the player drives "through" them; let it vanish just before.
      if (a.kind === "car" && d < 7) this.kill(a);
    }
  }

  private kill(a: Agent) { a.alive = false; a.cooldown = rnd(0.8, 3.5); a.color = a.kind === "car" ? pick(CAR_COLORS) : pick(SHIRTS); }

  /** Find a road segment near the viewer and put the agent on it. */
  private spawn(a: Agent, vx: number, vz: number) {
    const roads = this.tile.roads;
    const cands: { road: number; seg: number; d: number }[] = [];
    for (let r = 0; r < roads.length; r++) {
      const pts = roads[r].pts;
      for (let s = 0; s + 1 < pts.length; s++) {
        const [ax, az] = pts[s], [bx, bz] = pts[s + 1];
        const d = Math.hypot((ax + bx) / 2 - vx, (az + bz) / 2 - vz);
        if (d >= 12 && d <= NEAR) cands.push({ road: r, seg: s, d });
      }
    }
    if (!cands.length) { a.cooldown = 2; return; }
    const c = pick(cands);
    a.road = c.road; a.seg = c.seg; a.dir = Math.random() < 0.5 ? 1 : -1;
    const [ax, az] = roads[c.road].pts[c.seg], [bx, bz] = roads[c.road].pts[c.seg + 1];
    a.t = rnd(0, Math.hypot(bx - ax, bz - az));
    if (a.kind === "car") { a.speed = rnd(6.5, 11); a.side = 2.6; }
    else { a.speed = rnd(1.1, 1.7); a.side = (Math.random() < 0.5 ? -1 : 1) * rnd(4.5, 6.5); }
    a.alive = true;
    this.place(a);
  }

  /** Keep t inside its segment, rolling over to the next; false when the road ends. */
  private settle(a: Agent): boolean {
    const pts = this.tile.roads[a.road].pts;
    for (let guard = 0; guard < 50; guard++) {
      const [ax, az] = pts[a.seg], [bx, bz] = pts[a.seg + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (a.t >= 0 && a.t <= len) return true;
      if (a.t > len) { if (a.seg + 2 >= pts.length) return false; a.t -= len; a.seg++; }
      else { if (a.seg === 0) return false; a.seg--; const [px, pz] = pts[a.seg], [qx, qz] = pts[a.seg + 1]; a.t += Math.hypot(qx - px, qz - pz); }
    }
    return false;
  }

  private place(a: Agent) {
    const pts = this.tile.roads[a.road].pts;
    const [ax, az] = pts[a.seg], [bx, bz] = pts[a.seg + 1];
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    // Compass heading of travel: x is east, z is south.
    const dx = ux * a.dir, dz = uz * a.dir;
    a.heading = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
    // Right of travel, in metres (right of a compass heading h is h + 90).
    const rx = -dz, rz = dx;
    const x = ax + ux * a.t + rx * a.side, z = az + uz * a.t + rz * a.side;
    [a.lat, a.lng] = this.toLatLng(x, z);
  }
}

export type SpriteView = "back" | "front" | "left" | "right";

const cache = new Map<string, string>();
const uri = (svg: string) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);

/** A car as seen from behind, in front, or from the side (64×48 box). */
export function carSprite(color: string, view: SpriteView): string {
  const key = `car|${color}|${view}`;
  const hit = cache.get(key); if (hit) return hit;
  const dark = "#15181c", glass = "#9fd3ff", shadow = `<ellipse cx="32" cy="45" rx="26" ry="3" fill="rgba(0,0,0,0.35)"/>`;
  let body: string;
  if (view === "back" || view === "front") {
    const lights = view === "back"
      ? `<rect x="8" y="26" width="9" height="5" rx="2" fill="#ff3b3b"/><rect x="47" y="26" width="9" height="5" rx="2" fill="#ff3b3b"/><rect x="24" y="36" width="16" height="5" rx="1" fill="#eee"/>`
      : `<rect x="8" y="26" width="9" height="5" rx="2" fill="#fff6c2"/><rect x="47" y="26" width="9" height="5" rx="2" fill="#fff6c2"/><rect x="20" y="34" width="24" height="6" rx="1" fill="${dark}"/>`;
    body = `${shadow}<rect x="10" y="22" width="44" height="20" rx="4" fill="${color}" stroke="${dark}" stroke-width="2"/><path d="M15 23l6-11h22l6 11z" fill="${color}" stroke="${dark}" stroke-width="2"/><path d="M18 22l5-8h18l5 8z" fill="${glass}"/>${lights}<rect x="8" y="38" width="8" height="7" rx="2" fill="${dark}"/><rect x="48" y="38" width="8" height="7" rx="2" fill="${dark}"/>`;
  } else {
    body = `${shadow}<path d="M4 38V28c0-3 2-5 5-6l8-9c1-1 3-2 5-2h16c2 0 4 1 5 2l9 9h5c2 0 3 1 3 3v13z" fill="${color}" stroke="${dark}" stroke-width="2"/><path d="M19 21l5-7h12l6 7z" fill="${glass}"/><circle cx="17" cy="38" r="6" fill="${dark}"/><circle cx="17" cy="38" r="2.5" fill="#aaa"/><circle cx="47" cy="38" r="6" fill="${dark}"/><circle cx="47" cy="38" r="2.5" fill="#aaa"/>`;
    if (view === "left") body = `<g transform="translate(64 0) scale(-1 1)">${body}</g>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48" viewBox="0 0 64 48">${body}</svg>`;
  const out = uri(svg); cache.set(key, out); return out;
}

/** A person walking (28×64 box); the legs alternate with `step` 0 or 1. */
export function personSprite(shirt: string, step: 0 | 1, facing: SpriteView): string {
  const key = `person|${shirt}|${step}|${facing}`;
  const hit = cache.get(key); if (hit) return hit;
  const skin = SKINS[Math.abs(hash(shirt)) % SKINS.length];
  const legs = step === 0 ? `<path d="M11 40l-2 20M17 40l2 20" stroke="#222" stroke-width="5" stroke-linecap="round"/>` : `<path d="M11 40l1 20M17 40l-1 20" stroke="#222" stroke-width="5" stroke-linecap="round"/>`;
  let body = `<ellipse cx="14" cy="62" rx="10" ry="2" fill="rgba(0,0,0,0.35)"/>${legs}<rect x="7" y="20" width="14" height="22" rx="4" fill="${shirt}" stroke="rgba(0,0,0,0.3)"/><path d="M8 24l-4 12M20 24l4 12" stroke="${skin}" stroke-width="4" stroke-linecap="round"/><circle cx="14" cy="12" r="7" fill="${skin}"/><path d="M7 11c1-6 13-6 14 0" fill="#111"/>`;
  if (facing === "left") body = `<g transform="translate(28 0) scale(-1 1)">${body}</g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="64" viewBox="0 0 28 64">${body}</svg>`;
  const out = uri(svg); cache.set(key, out); return out;
}

function hash(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
