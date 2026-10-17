"use client";

import { useEffect, useRef, useState } from "react";
import { balloonIcon } from "@/lib/race/gmaps";
import { carSprite, personSprite } from "@/lib/race/traffic";
import { TrackTraffic } from "@/lib/race/track-traffic";
import { TrackGeom } from "@/lib/race/track";
import type { Pose } from "@/lib/race/realtime";
import styles from "./race.module.css";

/**
 * The hunt on a road a player recorded: the video IS the road. GO plays it
 * forward, your speed is the playback speed (full throttle is 1.3× the
 * recording, nitro more), STOP holds, the wheel leans the view. Where you are
 * on the road comes from the GPS track logged while it was filmed, so the
 * other hunters, the ghost and the minimap line up; the prize balloon floats
 * over the end of the road, and our own cars and people share it with you.
 */

export type Finish = { lat: number; lng: number; brand: string; colors: [string, string]; logoUrl: string | null };
export type Ghost = { player: string; path: [number, number, number][] };
export type RaceEvent =
  | { type: "finish"; elapsedMs: number; path: [number, number, number][] }
  | { type: "error"; message: string };
export type RoadData = {
  id: string; name: string; videoUrl: string; posterUrl: string | null; durationS: number; lengthM: number;
  width: number; height: number; track: [number, number, number][];
};

const OPPONENT_COLORS = ["#2f8e9a", "#ffd166", "#8e44ad", "#27ae60", "#e67e22", "#3498db"];
const FULL_THROTTLE_RATE = 1.3;
type Placement = { url: string; wM: number; hM: number; liftM?: number; minPx?: number; maxPx?: number; label?: string; opacity?: number };
type Item = { img: HTMLImageElement; tag: HTMLSpanElement; url: string; shown: boolean };

export default function VideoRace(props: {
  road: RoadData;
  finish: Finish;
  debug: boolean;
  frozen?: boolean;
  startsAt?: number | null;
  others?: Map<string, Pose>;
  ghost?: Ghost | null;
  onPose?: (lat: number, lng: number, heading: number, speed: number) => void;
  onEvent?: (e: RaceEvent) => void;
}) {
  const [kmh, setKmh] = useState(0);
  const [nitro, setNitro] = useState(1);
  const [toFinish, setToFinish] = useState<number | null>(null);
  const [clock, setClock] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [wheelAngle, setWheelAngle] = useState(0);
  const [lean, setLean] = useState(0);
  const [loading, setLoading] = useState("Loading the road…");
  const [dbg, setDbg] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const wheelRef = useRef<HTMLDivElement>(null);
  const input = useRef({ throttle: 0, brake: 0, steer: 0, nitro: false });
  const wheelDrag = useRef<{ id: number } | null>(null);
  const onEvent = useRef(props.onEvent); onEvent.current = props.onEvent;
  const onPose = useRef(props.onPose); onPose.current = props.onPose;
  const frozen = useRef(!!props.frozen); frozen.current = !!props.frozen;

  useEffect(() => {
    const video = videoRef.current, host = hostRef.current;
    if (!video || !host) return;
    let cancelled = false;
    const { road, finish } = props;
    const geom = new TrackGeom(road.track, road.durationS, road.lengthM, finish);
    const traffic = new TrackTraffic(3, 2);
    const prizeUrl = balloonIcon(finish.colors[0], finish.colors[1]);
    const items = new Map<string, Item>();
    const rivalS = new Map<string, { s: number; color: string; lane: number }>();

    // ---- our pictures over the video: a thing `ahead` metres down the road and `lateral` metres to the right ----
    const item = (id: string): Item => {
      let it = items.get(id);
      if (it) return it;
      const img = document.createElement("img");
      img.alt = ""; img.draggable = false;
      img.style.cssText = "position:absolute;left:0;top:0;will-change:transform;display:none;pointer-events:none;";
      const tag = document.createElement("span");
      tag.style.cssText = "position:absolute;left:0;top:0;display:none;padding:2px 7px;border-radius:999px;background:rgba(10,20,24,0.65);color:#fff;font-size:11px;font-weight:700;white-space:nowrap;pointer-events:none;";
      host.appendChild(img); host.appendChild(tag);
      it = { img, tag, url: "", shown: false };
      items.set(id, it);
      return it;
    };
    const hide = (id: string) => { const it = items.get(id); if (it && it.shown) { it.img.style.display = "none"; it.tag.style.display = "none"; it.shown = false; } };
    let leanNow = 0;
    const place = (id: string, ahead: number, lateral: number, p: Placement) => {
      if (ahead < 2) { hide(id); return; }
      const W = host.clientWidth, H = host.clientHeight;
      const f = 0.95 * W, horizon = H * 0.46, camH = 1.5;
      const pxPerM = f / ahead;
      const x = W / 2 + f * (lateral / ahead) - leanNow * W * 0.04;
      const y = horizon + (camH - (p.liftM ?? 0)) * pxPerM;
      let h = p.hM * pxPerM, w = p.wM * pxPerM;
      if (p.minPx && h < p.minPx) { w *= p.minPx / h; h = p.minPx; }
      if (p.maxPx && h > p.maxPx) { w *= p.maxPx / h; h = p.maxPx; }
      if (x < -w || x > W + w || y < -h || y > H + h) { hide(id); return; }
      const it = item(id);
      if (it.url !== p.url) { it.url = p.url; it.img.src = p.url; }
      it.img.style.width = `${w}px`; it.img.style.height = `${h}px`;
      it.img.style.transform = `translate3d(${x - w / 2}px, ${y - h}px, 0)`;
      it.img.style.opacity = String(p.opacity ?? 1);
      it.img.style.zIndex = String(Math.max(1, Math.round(5000 - ahead)));
      if (!it.shown) { it.img.style.display = "block"; it.shown = true; }
      if (p.label) { it.tag.textContent = p.label; it.tag.style.transform = `translate3d(${x}px, ${y - h - 6}px, 0) translate(-50%, -100%)`; it.tag.style.zIndex = String(Math.round(5001 - ahead)); it.tag.style.display = "block"; }
      else it.tag.style.display = "none";
    };

    // ---- the minimap: the road's own line, you in the middle, the end as a dot ----
    const lat0 = geom.lat[0], lng0 = geom.lng[0];
    const mx = 111_320 * Math.cos((lat0 * Math.PI) / 180), mz = 110_540;
    const toXZ = (lat: number, lng: number): [number, number] => [(lng - lng0) * mx, -(lat - lat0) * mz];
    const lineXZ = geom.lat.map((la, i) => toXZ(la, geom.lng[i]));
    const map = mapRef.current?.getContext("2d") ?? null;
    const drawMap = (lat: number, lng: number, headingDeg: number) => {
      if (!map || !mapRef.current) return;
      const [cx, cz] = toXZ(lat, lng);
      const W = mapRef.current.width, H = mapRef.current.height, Rm = Math.max(120, Math.min(400, geom.length * 0.35)), k = W / 2 / Rm;
      map.clearRect(0, 0, W, H);
      map.save(); map.translate(W / 2, H / 2); map.rotate((-headingDeg * Math.PI) / 180);
      map.strokeStyle = "rgba(47, 142, 154, 0.95)"; map.lineWidth = 4; map.lineCap = "round"; map.lineJoin = "round"; map.beginPath();
      lineXZ.forEach(([x, z], i) => { if (i === 0) map.moveTo((x - cx) * k, (z - cz) * k); else map.lineTo((x - cx) * k, (z - cz) * k); });
      map.stroke();
      const [fx, fz] = lineXZ[lineXZ.length - 1];
      map.fillStyle = finish.colors[1]; map.beginPath(); map.arc((fx - cx) * k, (fz - cz) * k, 6, 0, Math.PI * 2); map.fill();
      map.restore();
      map.fillStyle = "#ff4d6d"; map.beginPath(); map.arc(W / 2, H / 2, 4, 0, Math.PI * 2); map.fill();
      map.fillStyle = "rgba(255,255,255,0.9)"; map.beginPath(); map.moveTo(W / 2, H / 2 - 11); map.lineTo(W / 2 - 4, H / 2 - 4); map.lineTo(W / 2 + 4, H / 2 - 4); map.fill();
    };

    // ---- the video ----
    const onReady = () => setLoading("");
    const onErr = () => { if (!cancelled) onEvent.current?.({ type: "error", message: "The road video could not be played. Try again in a moment." }); };
    video.addEventListener("canplay", onReady);
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("error", onErr);
    video.load();

    // ---- driving ----
    let v = 0, nitroLeft = 1, last = performance.now(), t0 = last, moved = false, finished = false, lastSample = 0, hudAt = 0;
    const path: [number, number, number][] = [];
    const startsAt = props.startsAt ?? null;
    const timer = setInterval(() => {
      if (cancelled) return;
      const now = performance.now();
      const dt = Math.min(0.2, (now - last) / 1000);
      last = now;
      const waiting = startsAt != null && Date.now() < startsAt;
      const inp = frozen.current || finished || waiting ? { throttle: 0, brake: 1, steer: 0, nitro: false } : input.current;
      if (startsAt != null) { if (!moved && !waiting) { moved = true; t0 = now - (Date.now() - startsAt); } }
      else if (!moved && inp.throttle > 0) { moved = true; t0 = now; }

      const top = inp.nitro && nitroLeft > 0 ? 1.5 : 1;
      if (inp.throttle > 0) v = Math.min(top, v + dt * 0.9 * (inp.nitro ? 1.6 : 1));
      else v = Math.max(0, v - dt * 0.6);
      if (inp.brake > 0) v = Math.max(0, v - dt * 2.5);
      if (inp.nitro && inp.throttle > 0 && nitroLeft > 0) nitroLeft = Math.max(0, nitroLeft - dt / 3.5); else nitroLeft = Math.min(1, nitroLeft + dt / 14);
      leanNow += (inp.steer - leanNow) * Math.min(1, dt * 6);

      // Your speed is the playback speed. Muted + playsinline: play() is allowed without a tap.
      const rate = Math.max(0.3, Math.min(2, v * FULL_THROTTLE_RATE));
      if (v < 0.08 || finished || frozen.current) { if (!video.paused) video.pause(); }
      else {
        if (Math.abs(video.playbackRate - rate) > 0.02) video.playbackRate = rate;
        if (video.paused) video.play().catch(() => undefined);
      }
      const time = video.currentTime;
      const s = geom.sAt(time);
      const pos = geom.posAt(s);
      const ground = video.paused ? 0 : geom.speedAt(time) * video.playbackRate;
      const remaining = geom.length - s;
      if (moved && !finished && now - lastSample >= 500) { lastSample = now; path.push([pos.lat, pos.lng, pos.heading]); }
      onPose.current?.(pos.lat, pos.lng, pos.heading, ground);
      if (!finished && moved && (video.ended || time >= geom.duration - 0.25 || remaining <= 3)) {
        finished = true;
        video.pause();
        path.push([pos.lat, pos.lng, pos.heading]);
        onEvent.current?.({ type: "finish", elapsedMs: Math.round(now - t0), path });
      }
      if (now - hudAt > 120) {
        hudAt = now;
        setKmh(Math.round(ground * 3.6));
        setNitro(nitroLeft);
        setToFinish(Math.max(0, remaining));
        setLean(leanNow);
        if (moved && !finished) setClock(now - t0);
        if (startsAt != null) setCountdown(waiting ? Math.ceil((startsAt - Date.now()) / 1000) : null);
        drawMap(pos.lat, pos.lng, pos.heading);
        if (props.debug) setDbg(`time ${time.toFixed(1)}/${geom.duration.toFixed(0)} s rate ${video.paused ? 0 : video.playbackRate.toFixed(2)} speed ${ground.toFixed(1)} m/s\nalong ${Math.round(s)}/${Math.round(geom.length)} m lat ${pos.lat.toFixed(5)} lng ${pos.lng.toFixed(5)} rivals ${rivalS.size} traffic ${traffic.agents.filter((a) => a.alive).length}${geom.synthetic ? " (no gps)" : ""}`);
      }

      // The prize balloon over the end of the road; a small beacon from afar.
      place("prize", remaining, 0, { url: prizeUrl, wM: 9, hM: 12, liftM: 10, minPx: 44, maxPx: 520 });

      // Our traffic.
      traffic.update(dt, s, geom.length);
      traffic.agents.forEach((a, i) => {
        const id = `t${i}`;
        if (!a.alive) { hide(id); return; }
        if (a.kind === "car") place(id, a.s - s, a.lateral, { url: carSprite(a.color, a.speed >= 0 ? "back" : "front"), wM: 1.9, hM: 1.5 });
        else place(id, a.s - s, a.lateral, { url: personSprite(a.color, (Math.floor(now / 350) % 2) as 0 | 1, a.speed >= 0 ? "right" : "left"), wM: 0.6, hM: 1.7 });
      });

      // The others, by how far along the road their last pose is.
      if (props.others) {
        for (const [id, p] of props.others) {
          let r = rivalS.get(id);
          const target = geom.sOf(p.lat, p.lng);
          if (!r) { r = { s: target, color: OPPONENT_COLORS[rivalS.size % OPPONENT_COLORS.length], lane: rivalS.size % 2 ? -1.6 : 1.6 }; rivalS.set(id, r); }
          r.s += (target - r.s) * Math.min(1, dt * 4);
          place(`r:${id}`, r.s - s, r.lane, { url: carSprite(r.color, "back"), wM: 1.9, hM: 1.5, label: p.name || "Hunter" });
        }
        for (const id of [...rivalS.keys()]) if (!props.others.has(id)) { rivalS.delete(id); hide(`r:${id}`); }
      }
      if (props.ghost && props.ghost.path.length > 1) {
        const gp = props.ghost.path;
        const tg = moved ? (now - t0) / 500 : 0;
        const i = Math.min(gp.length - 1, Math.floor(tg)), f = Math.min(1, tg - i);
        const a = gp[i], b = gp[Math.min(gp.length - 1, i + 1)];
        const gs = geom.sOf(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f);
        place("ghost", gs - s, -1.2, { url: carSprite("#ffffff", "back"), wM: 1.9, hM: 1.5, opacity: 0.55, label: `${props.ghost.player} (ghost)` });
      }
    }, 50);

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
      cancelled = true;
      clearInterval(timer);
      video.pause();
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("error", onErr);
      for (const it of items.values()) { it.img.remove(); it.tag.remove(); }
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
    // The road and the finish never change while mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.road, props.finish, props.debug, props.startsAt, props.ghost, props.others]);

  // ---- the wheel ----
  const wheelDown = (e: React.PointerEvent) => { wheelDrag.current = { id: e.pointerId }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); wheelMove(e); };
  const wheelMove = (e: React.PointerEvent) => {
    if (!wheelDrag.current || wheelDrag.current.id !== e.pointerId || !wheelRef.current) return;
    const r = wheelRef.current.getBoundingClientRect();
    let a = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) + Math.PI / 2;
    while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI;
    const steer = Math.max(-1, Math.min(1, a / (Math.PI * 0.55)));
    input.current.steer = steer;
    setWheelAngle(steer * 110);
  };
  const wheelUp = (e: React.PointerEvent) => { if (wheelDrag.current?.id !== e.pointerId) return; wheelDrag.current = null; input.current.steer = 0; setWheelAngle(0); };
  const pedal = (key: "throttle" | "brake" | "nitro", on: boolean) => (e: React.PointerEvent) => { e.preventDefault(); if (key === "nitro") input.current.nitro = on; else input.current[key] = on ? 1 : 0; };

  const fmtClock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
  const fmtDist = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

  return (
    <div className={styles.stage}>
      <video
        ref={videoRef} className={styles.gl} src={props.road.videoUrl} poster={props.road.posterUrl ?? undefined}
        playsInline muted preload="auto" disablePictureInPicture
        style={{ objectFit: "cover", transform: `translateX(${-lean * 3}%) rotate(${-lean * 1.2}deg) scale(1.1)`, transition: "transform 120ms linear", background: "#000" }}
      />
      <div ref={hostRef} className={styles.sprites} aria-hidden />
      {loading && <div className={styles.loadingPano}>{loading}</div>}
      {countdown != null && <div className={styles.countdown}>{countdown > 0 ? countdown : "GO"}</div>}
      <div className={styles.hud}>
        <div className={styles.top}>
          <div className={styles.roadName}>{props.road.name}</div>
          <div className={styles.race}>
            <span className={styles.clock}>{fmtClock(clock)}</span>
            <span className={styles.dist}>{toFinish != null ? fmtDist(toFinish) : ""} to the prize</span>
          </div>
          <canvas ref={mapRef} className={styles.map} width={150} height={150} />
        </div>
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
