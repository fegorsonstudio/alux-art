"use client";

import { useEffect, useRef, useState } from "react";
import VideoRace, { type Finish, type Ghost, type RaceEvent, type RoadData } from "@/components/race/VideoRace";
import { Lobby, Room, clientId, type GoMessage, type Hunter, type Pose } from "@/lib/race/realtime";
import styles from "../demo/race.module.css";
import own from "./bounty.module.css";

/**
 * The hunt, on roads the players recorded themselves: pick a road (or record
 * one), "Hunt" alone against the best run's ghost, or "Race others" in a
 * lobby where everyone starts the same road at the same moment. Drive the
 * real footage to the balloons, pop one, get the code. The server decides
 * who gets a prize. No Google Street View anywhere.
 */

type Bounty = {
  brand: string; tagline: string; logoUrl: string; colors: [string, string];
  prizeLabel: string; prizesLeft: number; prizes: number; races: number; lat: number; lng: number;
};
type Phase = "landing" | "lobby" | "starting" | "racing" | "claiming" | "done" | "error";
type Result = { place: number; elapsedMs: number; prize: { code: string; label: string } | null; prizesLeft: number };
type Board = { counts: { prizesLeft: number; races: number; finished: number }; top: { place: number; player: string; elapsedMs: number; won: boolean }[] };
type Road = RoadData & { recorder: string; runs: number; createdAt: string };
type Started = { raceId: string; finishLatLng: { lat: number; lng: number }; routeM: number; startsAt?: string; road?: Road };

const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}.${String(Math.floor((ms % 1000) / 100))}`;
const fmtS = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export default function BountyRace(props: {
  token: string;
  status: "live" | "scheduled" | "ended" | "suspended" | "notFound";
  bounty: Bounty | null;
  debug: boolean;
}) {
  const b = props.bounty;
  const [phase, setPhase] = useState<Phase>("landing");
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [roads, setRoads] = useState<Road[]>([]);
  const [pending, setPending] = useState(0);
  const [roadsLoaded, setRoadsLoaded] = useState(false);
  const [roadId, setRoadId] = useState<string | null>(null);
  const [race, setRace] = useState<{ raceId: string; road: Road; finish: Finish; startsAt: number | null; group: boolean } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [pops, setPops] = useState(0);
  const [copied, setCopied] = useState(false);
  const [board, setBoard] = useState<Board | null>(null);
  const [hunters, setHunters] = useState<Hunter[]>([]);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [rivals, setRivals] = useState(0);
  const [starting, setStarting] = useState("");
  const finishing = useRef(false);
  const lobby = useRef<Lobby | null>(null);
  const room = useRef<Room | null>(null);
  const others = useRef(new Map<string, Pose>());
  const me = useRef<{ id: string; name: string }>({ id: "", name: "" });
  const goHandled = useRef<string | null>(null);
  const phaseRef = useRef<Phase>("landing"); phaseRef.current = phase;
  const roadRef = useRef<string | null>(null); roadRef.current = roadId;

  useEffect(() => {
    me.current.id = clientId();
    try { const n = localStorage.getItem("bounty-name"); if (n) setName(n); } catch { /* private mode */ }
    return () => { lobby.current?.leave(); room.current?.leave(); };
  }, []);

  const loadBoard = async (road: string | null = roadRef.current) => {
    try {
      const r = await fetch(`/api/race/${props.token}/leaderboard${road ? `?road=${road}` : ""}`, { cache: "no-store" });
      if (r.ok) setBoard(await r.json());
    } catch { /* the board is decoration */ }
  };
  const loadRoads = async () => {
    try {
      const r = await fetch(`/api/road/${props.token}/list`, { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json() as { roads: Road[]; pending: number };
      setRoads(j.roads);
      setPending(j.pending);
      setRoadsLoaded(true);
      if (!roadRef.current && j.roads[0]) { setRoadId(j.roads[0].id); loadBoard(j.roads[0].id); }
    } catch { /* try again on the next poll */ }
  };
  useEffect(() => {
    if (props.status !== "live") return;
    loadRoads();
    // A road someone just recorded shows up when the server has prepared it.
    const t = setInterval(() => { if (phaseRef.current === "landing" || phaseRef.current === "lobby") loadRoads(); }, 15_000);
    return () => clearInterval(t);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  const hunterName = () => (name.trim() || "A hunter").slice(0, 24);
  const chooseRoad = (id: string) => { setRoadId(id); setError(null); loadBoard(id); };

  /** Start a hunt: alone on the chosen road, or with a group (its road and start time). */
  const start = async (groupId?: string) => {
    if (!b) return;
    if (!groupId && !roadId) { setError("Pick a road first, or record one."); return; }
    setPhase("starting");
    setStarting("Getting the road ready…");
    setError(null);
    try { localStorage.setItem("bounty-name", name); } catch { /* private mode */ }
    me.current.name = hunterName();
    try {
      const r = await fetch(`/api/race/${props.token}/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ player: hunterName(), groupId, roadId: groupId ? undefined : roadId }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not start the hunt.");
      const started = j as Started;
      if (!started.road) throw new Error("That road is not available any more. Pick another road.");
      let g: Ghost | null = null;
      if (!groupId) {
        try {
          const gr = await fetch(`/api/race/${props.token}/ghost?road=${started.road.id}`, { cache: "no-store" });
          const gj = await gr.json();
          if (gj?.ghost?.path?.length > 1) g = { player: gj.ghost.player, path: gj.ghost.path };
        } catch { /* no ghost */ }
      } else {
        others.current.clear();
        room.current?.leave();
        room.current = new Room(groupId, me.current);
        room.current.others.clear();
      }
      setGhost(g);
      setRace({
        raceId: started.raceId, road: started.road,
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
    if (!roadId) { setError("Pick a road first, or record one."); return; }
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
      const r = await fetch(`/api/race/${props.token}/group`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roadId }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not start the race.");
      await lobby.current?.go({ groupId: j.id, startsAt: j.startsAt, by: me.current.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the race.");
    }
  };

  const onEvent = async (e: RaceEvent) => {
    if (e.type === "error") { setError(e.message); setPhase("error"); return; }
    if (e.type === "finish" && race && !finishing.current) {
      finishing.current = true;
      setPhase("claiming");
      try {
        const r = await fetch(`/api/race/${props.token}/finish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ raceId: race.raceId, elapsedMs: e.elapsedMs, path: e.path }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "The finish was not accepted.");
        setResult(j);
        setPhase("done");
        loadBoard(race.road.id);
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
  const again = () => { room.current?.leave(); room.current = null; others.current.clear(); setRivals(0); setRace(null); setPhase("landing"); loadRoads(); };

  const panel = (children: React.ReactNode) => (
    <main className={styles.panelWrap}><section className={styles.panel}>{children}</section></main>
  );
  const recordUrl = `/d/road/${props.token}/record`;

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

  const roadList = (
    <div className={own.roads} data-roads={roads.length}>
      <p className={own.boardTitle}>Pick a road</p>
      {!roadsLoaded && <p className={styles.note}>Loading the roads…</p>}
      {roadsLoaded && roads.length === 0 && (
        <p className={styles.msg}>No road has been recorded for this bounty yet. Be the first: film the road you want everyone to race on.</p>
      )}
      {roads.map((r) => (
        <button type="button" key={r.id} className={`${own.road} ${r.id === roadId ? own.roadOn : ""}`} onClick={() => chooseRoad(r.id)} aria-pressed={r.id === roadId}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {r.posterUrl ? <img className={own.poster} src={r.posterUrl} alt="" /> : <span className={own.poster} />}
          <span className={own.roadText}>
            <span className={own.roadName}>{r.name}</span>
            <span className={own.roadMeta}>{Math.round(r.lengthM)} m · {fmtS(r.durationS)}{r.recorder ? ` · by ${r.recorder}` : ""}{r.runs ? ` · ${r.runs} ${r.runs === 1 ? "run" : "runs"}` : ""}</span>
          </span>
        </button>
      ))}
      {pending > 0 && <p className={styles.note}>{pending === 1 ? "A road is being prepared and will appear here in a minute or two." : `${pending} roads are being prepared and will appear here shortly.`}</p>}
      <a className={styles.quiet} href={recordUrl}>Record a road with your camera</a>
    </div>
  );

  return (
    <div className={styles.app} data-phase={phase}>
      {(phase === "landing" || phase === "starting" || phase === "error") && panel(
        <>
          {head}
          <div className={own.prize}>
            <span className={own.prizeLabel}>{b.prizeLabel || "A prize"}</span>
            <span className={own.prizeLeft}>{b.prizesLeft} of {b.prizes} prizes left · {b.races} hunts so far</span>
          </div>
          <p className={styles.note}>Race on a real road someone filmed. Drive the footage to the balloons at its end. First to arrive takes the next prize code and shows it at the counter.</p>
          <input className={own.name} value={name} maxLength={24} placeholder="Your hunter name" onChange={(e) => setName(e.target.value)} />
          {phase !== "starting" && roadList}
          {error && <p className={`${styles.msg} ${styles.error}`}>{error}</p>}
          {phase === "starting"
            ? <p className={styles.msg}>{starting || "Getting the road ready…"}</p>
            : (
              <>
                <button type="button" className={styles.primary} onClick={() => start()} disabled={!roadId}>Hunt</button>
                <button type="button" className={styles.quiet} onClick={openLobby} disabled={!roadId}>Race others</button>
              </>
            )}
          {board && board.top.length > 0 && (
            <div className={own.board}>
              <p className={own.boardTitle}>Fastest on this road</p>
              {board.top.slice(0, 5).map((r) => (
                <div key={r.place} className={own.row}><span>{r.place}. {r.player}</span><span>{fmt(r.elapsedMs)}{r.won ? " 🎈" : ""}</span></div>
              ))}
            </div>
          )}
          <p className={styles.note}>Hold GO to drive; the harder you push, the faster the road goes by. STOP holds, N is nitro, the wheel leans you into the bends. Alone, the fastest run on this road rides along as a ghost.</p>
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
          <p className={styles.note}>{hunters.length < 2 ? "Share this page with a friend, or wait for someone to join. Everyone starts the same road at the same moment." : "Everyone here starts the same road at the same moment. Anyone can start the race."}</p>
          <p className={styles.note}>Road: {roads.find((r) => r.id === roadId)?.name ?? "the chosen road"}</p>
          {error && <p className={`${styles.msg} ${styles.error}`}>{error}</p>}
          <button type="button" className={styles.primary} onClick={startForEveryone} disabled={hunters.length < 1}>Start the race</button>
          <button type="button" className={styles.quiet} onClick={leaveLobby}>Back</button>
        </>,
      )}

      {(phase === "racing" || phase === "claiming" || phase === "done") && race && (
        <VideoRace
          road={race.road} finish={race.finish} debug={props.debug}
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
            <button type="button" className={styles.primary} onClick={again}>Hunt again</button>
          </div>
        </div>
      )}
    </div>
  );
}
