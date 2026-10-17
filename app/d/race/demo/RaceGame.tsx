"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ACESFilmicToneMapping, Color, DirectionalLight, FogExp2, HemisphereLight, PerspectiveCamera, Scene, SRGBColorSpace,
  Vector3, WebGLRenderer,
} from "three";
import { RoadGraph } from "@/lib/race/graph";
import { buildCity, marker } from "@/lib/race/city";
import { Car, type CarEvent, type CarInput } from "@/lib/race/car";
import { projector, type RoadTile } from "@/lib/race/types";
import styles from "./race.module.css";

/**
 * The drive-my-street demo. Loads the streets around the start, builds the
 * city and the car, and runs the loop. A thumb on the wheel steers (and picks
 * the way at junctions), the right-hand pedals go and stop, the N button is
 * nitro. The first time you reach a real junction a Street View photo of it
 * slides in, so the stylised street and the real one meet.
 */

type Phase = "locate" | "loading" | "ready" | "error";
type Card = { url: string; title: string };

const LAGOS_ISLAND = { lat: 6.4541, lng: 3.3947 };
const MAX_PHOTOS = 20;

export default function RaceGame(props: { start: { lat: number; lng: number } | null; debug: boolean; mapsKey: string }) {
  const [phase, setPhase] = useState<Phase>(props.start ? "loading" : "locate");
  const [error, setError] = useState<string | null>(null);
  const [tile, setTile] = useState<RoadTile | null>(null);
  const [start, setStart] = useState(props.start);
  const [kmh, setKmh] = useState(0);
  const [nitro, setNitro] = useState(1);
  const [road, setRoad] = useState<string | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [counts, setCounts] = useState({ roads: 0, buildings: 0, trees: 0 });
  const [dbg, setDbg] = useState("");
  const [locating, setLocating] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const wheelRef = useRef<HTMLDivElement>(null);
  const input = useRef<CarInput>({ throttle: 0, brake: 0, steer: 0, nitro: false });
  const wheelDrag = useRef<{ id: number } | null>(null);
  const photos = useRef(0);
  const cardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [wheelAngle, setWheelAngle] = useState(0);

  // ---- the streets ----
  const load = useCallback(async (at: { lat: number; lng: number }) => {
    setPhase("loading");
    setError(null);
    try {
      // The first visit to a new place asks OpenStreetMap in the background;
      // the server says "pending" until the tile is in, so poll for it.
      const deadline = Date.now() + 4 * 60_000;
      let j: { pending?: boolean; error?: string; roads?: unknown[] } & Partial<RoadTile> = {};
      for (;;) {
        const r = await fetch(`/api/race/tiles?lat=${at.lat}&lng=${at.lng}`, { cache: "no-store" });
        j = await r.json();
        if (r.status === 202 && j.pending) {
          if (Date.now() > deadline) throw new Error("OpenStreetMap is taking too long. Try again in a few minutes.");
          await new Promise((res) => setTimeout(res, 5000));
          continue;
        }
        if (!r.ok) throw new Error(j.error || "Could not load the streets.");
        break;
      }
      if (!j.roads?.length) throw new Error("No roads here yet. Try a point nearer a town.");
      setTile(j as RoadTile);
      setPhase("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the streets.");
      setPhase("error");
    }
  }, []);

  useEffect(() => { if (props.start) load(props.start); }, [props.start, load]);

  const useMyLocation = () => {
    if (!navigator.geolocation) { setError("This browser cannot share your location."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { const at = { lat: p.coords.latitude, lng: p.coords.longitude }; setStart(at); setLocating(false); load(at); },
      () => { setLocating(false); setError("Location was refused. You can still drive Lagos Island."); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };

  // ---- the game ----
  useEffect(() => {
    if (phase !== "ready" || !tile || !canvasRef.current || !start) return;
    const canvas = canvasRef.current;
    const graph = new RoadGraph(tile);
    const near = graph.nearest(0, 0);
    if (!near) { setError("No roads here."); setPhase("error"); return; }

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const renderer = new WebGLRenderer({ canvas, antialias: dpr <= 1.5, powerPreference: "high-performance" });
    renderer.setPixelRatio(dpr);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new Scene();
    scene.fog = new FogExp2(new Color("#dbe9f5"), 0.0011);
    scene.add(new HemisphereLight(0xdcecff, 0x9a8a6a, 1.3));
    const sun = new DirectionalLight(0xfff1d6, 2.4);
    sun.position.set(300, 500, -200);
    scene.add(sun);

    const city = buildCity(tile, graph);
    scene.add(city.group);
    setCounts(city.counts);

    const car = new Car(graph, near);
    scene.add(car.group);
    const startMark = marker("#55cdbc");
    startMark.position.set(car.x, 0, car.z);
    scene.add(startMark);

    const camera = new PerspectiveCamera(62, 1, 0.5, 2600);
    const camPos = new Vector3(car.x, 4, car.z + 10);
    const camLook = new Vector3(car.x, 1, car.z);
    const resize = () => {
      const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.fov = h > w ? 70 : 58;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const { toLatLng } = projector(tile.lat, tile.lng);
    const map = mapRef.current?.getContext("2d") ?? null;
    const events: CarEvent[] = [];
    let last = performance.now(), fpsAcc = 0, fpsN = 0, fps = 0, hudAt = 0, running = true, raf = 0;

    const drawMap = () => {
      if (!map || !mapRef.current) return;
      const W = mapRef.current.width, H = mapRef.current.height, R = 330;
      map.clearRect(0, 0, W, H);
      map.save();
      map.translate(W / 2, H / 2);
      map.rotate(-car.heading);
      map.lineCap = "round";
      for (const e of graph.edges) {
        if (Math.abs(e.ax - car.x) > R && Math.abs(e.bx - car.x) > R) continue;
        if (Math.abs(e.az - car.z) > R && Math.abs(e.bz - car.z) > R) continue;
        map.strokeStyle = e.kind === "primary" || e.kind === "trunk" || e.kind === "secondary" ? "#ffd166" : "#dfe7ee";
        map.lineWidth = Math.max(1.5, e.width / 4);
        map.beginPath();
        map.moveTo((e.ax - car.x) * (W / 2 / R), (e.az - car.z) * (H / 2 / R));
        map.lineTo((e.bx - car.x) * (W / 2 / R), (e.bz - car.z) * (H / 2 / R));
        map.stroke();
      }
      map.restore();
      map.fillStyle = "#ff4d6d";
      map.beginPath(); map.arc(W / 2, H / 2, 4, 0, Math.PI * 2); map.fill();
      map.fillStyle = "rgba(255,255,255,0.9)";
      map.beginPath(); map.moveTo(W / 2, H / 2 - 11); map.lineTo(W / 2 - 4, H / 2 - 4); map.lineTo(W / 2 + 4, H / 2 - 4); map.fill();
    };

    const loop = (now: number) => {
      if (!running) return;
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      events.length = 0;
      car.update(dt, input.current, events);
      for (const ev of events) {
        if (ev.type === "road") setRoad(ev.name);
        if (ev.type === "junction" && props.mapsKey && photos.current < MAX_PHOTOS) {
          photos.current++;
          const [la, ln] = toLatLng(ev.node.x, ev.node.z);
          const deg = Math.round(((ev.heading * 180) / Math.PI + 360) % 360);
          const url = `https://maps.googleapis.com/maps/api/streetview?size=480x270&location=${la.toFixed(6)},${ln.toFixed(6)}&heading=${deg}&fov=80&pitch=4&key=${props.mapsKey}`;
          setCard({ url, title: car.roadName ? `${car.roadName}, for real` : "This junction, for real" });
          if (cardTimer.current) clearTimeout(cardTimer.current);
          cardTimer.current = setTimeout(() => setCard(null), 5000);
        }
      }
      // Chase camera.
      const fx = Math.sin(car.heading), fz = -Math.cos(car.heading);
      const back = 8.5 + Math.abs(car.speed) * 0.06;
      camPos.lerp(new Vector3(car.x - fx * back, 3.6 + Math.abs(car.speed) * 0.01, car.z - fz * back), Math.min(1, dt * 4));
      camLook.lerp(new Vector3(car.x + fx * 7, 1.1, car.z + fz * 7), Math.min(1, dt * 6));
      camera.position.copy(camPos);
      camera.lookAt(camLook);
      renderer.render(scene, camera);

      fpsAcc += dt; fpsN++;
      if (now - hudAt > 120) {
        hudAt = now;
        setKmh(car.kmh);
        setNitro(car.nitro);
        drawMap();
        if (fpsAcc >= 1) { fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
        if (props.debug) setDbg(`fps ${fps} dpr ${dpr.toFixed(2)} roads ${city.counts.roads} buildings ${city.counts.buildings} trees ${city.counts.trees}\nedge ${car.edge.id} s ${car.s.toFixed(1)} lane ${car.lane.toFixed(1)} speed ${car.speed.toFixed(1)} m/s\nphotos ${photos.current} steer ${input.current.steer.toFixed(2)}`);
      }
    };
    raf = requestAnimationFrame(loop);

    const onVis = () => { if (document.visibilityState === "hidden") { running = false; cancelAnimationFrame(raf); } else if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(loop); } };
    document.addEventListener("visibilitychange", onVis);

    const keys = (down: boolean) => (e: KeyboardEvent) => {
      const i = input.current;
      if (e.key === "ArrowUp" || e.key === "w") i.throttle = down ? 1 : 0;
      else if (e.key === "ArrowDown" || e.key === "s") i.brake = down ? 1 : 0;
      else if (e.key === "ArrowLeft" || e.key === "a") i.steer = down ? -1 : (i.steer < 0 ? 0 : i.steer);
      else if (e.key === "ArrowRight" || e.key === "d") i.steer = down ? 1 : (i.steer > 0 ? 0 : i.steer);
      else if (e.key === "Shift") i.nitro = down;
      else return;
      e.preventDefault();
    };
    const kd = keys(true), ku = keys(false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      renderer.dispose();
    };
  }, [phase, tile, start, props.debug, props.mapsKey]);

  // ---- the wheel ----
  const wheelAngleFrom = (e: React.PointerEvent) => {
    const r = wheelRef.current!.getBoundingClientRect();
    const a = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
    return a;
  };
  const wheelDown = (e: React.PointerEvent) => {
    wheelDrag.current = { id: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    wheelMove(e);
  };
  const wheelMove = (e: React.PointerEvent) => {
    if (!wheelDrag.current || wheelDrag.current.id !== e.pointerId) return;
    // Angle from straight up: left of the top is a left turn.
    let a = wheelAngleFrom(e) + Math.PI / 2;
    while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI;
    const steer = Math.max(-1, Math.min(1, a / (Math.PI * 0.55)));
    input.current.steer = steer;
    setWheelAngle(steer * 110);
  };
  const wheelUp = (e: React.PointerEvent) => {
    if (wheelDrag.current?.id !== e.pointerId) return;
    wheelDrag.current = null;
    input.current.steer = 0;
    setWheelAngle(0);
  };
  const pedal = (key: "throttle" | "brake" | "nitro", on: boolean) => (e: React.PointerEvent) => {
    e.preventDefault();
    if (key === "nitro") input.current.nitro = on; else input.current[key] = on ? 1 : 0;
  };

  const ready = phase === "ready" && !!tile;

  return (
    <div className={styles.app} data-phase={phase} data-roads={counts.roads}>
      {phase === "locate" || phase === "loading" || phase === "error" ? (
        <main className={styles.panelWrap}>
          <section className={styles.panel}>
            <p className={styles.kicker}>Bounty Run</p>
            <h1 className={styles.title}>Drive your street</h1>
            {phase === "loading" && <p className={styles.msg}>Preparing your streets… the first time at a new place takes up to a minute.</p>}
            {error && <p className={`${styles.msg} ${styles.error}`}>{error}</p>}
            {phase !== "loading" && (
              <>
                <button type="button" className={styles.primary} onClick={useMyLocation} disabled={locating}>{locating ? "Finding you…" : "Use my location"}</button>
                <button type="button" className={styles.quiet} onClick={() => { setStart(LAGOS_ISLAND); load(LAGOS_ISLAND); }}>Drive Lagos Island</button>
              </>
            )}
            <p className={styles.note}>Steer with the wheel, go and stop with the pedals, N is nitro. At a junction, hold the wheel left or right to choose the turn.</p>
          </section>
        </main>
      ) : null}

      {ready && (
        <>
          <canvas ref={canvasRef} className={styles.gl} />
          <div className={styles.hud}>
            <div className={styles.top}>
              <div className={styles.roadName}>{road ?? tile?.roads.find((r) => r.name)?.name ?? "Unnamed road"}</div>
              <canvas ref={mapRef} className={styles.map} width={150} height={150} />
            </div>
            {card && (
              <div className={styles.card}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={card.url} alt="" onError={() => setCard(null)} />
                <span>{card.title}</span>
              </div>
            )}
            <div className={styles.bottom}>
              <div ref={wheelRef} className={styles.wheel} onPointerDown={wheelDown} onPointerMove={wheelMove} onPointerUp={wheelUp} onPointerCancel={wheelUp}>
                <div className={styles.wheelRim} style={{ transform: `rotate(${wheelAngle}deg)` }}><span /><span /><span /></div>
              </div>
              <div className={styles.speedo}>
                <div className={styles.kmh}>{kmh}</div>
                <div className={styles.unit}>km/h</div>
                <div className={styles.nitroBar}><div style={{ width: `${Math.round(nitro * 100)}%` }} /></div>
              </div>
              <div className={styles.pedals}>
                <button type="button" className={styles.nitroBtn} onPointerDown={pedal("nitro", true)} onPointerUp={pedal("nitro", false)} onPointerCancel={pedal("nitro", false)} onPointerLeave={pedal("nitro", false)}>N</button>
                <button type="button" className={styles.brake} onPointerDown={pedal("brake", true)} onPointerUp={pedal("brake", false)} onPointerCancel={pedal("brake", false)} onPointerLeave={pedal("brake", false)}>STOP</button>
                <button type="button" className={styles.gas} onPointerDown={pedal("throttle", true)} onPointerUp={pedal("throttle", false)} onPointerCancel={pedal("throttle", false)} onPointerLeave={pedal("throttle", false)}>GO</button>
              </div>
            </div>
          </div>
          {props.debug && <pre className={styles.debug}>{dbg}</pre>}
        </>
      )}
    </div>
  );
}
