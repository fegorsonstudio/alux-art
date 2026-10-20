import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { allow } from "@/lib/ar/rate-limit";
import { CHANNEL_RE, KEY_RE, broadcast, join, leave, type Presence } from "@/lib/race/live-hub";

/**
 * The race lobby's live channel (replaces Supabase Realtime, 2026-10-20).
 *   GET  /api/race/live/<channel>?key=<phone id>[&name=&joinedAt=]  → server-sent events
 *   POST /api/race/live/<channel>  { event, key, payload }          → passed to everyone listening
 * Channels: race-lobby-<bounty token> (presence + "go") and race-room-<group id> ("pose").
 * Login-free like the race page itself; the channel must name a real bounty or group.
 */

export const dynamic = "force-dynamic";

const known = new Map<string, { ok: boolean; until: number }>();

async function channelExists(name: string): Promise<boolean> {
  const hit = known.get(name);
  if (hit && hit.until > Date.now()) return hit.ok;
  const m = /^race-(lobby|room)-(.+)$/.exec(name);
  let ok = false;
  if (m?.[1] === "lobby") {
    const [row] = await sql`SELECT 1 FROM ar_campaigns WHERE token = ${m[2]} AND status = 'active' LIMIT 1`;
    ok = !!row;
  } else if (m?.[1] === "room" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(m[2])) {
    const [row] = await sql`SELECT 1 FROM race_groups WHERE id = ${m[2]}::uuid LIMIT 1`;
    ok = !!row;
  }
  if (known.size > 2000) known.clear();
  known.set(name, { ok, until: Date.now() + (ok ? 300_000 : 30_000) });
  return ok;
}

const ipOf = (req: NextRequest) =>
  req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

export async function GET(req: NextRequest, { params }: { params: Promise<{ channel: string }> }) {
  const { channel } = await params;
  const sp = req.nextUrl.searchParams;
  const key = sp.get("key") ?? "";
  if (!CHANNEL_RE.test(channel) || !KEY_RE.test(key)) return NextResponse.json({ error: "bad channel" }, { status: 400 });
  if (!allow(`live-open:${ipOf(req)}`, 30, 60_000)) return NextResponse.json({ error: "slow down" }, { status: 429 });
  if (!(await channelExists(channel))) return NextResponse.json({ error: "no such race" }, { status: 404 });

  let presence: Presence | undefined;
  if (channel.startsWith("race-lobby-")) {
    const name = (sp.get("name") ?? "").trim().slice(0, 24) || "Hunter";
    const joinedAt = Number(sp.get("joinedAt"));
    presence = { id: key, name, joinedAt: Number.isFinite(joinedAt) ? joinedAt : Date.now() };
  }

  const encoder = new TextEncoder();
  let stop = () => {};
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const write = (event: string, data: unknown): boolean => {
        if (closed) return false;
        try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); return true; }
        catch { closed = true; return false; }
      };
      controller.enqueue(encoder.encode("retry: 2000\n\n"));
      const remove = join(channel, { key, presence, write });
      if (!remove) {
        controller.enqueue(encoder.encode(`event: full\ndata: {}\n\n`));
        controller.close();
        return;
      }
      let stopped = false;
      const heartbeat = setInterval(() => {
        if (closed) { stop(); return; }
        try { controller.enqueue(encoder.encode(": ping\n\n")); } catch { stop(); }
      }, 20_000);
      stop = () => {
        if (stopped) return;
        stopped = true;
        closed = true;
        clearInterval(heartbeat);
        remove();
        try { controller.close(); } catch { /* already closed */ }
      };
      req.signal.addEventListener("abort", () => stop());
    },
    cancel() { stop(); },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ channel: string }> }) {
  const { channel } = await params;
  if (!CHANNEL_RE.test(channel)) return NextResponse.json({ error: "bad channel" }, { status: 400 });
  const text = await req.text();
  if (text.length > 2048) return NextResponse.json({ error: "too big" }, { status: 413 });
  let body: { event?: string; key?: string; payload?: unknown };
  try { body = JSON.parse(text); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const key = typeof body.key === "string" ? body.key : "";
  if (!KEY_RE.test(key)) return NextResponse.json({ error: "bad key" }, { status: 400 });
  const isLobby = channel.startsWith("race-lobby-");
  const event = body.event;
  // A lobby carries only "go" (and a phone saying it left); a room carries only positions.
  if (isLobby ? event !== "go" && event !== "leave" : event !== "pose") {
    return NextResponse.json({ error: "bad event" }, { status: 400 });
  }
  const ip = ipOf(req);
  const ok = event === "pose" ? allow(`live-pose:${ip}:${key}`, 60, 10_000) : allow(`live-${event}:${ip}`, 20, 60_000);
  if (!ok) return NextResponse.json({ error: "slow down" }, { status: 429 });
  if (!(await channelExists(channel))) return NextResponse.json({ error: "no such race" }, { status: 404 });

  if (event === "leave") leave(channel, key);
  else broadcast(channel, event as string, body.payload ?? null);
  return new Response(null, { status: 204 });
}
