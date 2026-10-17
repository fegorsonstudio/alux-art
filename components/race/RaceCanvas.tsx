"use client";

import { useEffect, useRef, useState } from "react";
import {
  ACESFilmicToneMapping, AdditiveBlending, Color, CylinderGeometry, DirectionalLight, FogExp2, HemisphereLight, Mesh,
  MeshBasicMaterial, PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer,
} from "three";
import { RoadGraph } from "@/lib/race/graph";
import { buildCity, marker } from "@/lib/race/city";
import { Car, buildCarBody, type CarEvent, type CarInput } from "@/lib/race/car";
import type { Pose } from "@/lib/race/realtime";
import { projector, type RoadTile } from "@/lib/race/types";
import { buildBalloon, buildEnvelopeMaps, type BalloonParts } from "@/lib/ar/balloon";
import styles from "./race.module.css";

/**
 * The drivable city, shared by the demo and the bounty hunt. Loads nothing
 * itself: it is given the tile and where to start, and tells its owner what
 * happens (a junction reached, a road entered, the finish crossed, the clock).
 */

export type Finish = { x: number; z: number; brand: string; colors: [string, string]; logoUrl: string | null };
export type RaceEvent =
  | { type: "junction"; lat: number; lng: number; heading: number; road: string | null }
  | { type: "finish"; elapsedMs: number; path: [number, number, number][] };
export type Ghost = { player: string; path: [number, number, number][] };

const OPPONENT_COLORS = ["#2f8e9a", "#ffd166", "#8e44ad", "#27ae60", "#e67e22", "#3498db"];

const MAX_PHOTOS = 20;
const FINISH_RADIUS = 22;

export default function RaceCanvas(props: {
  tile: RoadTile;
  start: { x: number; z: number } | null;
  finish: Finish | null;
  mapsKey: string;
  debug: boolean;
  frozen?: boolean;
  /** A shared start: the clock and the pedals wait for this moment. */
  startsAt?: number | null;
  /** Everyone else's latest pose, kept up to date by the owner (never replaced). */
  others?: Map<string, Pose>;
  /** The fastest earlier run, replayed as a see-through car. */
  ghost?: Ghost | null;
  onPose?: (x: number, z: number, heading: number, speed: number) => void;
  onEvent?: (e: RaceEvent) => void;
}) {
  const [kmh, setKmh] = useState(0);
  const [nitro, setNitro] = useState(1);
  const [road, setRoad] = useState<string | null>(null);
  const [card, setCard] = useState<{ url: string; title: string } | null>(null);
  const [dbg, setDbg] = useState("");
  const [toFinish, setToFinish] = useState<number | null>(null);
  const [clock, setClock] = useState(0);
  const [wheelAngle, setWheelAngle] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const wheelRef = useRef<HTMLDivElement>(null);
  const input = useRef<CarInput>({ throttle: 0, brake: 0, steer: 0, nitro: false });
  const wheelDrag = useRef<{ id: number } | null>(null);
  const photos = useRef(0);
  const cardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEvent = useRef(props.onEvent);
  onEvent.current = props.onEvent;
  const frozen = useRef(!!props.frozen);
  frozen.current = !!props.frozen;
  const onPose = useRef(props.onPose);
  onPose.current = props.onPose;
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const { tile, finish } = props;
    if (!canvas) return;
    const graph = new RoadGraph(tile);
    const near = graph.nearest(props.start?.x ?? 0, props.start?.z ?? 0);
    if (!near) return;

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

    // In a group everyone starts at the same spot: spread the cars across the road.
    const car = new Car(graph, near, "#d9342b", props.others ? (Math.random() * 0.8 - 0.4) : 0.22);
    scene.add(car.group);
    const startMark = marker("#55cdbc");
    startMark.position.set(car.x, 0, car.z);
    scene.add(startMark);

    // The prize: branded balloons tethered above the pin, and a beam you can see from afar.
    let balloons: { parts: BalloonParts; phase: number }[] = [];
    if (finish) {
      const maps = buildEnvelopeMaps({ colorA: finish.colors[0], colorB: finish.colors[1], brand: finish.brand, logo: null });
      for (let i = 0; i < 3; i++) {
        const parts = buildBalloon(maps);
        parts.group.position.set(finish.x + (i - 1) * 14, 26 + i * 6, finish.z + (i % 2) * 10);
        parts.envelope.emissiveIntensity = 0.25;
        scene.add(parts.group);
        balloons.push({ parts, phase: i * 2.1 });
      }
      if (finish.logoUrl) {
        const img = new Image();
        img.onload = () => {
          const m = buildEnvelopeMaps({ colorA: finish.colors[0], colorB: finish.colors[1], brand: finish.brand, logo: img });
          for (const b of balloons) { b.parts.envelope.map = m.map; b.parts.envelope.emissiveMap = m.emissiveMap; b.parts.envelope.needsUpdate = true; }
        };
        img.src = finish.logoUrl;
      }
      const beam = new Mesh(new CylinderGeometry(3, 6, 400, 12, 1, true), new MeshBasicMaterial({ color: new Color(finish.colors[0]), transparent: true, opacity: 0.22, blending: AdditiveBlending, depthWrite: false }));
      beam.position.set(finish.x, 200, finish.z);
      scene.add(beam);
      const finishMark = marker(finish.colors[1]);
      finishMark.position.set(finish.x, 0, finish.z);
      scene.add(finishMark);
    }

    // The others: a car per hunter, eased toward the last pose we heard.
    const others = props.others;
    const rivals = new Map<string, { body: ReturnType<typeof buildCarBody>["body"]; wheels: ReturnType<typeof buildCarBody>["wheels"]; x: number; z: number; h: number; label: HTMLDivElement }>();
    const labels = labelsRef.current;
    const syncRivals = () => {
      if (!others) return;
      for (const [id, p] of others) {
        if (!rivals.has(id)) {
          const built = buildCarBody(OPPONENT_COLORS[rivals.size % OPPONENT_COLORS.length]);
          scene.add(built.body);
          const label = document.createElement("div");
          label.className = styles.rivalLabel;
          label.textContent = p.name || "Hunter";
          labels?.appendChild(label);
          rivals.set(id, { body: built.body, wheels: built.wheels, x: p.x, z: p.z, h: p.h, label });
          built.body.position.set(p.x, 0, p.z);
        }
      }
      for (const [id, r] of rivals) {
        if (!others.has(id)) { scene.remove(r.body); r.label.remove(); rivals.delete(id); }
      }
    };
    // The ghost: the best run, replayed from the start.
    let ghostBody: ReturnType<typeof buildCarBody>["body"] | null = null;
    let ghostLabel: HTMLDivElement | null = null;
    if (props.ghost && props.ghost.path.length > 1) {
      const g = buildCarBody("#ffffff", { ghost: true });
      g.body.position.set(props.ghost.path[0][0], 0, props.ghost.path[0][1]);
      scene.add(g.body);
      ghostBody = g.body;
      ghostLabel = document.createElement("div");
      ghostLabel.className = styles.rivalLabel;
      ghostLabel.textContent = `${props.ghost.player} (ghost)`;
      labels?.appendChild(ghostLabel);
    }
    const placeLabel = (el: HTMLDivElement, x: number, z: number) => {
      const v = new Vector3(x, 2.4, z).project(camera);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (v.z > 1 || v.x < -1.2 || v.x > 1.2 || v.y < -1.2 || v.y > 1.2) { el.style.display = "none"; return; }
      el.style.display = "";
      el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
    };

    const camera = new PerspectiveCamera(62, 1, 0.5, 7000);
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
    let last = performance.now(), fpsAcc = 0, fpsN = 0, fps = 0, hudAt = 0, running = true, raf = 0, t0 = performance.now(), finished = false, moved = false;
    // A shared start: the clock starts at the moment the server named, for everyone.
    const startsAt = props.startsAt ?? null;
    const path: [number, number, number][] = [];
    let lastSample = 0;

    const drawMap = () => {
      if (!map || !mapRef.current) return;
      const W = mapRef.current.width, H = mapRef.current.height, R = 330, k = W / 2 / R;
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
        map.moveTo((e.ax - car.x) * k, (e.az - car.z) * k);
        map.lineTo((e.bx - car.x) * k, (e.bz - car.z) * k);
        map.stroke();
      }
      if (finish) {
        // The prize: on the map when close, else an arrow on the rim.
        const dx = finish.x - car.x, dz = finish.z - car.z, d = Math.hypot(dx, dz);
        if (d < R) { map.fillStyle = finish.colors[1]; map.beginPath(); map.arc(dx * k, dz * k, 6, 0, Math.PI * 2); map.fill(); }
        else {
          const ux = dx / d, uz = dz / d, rr = W / 2 - 10;
          map.fillStyle = finish.colors[1];
          map.beginPath(); map.moveTo(ux * rr, uz * rr); map.lineTo(ux * (rr - 14) - uz * 7, uz * (rr - 14) + ux * 7); map.lineTo(ux * (rr - 14) + uz * 7, uz * (rr - 14) - ux * 7); map.fill();
        }
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
      const waiting = startsAt != null && Date.now() < startsAt;
      const inp = frozen.current || finished || waiting ? { throttle: 0, brake: 1, steer: 0, nitro: false } : input.current;
      if (startsAt != null) {
        if (!moved && !waiting) { moved = true; t0 = now - (Date.now() - startsAt); }
      } else if (!moved && inp.throttle > 0) { moved = true; t0 = now; }
      car.update(dt, inp, events);
      if (moved && !finished && now - lastSample >= 500) { lastSample = now; path.push([car.x, car.z, car.heading]); }
      onPose.current?.(car.x, car.z, car.heading, car.speed);
      syncRivals();
      for (const [id, r] of rivals) {
        const p = others!.get(id)!;
        // Ease toward the last pose, nudged along by its own speed since then.
        const age = Math.min(1, (performance.now() - p.t) / 1000);
        const tx = p.x + Math.sin(p.h) * p.v * age, tz = p.z - Math.cos(p.h) * p.v * age;
        r.x += (tx - r.x) * Math.min(1, dt * 6); r.z += (tz - r.z) * Math.min(1, dt * 6);
        let dh = p.h - r.h; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
        r.h += dh * Math.min(1, dt * 6);
        r.body.position.set(r.x, 0, r.z);
        r.body.rotation.y = -r.h;
        for (const w of r.wheels) w.rotation.x += (p.v * dt) / 0.36;
        placeLabel(r.label, r.x, r.z);
      }
      if (ghostBody && props.ghost) {
        const gp = props.ghost.path;
        const tGhost = moved ? (now - t0) / 500 : 0;
        const i = Math.min(gp.length - 1, Math.floor(tGhost)), f = Math.min(1, tGhost - i);
        const a = gp[i], b = gp[Math.min(gp.length - 1, i + 1)];
        ghostBody.position.set(a[0] + (b[0] - a[0]) * f, 0, a[1] + (b[1] - a[1]) * f);
        ghostBody.rotation.y = -a[2];
        if (ghostLabel) placeLabel(ghostLabel, ghostBody.position.x, ghostBody.position.z);
      }
      for (const ev of events) {
        if (ev.type === "road") setRoad(ev.name);
        if (ev.type === "junction") {
          const [la, ln] = toLatLng(ev.node.x, ev.node.z);
          onEvent.current?.({ type: "junction", lat: la, lng: ln, heading: ev.heading, road: car.roadName });
          if (props.mapsKey && photos.current < MAX_PHOTOS) {
            photos.current++;
            const deg = Math.round(((ev.heading * 180) / Math.PI + 360) % 360);
            const url = `https://maps.googleapis.com/maps/api/streetview?size=480x270&location=${la.toFixed(6)}&heading=${deg}&fov=80&pitch=4&key=${props.mapsKey}`.replace(`location=${la.toFixed(6)}`, `location=${la.toFixed(6)},${ln.toFixed(6)}`);
            setCard({ url, title: car.roadName ? `${car.roadName}, for real` : "This junction, for real" });
            if (cardTimer.current) clearTimeout(cardTimer.current);
            cardTimer.current = setTimeout(() => setCard(null), 5000);
          }
        }
      }
      const t = now / 1000;
      for (const b of balloons) {
        b.parts.group.position.y += Math.sin(t * 0.7 + b.phase) * 0.012;
        b.parts.group.rotation.y += 0.0015;
        b.parts.envelope.emissiveIntensity = 0.2 + 0.15 * (1 + Math.sin(t * 1.3 + b.phase));
      }
      if (finish && !finished) {
        const d = Math.hypot(finish.x - car.x, finish.z - car.z);
        if (d <= FINISH_RADIUS && moved) {
          finished = true;
          path.push([car.x, car.z, car.heading]);
          onEvent.current?.({ type: "finish", elapsedMs: Math.round(now - t0), path });
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
        if (finish) setToFinish(Math.hypot(finish.x - car.x, finish.z - car.z));
        if (finish && moved && !finished) setClock(now - t0);
        if (startsAt != null) setCountdown(waiting ? Math.ceil((startsAt - Date.now()) / 1000) : null);
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
      balloons = [];
      for (const r of rivals.values()) r.label.remove();
      ghostLabel?.remove();
      renderer.dispose();
    };
    // The tile and the start never change while the canvas is mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.tile, props.start, props.finish, props.mapsKey, props.debug, props.startsAt, props.ghost, props.others]);

  // ---- the wheel ----
  const wheelDown = (e: React.PointerEvent) => {
    wheelDrag.current = { id: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    wheelMove(e);
  };
  const wheelMove = (e: React.PointerEvent) => {
    if (!wheelDrag.current || wheelDrag.current.id !== e.pointerId || !wheelRef.current) return;
    const r = wheelRef.current.getBoundingClientRect();
    let a = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) + Math.PI / 2;
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

  const fmtClock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
  const fmtDist = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

  return (
    <div className={styles.stage}>
      <canvas ref={canvasRef} className={styles.gl} />
      <div ref={labelsRef} className={styles.labels} />
      {countdown != null && <div className={styles.countdown}>{countdown > 0 ? countdown : "GO"}</div>}
      <div className={styles.hud}>
        <div className={styles.top}>
          <div className={styles.roadName}>{road ?? props.tile.roads.find((r) => r.name)?.name ?? "Unnamed road"}</div>
          {props.finish && (
            <div className={styles.race}>
              <span className={styles.clock}>{fmtClock(clock)}</span>
              <span className={styles.dist}>{toFinish != null ? fmtDist(toFinish) : ""} to the prize</span>
            </div>
          )}
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
    </div>
  );
}
