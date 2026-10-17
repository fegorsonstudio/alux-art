"use client";

import { useEffect, useRef, useState } from "react";
import RaceCanvas, { type Finish, type RaceEvent } from "@/components/race/RaceCanvas";
import { fetchTile } from "../demo/RaceGame";
import type { RoadTile } from "@/lib/race/types";
import styles from "../demo/race.module.css";
import own from "./bounty.module.css";

/**
 * The hunt: name, "Hunt", drop on a real street, race the clock to the
 * balloons, pop one, get the code. The server decides who gets a prize.
 */

type Bounty = {
  brand: string; tagline: string; logoUrl: string; colors: [string, string];
  prizeLabel: string; prizesLeft: number; prizes: number; races: number; lat: number; lng: number;
};
type Phase = "landing" | "starting" | "racing" | "claiming" | "done" | "error";
type Result = { place: number; elapsedMs: number; prize: { code: string; label: string } | null; prizesLeft: number };
type Board = { counts: { prizesLeft: number; races: number; finished: number }; top: { place: number; player: string; elapsedMs: number; won: boolean }[] };

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
  const [race, setRace] = useState<{ raceId: string; drop: { x: number; z: number }; finish: Finish; routeM: number } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [pops, setPops] = useState(0);
  const [copied, setCopied] = useState(false);
  const [board, setBoard] = useState<Board | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const finishing = useRef(false);

  useEffect(() => {
    try { const n = localStorage.getItem("bounty-name"); if (n) setName(n); } catch { /* private mode */ }
  }, []);

  const loadBoard = async () => {
    try {
      const r = await fetch(`/api/race/${props.token}/leaderboard`, { cache: "no-store" });
      if (r.ok) setBoard(await r.json());
    } catch { /* the board is decoration */ }
  };
  useEffect(() => { if (props.status === "live") loadBoard(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const hunt = async () => {
    if (!b) return;
    setPhase("starting");
    setError(null);
    try { localStorage.setItem("bounty-name", name); } catch { /* private mode */ }
    try {
      let started: { raceId: string; drop: { x: number; z: number }; finish: { x: number; z: number }; routeM: number; tile: { lat: number; lng: number } } | null = null;
      const deadline = Date.now() + 4 * 60_000;
      for (;;) {
        const r = await fetch(`/api/race/${props.token}/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ player: name }) });
        const j = await r.json();
        if (r.status === 202 && j.pending) {
          if (Date.now() > deadline) throw new Error("OpenStreetMap is taking too long. Try again in a few minutes.");
          await new Promise((res) => setTimeout(res, 5000));
          continue;
        }
        if (!r.ok) throw new Error(j.error || "Could not start the hunt.");
        started = j;
        break;
      }
      if (!started) throw new Error("Could not start the hunt.");
      const t = await fetchTile(started.tile);
      setTile(t);
      setRace({
        raceId: started.raceId, drop: started.drop, routeM: started.routeM,
        finish: { x: started.finish.x, z: started.finish.z, brand: b.brand, colors: b.colors, logoUrl: b.logoUrl },
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

  const onEvent = async (e: RaceEvent) => {
    if (e.type === "junction") return;
    if (e.type === "finish" && race && !finishing.current) {
      finishing.current = true;
      setPhase("claiming");
      if (props.mapsKey && b) {
        setPhoto(`https://maps.googleapis.com/maps/api/streetview?size=480x270&location=${b.lat.toFixed(6)},${b.lng.toFixed(6)}&fov=80&pitch=6&key=${props.mapsKey}`);
      }
      try {
        const r = await fetch(`/api/race/${props.token}/finish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ raceId: race.raceId, elapsedMs: e.elapsedMs }) });
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

  const pop = () => {
    setPops((p) => Math.min(3, p + 1));
    try { navigator.vibrate?.(pops >= 2 ? [30, 40, 60] : 20); } catch { /* no haptics */ }
  };

  const copy = () => {
    if (!result?.prize) return;
    navigator.clipboard?.writeText(result.prize.code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => undefined);
  };

  // ---- screens ----
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
          <p className={styles.note}>You are dropped on a real street a short drive away. Race to the balloons. First to arrive takes the next prize code and shows it at the counter.</p>
          <input className={own.name} value={name} maxLength={24} placeholder="Your hunter name" onChange={(e) => setName(e.target.value)} />
          {error && <p className={`${styles.msg} ${styles.error}`}>{error}</p>}
          {phase === "starting"
            ? <p className={styles.msg}>Finding you a street… the first hunt at a new place takes up to a minute.</p>
            : <button type="button" className={styles.primary} onClick={hunt}>Hunt</button>}
          {board && board.top.length > 0 && (
            <div className={own.board}>
              <p className={own.boardTitle}>Fastest hunters</p>
              {board.top.slice(0, 5).map((r) => (
                <div key={r.place} className={own.row}><span>{r.place}. {r.player}</span><span>{fmt(r.elapsedMs)}{r.won ? " 🎈" : ""}</span></div>
              ))}
            </div>
          )}
          <p className={styles.note}>Steer with the wheel, GO and STOP with the pedals, N is nitro. Hold the wheel left or right at a junction to pick the turn. The arrow on the map points at the prize.</p>
        </>,
      )}

      {(phase === "racing" || phase === "claiming" || phase === "done") && tile && race && (
        <RaceCanvas tile={tile} start={race.drop} finish={race.finish} mapsKey={props.mapsKey} debug={props.debug} frozen={phase !== "racing"} onEvent={onEvent} />
      )}

      {phase === "claiming" && (
        <div className={own.overlay}><div className={own.sheet}><p className={own.big}>You made it!</p><p className={styles.msg}>Checking your time…</p></div></div>
      )}

      {phase === "done" && result && (
        <div className={own.overlay}>
          <div className={own.sheet}>
            <p className={own.big}>{result.place === 1 ? "Fastest hunter!" : `${result.place}${result.place === 2 ? "nd" : result.place === 3 ? "rd" : "th"} fastest`}</p>
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
            <button type="button" className={styles.primary} onClick={() => { setPhase("landing"); setRace(null); }}>Hunt again</button>
          </div>
        </div>
      )}
    </div>
  );
}
