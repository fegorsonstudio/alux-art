"use client";

/**
 * Racing others, over this site's own live channel (/api/race/live, run by
 * lib/race/live-hub.ts — Supabase Realtime was removed on 2026-10-20). Two
 * channels per bounty:
 *
 *  - the lobby: who is waiting (presence) and the "go" message that carries
 *    the shared start the server made;
 *  - the room: everyone's position five times a second, so the other cars
 *    show up on your streets.
 *
 * Phones listen with EventSource (it reconnects by itself) and send with a
 * POST. Nothing here decides anything: the finish and the prize are the server's.
 */

export type Hunter = { id: string; name: string; joinedAt: number };
export type Pose = { id: string; name: string; lat: number; lng: number; h: number; v: number; t: number };
export type GoMessage = { groupId: string; startsAt: string; by: string };

export const clientId = (): string => {
  try {
    const k = "bounty-client";
    let v = localStorage.getItem(k);
    if (!v) { v = crypto.randomUUID(); localStorage.setItem(k, v); }
    return v;
  } catch { return crypto.randomUUID(); }
};

const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });

export class Lobby {
  private es: EventSource;
  private url: string;
  hunters: Hunter[] = [];
  constructor(token: string, private me: Hunter, private onChange: (h: Hunter[]) => void, private onGo: (m: GoMessage) => void) {
    this.url = `/api/race/live/race-lobby-${encodeURIComponent(token)}`;
    const q = new URLSearchParams({ key: me.id, name: me.name, joinedAt: String(me.joinedAt) });
    this.es = new EventSource(`${this.url}?${q}`);
    this.es.addEventListener("presence", (e) => {
      try {
        const list = JSON.parse((e as MessageEvent).data) as Hunter[];
        this.hunters = list.map((h) => ({ id: h.id, name: h.name, joinedAt: h.joinedAt })).sort((a, b) => a.joinedAt - b.joinedAt);
        this.onChange(this.hunters);
      } catch { /* a bad frame is skipped */ }
    });
    this.es.addEventListener("go", (e) => {
      try { this.onGo(JSON.parse((e as MessageEvent).data) as GoMessage); } catch { /* skipped */ }
    });
  }
  async go(m: GoMessage) { await post(this.url, { event: "go", key: this.me.id, payload: m }); }
  async leave() {
    try { this.es.close(); await post(this.url, { event: "leave", key: this.me.id }); } catch { /* gone anyway */ }
  }
}

export class Room {
  private es: EventSource;
  private url: string;
  /** The latest pose of everyone else, by client id. */
  readonly others = new Map<string, Pose>();
  private lastSent = 0;
  private sending = false;
  constructor(groupId: string, private me: { id: string; name: string }) {
    this.url = `/api/race/live/race-room-${encodeURIComponent(groupId)}`;
    this.es = new EventSource(`${this.url}?${new URLSearchParams({ key: me.id })}`);
    this.es.addEventListener("pose", (e) => {
      try {
        const p = JSON.parse((e as MessageEvent).data) as Pose;
        if (p && p.id !== me.id) this.others.set(p.id, { ...p, t: performance.now() });
      } catch { /* skipped */ }
    });
  }
  /** Call every frame; sends five times a second (skips a beat while the last one is still on its way). */
  send(lat: number, lng: number, h: number, v: number) {
    const now = performance.now();
    if (now - this.lastSent < 200 || this.sending) return;
    this.lastSent = now;
    this.sending = true;
    const payload = { id: this.me.id, name: this.me.name, lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, h: Math.round(h * 10) / 10, v: Math.round(v * 10) / 10 };
    post(this.url, { event: "pose", key: this.me.id, payload }).catch(() => {}).finally(() => { this.sending = false; });
  }
  async leave() { try { this.es.close(); } catch { /* gone anyway */ } }
}
