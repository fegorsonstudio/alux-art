"use client";

import { useEffect, useRef, useState } from "react";
import StreetViewRace, { type Finish, type Ghost, type RaceEvent } from "@/components/race/StreetViewRace";
import { fetchTile } from "../demo/RaceGame";
import { Lobby, Room, clientId, type GoMessage, type Hunter, type Pose } from "@/lib/race/realtime";
import type { RoadTile } from "@/lib/race/types";
import styles from "../demo/race.module.css";
import own from "./bounty.module.css";

/**
 * The hunt, through real Google Street View: name, "Hunt" (alone, against
 * the best run's ghost) or "Race others" (a lobby; one shared start for
 * everyone in it, the other cars live on the real street). Drop on a real
 * street, race the clock to the balloons, pop one, get the code. The server
 * decides who gets a prize.
 */

type Bounty = {
  brand: string; tagline: string; logoUrl: string; colors: [string, string];
  prizeLabel: string; prizesLeft: number; prizes: number; races: number; lat: number; lng: number;
};
type Phase = "landing" | "lobby" | "starting" | "racing" | "claiming" | "done" | "error";
type Result = { place: number; elapsedMs: number; prize: { code: string; label: string } | null; prizesLeft: number };
type Board = { counts: { prizesLeft: number; races: number; finished: number }; top: { place: number; player: string; elapsedMs: number; won: boolean }[] };
type Started = { raceId: string; dropLatLng: { lat: number; lng: number }; finishLatLng: { lat: number; lng: number }; routeM: number; tile: { lat: number; lng: number }; startsAt?: string };

const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}.${String(Math.floor((ms % 1000) / 100))}`;

export default function BountyRace(props: {
  token: string;
  status: "live" | "scheduled" | "ended" | "suspended" | "notFound";
  bounty: Bounty | null;
  mapsKey: string;
  debug: boolean;
}) {
  const b = props.bounty;
  const [phase, setPhase] = useState<Phase>("landing");
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [tile, setTile] = useState<RoadTile | null>(null);
  const [race, setRace] = useState<{ raceId: string; drop: { lat: number; lng: number }; finish: Finish; routeM: number; startsAt: number | null; group: boolean } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [pops, setPops] = useState(0);
  const [copied, setCopied] = useState(false);
  const [board, setBoard] = useState<Board | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [hunters, setHunters] = useState<Hunter[]>([]);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [rivals, setRivals] = useState(0);
  const finishing = useRef(false);
  const lobby = useRef<Lobby | null>(null);
  const room = useRef<Room | null>(null);
  const others = useRef(new Map<string, Pose>());
  const me = useRef<{ id: string; name: string }>({ id: "", name: "" });
  const goHandled = useRef<string | null>(null);

  useEffect(() => {
    me.current.id = clientId();
    try { const n = localStorage.getItem("bounty-name"); if (n) setName(n); } catch { /* private mode */ }
    return () => { lobby.current?.leave(); room.current?.leave(); };
  }, []);

  const loadBoard = async () => {
    try {
      const r = await fetch(`/api/race/${props.token}/leaderboard`, { cache: "no-store" });
      if (r.ok) setBoard(await r.json());
    } catch { /* the board is decoration */ }
  };
  useEffect(() => { if (props.status === "live") loadBoard(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const hunterName = () => (name.trim() || "A hunter").slice(0, 24);

  /** Start a hunt: alone (fresh drop) or with a group (its drop and start time). */
  const start = async (groupId?: string) => {
    if (!b) return;
    setPhase("starting");
    setError(null);
    try { localStorage.setItem("bounty-name", name); } catch { /* private mode */ }
    me.current.name = hunterName();
    try {
      let started: Started | null = null;
      const deadline = Date.now() + 4 * 60_000;
      for (;;) {
        const r = await fetch(`/api/race/${props.token}/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ player: hunterName(), groupId }) });
        const j = await r.json();
        if (r.status === 202 && j.pending) {
          if (Date.now() > deadline) throw new Error("OpenStreetMap is taking too long. Try again in a few minutes.");
          await new Promise((res) => setTimeout(res, 3000));
          continue;
        }
        if (!r.ok) throw new Error(j.error || "Could not start the hunt.");
        started = j;
        break;
      }
      if (!started) throw new Error("Could not start the hunt.");
      const t = await fetchTile(started.tile);
      let g: Ghost | null = null;
      if (!groupId) {
        try {
          const r = await fetch(`/api/race/${props.token}/ghost`, { cache: "no-store" });
          const j = await r.json();
          if (j.ghost?.path?.length > 1) g = { player: j.ghost.player, path: j.ghost.path };
        } catch { /* no ghost */ }
      } else {
        others.current.clear();
        room.current?.leave();
        room.current = new Room(groupId, me.current);
        room.current.others.clear();
      }
      setGhost(g);
      setTile(t);
      setRace({
        raceId: started.raceId, drop: started.dropLatLng, routeM: started.routeM,
        finish: { lat: started.finishLatLng.lat, lng: started.finishLatLng.lng, brand: b.brand, colors: b.colors, logoUrl: b.logoUrl },
        startsAt: started.startsAt ? new Date(started.startsAt).getTime() : null,
        group: !!groupId,
      });
      setPops(0);
      setResult(null);
      finishing.current = false;
      setPhase("racing");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the hunt.");
      setPhase("error");
    }
  };

  // ---- the lobby ----
  const openLobby = () => {
    me.current.name = hunterName();
    try { localStorage.setItem("bounty-name", name); } catch { /* private mode */ }
    goHandled.current = null;
    lobby.current?.leave();
    lobby.current = new Lobby(
      props.token,
      { id: me.current.id, name: me.current.name, joinedAt: Date.now() },
      (h) => setHunters(h),
      (m: GoMessage) => {
        if (goHandled.current === m.groupId) return;
        goHandled.current = m.groupId;
        lobby.current?.leave();
        lobby.current = null;
        start(m.groupId);
      },
    );
    setPhase("lobby");
  };
  const leaveLobby = () => { lobby.current?.leave(); lobby.current = null; setHunters([]); setPhase("landing"); };
  const startForEveryone = async () => {
    setError(null);
    try {
      let group: GoMessage | null = null;
      const deadline = Date.now() + 4 * 60_000;
      for (;;) {
        const r = await fetch(`/api/race/${props.token}/group`, { method: "POST" });
        const j = await r.json();
        if (r.status === 202 && j.pending) {
          if (Date.now() > deadline) throw new Error("OpenStreetMap is taking too long. Try again in a few minutes.");
          await new Promise((res) => setTimeout(res, 3000));
          continue;
        }
        if (!r.ok) throw new Error(j.error || "Could not start the race.");
        group = { groupId: j.id, startsAt: j.startsAt, by: me.current.id };
        break;
      }
      if (group) await lobby.current?.go(group);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the race.");
    }
  };

  const onEvent = async (e: RaceEvent) => {
    if (e.type === "nocoverage") { setError("Google has no Street View photos near this drop point yet. Try again for another street."); setPhase("error"); return; }
    if (e.type === "error") { setError(e.message); setPhase("error"); return; }
    if (e.type === "finish" && race && !finishing.current) {
      finishing.current = true;
      setPhase("claiming");
      if (props.mapsKey && b) {
        setPhoto(`https://maps.googleapis.com/maps/api/streetview?size=480x270&location=${b.lat.toFixed(6)},${b.lng.toFixed(6)}&fov=80&pitch=6&key=${props.mapsKey}`);
      }
      try {
        const r = await fetch(`/api/race/${props.token}/finish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ raceId: race.raceId, elapsedMs: e.elapsedMs, path: e.path }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "The finish was not accepted.");
        setResult(j);
        setPhase("done");
        loadBoard();
      } catch (err) {
        setError(err instanceof Error ? err.message : "The finish was not accepted.");
        setPhase("error");
      }
    }
  };

  const onPose = (lat: number, lng: number, h: number, v: number) => {
    const r = room.current;
    if (!r) return;
    r.send(lat, lng, h, v);
    // The canvas reads the room's map directly; keep the pill in step.
    if (r.others.size !== rivals) setRivals(r.others.size);
  };

  const pop = () => {
    setPops((p) => Math.min(3, p + 1));
    try { navigator.vibrate?.(pops >= 2 ? [30, 40, 60] : 20); } catch { /* no haptics */ }
  };
  const copy = () => {
    if (!result?.prize) return;
    navigator.clipboard?.writeText(result.prize.code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => undefined);
  };
  const again = () => { room.current?.leave(); room.current = null; others.current.clear(); setRivals(0); setRace(null); setPhase("landing"); };

  const panel = (children: React.ReactNode) => (
    <main className={styles.panelWrap}><section className={styles.panel}>{children}</section></main>
  );

  if (!b || props.status === "notFound") {
    return <div className={styles.app} data-phase="notFound">{panel(<><p className={styles.kicker}>Bounty Run</p><p className={`${styles.msg} ${styles.error}`}>This bounty link is not valid.</p></>)}</div>;
  }
  const head = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={own.logo} src={b.logoUrl} alt="" />
      <p className={styles.kicker}>Bounty Run</p>
      <h1 className={styles.title}>{b.brand}</h1>
      {b.tagline && <p className={styles.note}>{b.tagline}</p>}
    </>
  );
  if (props.status !== "live") {
    return <div className={styles.app} data-phase="closed">{panel(<>{head}<p className={`${styles.msg} ${styles.error}`}>{props.status === "scheduled" ? "This bounty has not started yet." : "This bounty is over."}</p></>)}</div>;
  }

  return (
    <div className={styles.app} data-phase={phase}>
      {(phase === "landing" || phase === "starting" || phase === "error") && panel(
        <>
          {head}
          <div className={own.prize}>
            <span className={own.prizeLabel}>{b.prizeLabel || "A prize"}</span>
            <span className={own.prizeLeft}>{b.prizesLeft} of {b.prizes} prizes left · {b.races} hunts so far</span>
          </div>
          <p className={styles.note}>You are dropped on a real street a short drive away, in real Street View. Race to the balloons. First to arrive takes the next prize code and shows it at the counter.</p>
          <input className={own.name} value={name} maxLength={24} placeholder="Your hunter name" onChange={(e) => setName(e.target.value)} />
          {error && <p className={`${styles.msg} ${styles.error}`}>{error}</p>}
          {phase === "starting"
            ? <p className={styles.msg}>Finding you a street… the first hunt at a new place takes up to a minute.</p>
            : (
              <>
                <button type="button" className={styles.primary} onClick={() => start()}>Hunt</button>
                <button type="button" className={styles.quiet} onClick={openLobby}>Race others</button>
              </>
            )}
          {board && board.top.length > 0 && (
            <div className={own.board}>
              <p className={own.boardTitle}>Fastest hunters</p>
              {board.top.slice(0, 5).map((r) => (
                <div key={r.place} className={own.row}><span>{r.place}. {r.player}</span><span>{fmt(r.elapsedMs)}{r.won ? " 🎈" : ""}</span></div>
              ))}
            </div>
          )}
          <p className={styles.note}>Hold GO to drive down the real street, photo by photo. Turn the wheel to look around and to pick the way at a junction. STOP holds, N is nitro. The arrow on the map points at the prize. Alone, the fastest run so far rides along as a ghost.</p>
        </>,
      )}

      {phase === "lobby" && panel(
        <>
          {head}
          <p className={own.boardTitle}>Hunters in the lobby</p>
          <div className={own.board}>
            {hunters.length === 0 && <p className={styles.note}>Connecting…</p>}
            {hunters.map((h) => <div key={h.id} className={own.row}><span>{h.name}{h.id === me.current.id ? " (you)" : ""}</span><span>ready</span></div>)}
          </div>
          <p className={styles.note}>{hunters.length < 2 ? "Share this page with a friend, or wait for someone to join. Everyone starts from the same street at the same moment." : "Everyone here starts from the same street at the same moment. Anyone can start the race."}</p>
          {error && <p className={`${styles.msg} ${styles.error}`}>{error}</p>}
          <button type="button" className={styles.primary} onClick={startForEveryone} disabled={hunters.length < 1}>Start the race</button>
          <button type="button" className={styles.quiet} onClick={leaveLobby}>Back</button>
        </>,
      )}

      {(phase === "racing" || phase === "claiming" || phase === "done") && tile && race && (
        <StreetViewRace
          tile={tile} drop={race.drop} finish={race.finish} mapsKey={props.mapsKey} debug={props.debug}
          frozen={phase !== "racing"} startsAt={race.startsAt} others={race.group ? room.current?.others : undefined}
          ghost={ghost} onPose={race.group ? onPose : undefined} onEvent={onEvent}
        />
      )}
      {phase === "racing" && race?.group && (
        <div className={own.rivals}>{rivals === 0 ? "Waiting for the others…" : `${rivals} other ${rivals === 1 ? "hunter" : "hunters"} racing`}</div>
      )}

      {phase === "claiming" && (
        <div className={own.overlay}><div className={own.sheet}><p className={own.big}>You made it!</p><p className={styles.msg}>Checking your time…</p></div></div>
      )}

      {phase === "done" && result && (
        <div className={own.overlay}>
          <div className={own.sheet}>
            <p className={own.big}>{result.place === 1 ? (race?.group ? "You won the race!" : "Fastest hunter!") : `${result.place}${result.place === 2 ? "nd" : result.place === 3 ? "rd" : "th"} ${race?.group ? "home" : "fastest"}`}</p>
            <p className={own.time}>{fmt(result.elapsedMs)}</p>
            {result.prize ? (
              pops < 3 ? (
                <button type="button" className={own.balloon} style={{ background: `linear-gradient(160deg, ${b.colors[0]}, ${b.colors[1]})`, transform: `scale(${1 + pops * 0.12})` }} onClick={pop}>
                  <span>{pops === 0 ? "Tap the balloon" : pops === 1 ? "Again!" : "Pop it!"}</span>
                </button>
              ) : (
                <div className={own.code}>
                  <div className={own.confetti} aria-hidden="true">{Array.from({ length: 24 }).map((_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, background: i % 2 ? b.colors[0] : b.colors[1], animationDelay: `${(i % 6) * 0.08}s` }} />)}</div>
                  <p className={own.codeLabel}>{result.prize.label}</p>
                  <p className={own.codeValue}>{result.prize.code}</p>
                  <p className={styles.note}>Show this code at {b.brand}. Screenshot it, or copy it.</p>
                  <button type="button" className={styles.quiet} onClick={copy}>{copied ? "Copied" : "Copy the code"}</button>
                </div>
              )
            ) : (
              <p className={styles.msg}>All the prizes are gone, but your time is on the board.</p>
            )}
            {photo && pops >= 3 && (
              <div className={styles.card}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo} alt="" onError={() => setPhoto(null)} />
                <span>The real spot</span>
              </div>
            )}
            <button type="button" className={styles.primary} onClick={again}>Hunt again</button>
          </div>
        </div>
      )}
    </div>
  );
}
