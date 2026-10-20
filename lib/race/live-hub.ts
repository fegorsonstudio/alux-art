import "server-only";

/**
 * The race lobby's live channel, run by this server instead of Supabase
 * Realtime (owner, 2026-10-20: Supabase removed). Phones listen on one
 * server-sent-event stream per channel and send with a plain POST; this module
 * holds who is listening and passes each message to everyone on the channel.
 *
 * In memory on purpose: PM2 runs ONE instance, a lobby lives for minutes, and a
 * restart only makes every phone reconnect (EventSource does that by itself) and
 * re-announce itself. Nothing here is a source of truth — the finish and the
 * prize are decided by the race routes in the database.
 */

export type Presence = { id: string; name: string; joinedAt: number };
type Listener = { key: string; presence?: Presence; write: (event: string, data: unknown) => boolean };
type Channel = { listeners: Set<Listener> };

const MAX_CHANNELS = 300;
const MAX_LISTENERS = 60;

const g = globalThis as unknown as { __raceLiveHub?: Map<string, Channel> };
const hub: Map<string, Channel> = g.__raceLiveHub ?? (g.__raceLiveHub = new Map());

export const CHANNEL_RE = /^race-(lobby|room)-[A-Za-z0-9_-]{8,80}$/;
export const KEY_RE = /^[A-Za-z0-9-]{8,64}$/;

/** Everyone present on a lobby, one entry per phone, oldest first. */
function presenceOf(ch: Channel): Presence[] {
  const byKey = new Map<string, Presence>();
  for (const l of ch.listeners) if (l.presence) byKey.set(l.key, l.presence);
  return [...byKey.values()].sort((a, b) => a.joinedAt - b.joinedAt);
}

function deliver(ch: Channel, event: string, data: unknown) {
  let droppedPresent = false;
  for (const l of [...ch.listeners]) {
    if (!l.write(event, data)) { ch.listeners.delete(l); if (l.presence) droppedPresent = true; }
  }
  // A phone whose stream died while it was in the lobby: tell the others it is gone.
  if (droppedPresent) deliver(ch, "presence", presenceOf(ch));
}

/** Adds a listener; returns null when the server is full, else a function that removes it. */
export function join(name: string, listener: Listener): (() => void) | null {
  let ch = hub.get(name);
  if (!ch) {
    if (hub.size >= MAX_CHANNELS) return null;
    ch = { listeners: new Set() };
    hub.set(name, ch);
  }
  if (ch.listeners.size >= MAX_LISTENERS) return null;
  ch.listeners.add(listener);
  if (listener.presence) deliver(ch, "presence", presenceOf(ch));
  else listener.write("presence", presenceOf(ch));
  const channel = ch;
  return () => {
    const had = channel.listeners.delete(listener);
    if (had && listener.presence) deliver(channel, "presence", presenceOf(channel));
    if (channel.listeners.size === 0 && hub.get(name) === channel) hub.delete(name);
  };
}

/** Passes a message to everyone listening on the channel (the sender included). */
export function broadcast(name: string, event: string, data: unknown): number {
  const ch = hub.get(name);
  if (!ch) return 0;
  deliver(ch, event, data);
  return ch.listeners.size;
}

/** Drops a phone's presence at once when it says it is leaving. */
export function leave(name: string, key: string) {
  const ch = hub.get(name);
  if (!ch) return;
  let changed = false;
  for (const l of ch.listeners) if (l.key === key && l.presence) { l.presence = undefined; changed = true; }
  if (changed) deliver(ch, "presence", presenceOf(ch));
}
