"use client";

import { createClient } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Racing others, over Supabase Realtime (already part of the site and allowed
 * by its security policy). Two channels per bounty:
 *
 *  - the lobby: who is waiting (presence) and the "go" message that carries
 *    the shared start the server made;
 *  - the room: everyone's position five times a second (broadcast), so the
 *    other cars show up on your streets.
 *
 * Nothing here decides anything: the finish and the prize are the server's.
 */

export type Hunter = { id: string; name: string; joinedAt: number };
export type Pose = { id: string; name: string; x: number; z: number; h: number; v: number; t: number };
export type GoMessage = { groupId: string; startsAt: string; by: string };

export const clientId = (): string => {
  try {
    const k = "bounty-client";
    let v = localStorage.getItem(k);
    if (!v) { v = crypto.randomUUID(); localStorage.setItem(k, v); }
    return v;
  } catch { return crypto.randomUUID(); }
};

export class Lobby {
  private ch: RealtimeChannel;
  hunters: Hunter[] = [];
  constructor(token: string, private me: Hunter, private onChange: (h: Hunter[]) => void, private onGo: (m: GoMessage) => void) {
    const supabase = createClient();
    this.ch = supabase.channel(`race-lobby-${token}`, { config: { presence: { key: me.id }, broadcast: { self: true } } });
    this.ch.on("presence", { event: "sync" }, () => {
      const state = this.ch.presenceState<Hunter>();
      this.hunters = Object.values(state).flat().map((h) => ({ id: h.id, name: h.name, joinedAt: h.joinedAt }))
        .sort((a, b) => a.joinedAt - b.joinedAt);
      this.onChange(this.hunters);
    });
    this.ch.on("broadcast", { event: "go" }, ({ payload }) => this.onGo(payload as GoMessage));
    this.ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") await this.ch.track(me);
    });
  }
  async go(m: GoMessage) { await this.ch.send({ type: "broadcast", event: "go", payload: m }); }
  async leave() { try { await this.ch.untrack(); await this.ch.unsubscribe(); } catch { /* gone anyway */ } }
}

export class Room {
  private ch: RealtimeChannel;
  /** The latest pose of everyone else, by client id. */
  readonly others = new Map<string, Pose>();
  private lastSent = 0;
  constructor(groupId: string, private me: { id: string; name: string }) {
    const supabase = createClient();
    this.ch = supabase.channel(`race-room-${groupId}`, { config: { broadcast: { self: false, ack: false } } });
    this.ch.on("broadcast", { event: "pose" }, ({ payload }) => {
      const p = payload as Pose;
      if (p.id !== me.id) this.others.set(p.id, { ...p, t: performance.now() });
    });
    this.ch.subscribe();
  }
  /** Call every frame; sends five times a second. */
  send(x: number, z: number, h: number, v: number) {
    const now = performance.now();
    if (now - this.lastSent < 200) return;
    this.lastSent = now;
    void this.ch.send({ type: "broadcast", event: "pose", payload: { id: this.me.id, name: this.me.name, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, h: Math.round(h * 1000) / 1000, v: Math.round(v * 10) / 10 } });
  }
  async leave() { try { await this.ch.unsubscribe(); } catch { /* gone anyway */ } }
}
