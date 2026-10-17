"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps, distanceM, bearingDeg, angleDiff, carIcon, balloonIcon } from "@/lib/race/gmaps";
import { projector, type RoadTile } from "@/lib/race/types";
import type { Pose } from "@/lib/race/realtime";
import { Traffic, carSprite, personSprite, type SpriteView } from "@/lib/race/traffic";
import { SpriteLayer } from "@/lib/race/sprite-layer";
import styles from "./race.module.css";

/**
 * The hunt through real Google Street View. The panorama is the world; GO
 * steps it along the road photo by photo in the direction you are facing,
 * the wheel turns you and picks the way at a junction, STOP holds. The
 * minimap and the prize arrow come from the OpenStreetMap tile. The other
 * hunters, the ghost, the balloons and our traffic are pictures in a layer of ours, placed by projection.
 */

export type Finish = { lat: number; lng: number; brand: string; colors: [string, string]; logoUrl: string | null };
export type Ghost = { player: string; path: [number, number, number][] };
export type RaceEvent =
  | { type: "finish"; elapsedMs: number; path: [number, number, number][] }
  | { type: "nocoverage" }
  | { type: "error"; message: string };

const FINISH_RADIUS = 28;
const HOPS_PER_SEC = 1.6;
const OPPONENT_COLORS = ["#2f8e9a", "#ffd166", "#8e44ad", "#27ae60", "#e67e22", "#3498db"];

/** Which side of a car or person the player sees, from its heading and where it is relative to them. */
const viewOf = (h: number, bear: number): SpriteView => {
  const rel = angleDiff(h, bear);
  if (Math.abs(rel) < 55) return "back";
  if (Math.abs(rel) > 125) return "front";
  return Math.abs(angleDiff(h, bear + 90)) < 90 ? "right" : "left";
};
const carBox = (view: SpriteView) => ({ wM: view === "back" || view === "front" ? 1.9 : 4.3, hM: 1.5 });

export default function StreetViewRace(props: {
  tile: RoadTile;
  drop: { lat: number; lng: number };
  finish: Finish;
  mapsKey: string;
  debug: boolean;
  frozen?: boolean;
  startsAt?: number | null;
  others?: Map<string, Pose>;
  ghost?: Ghost | null;
  /** The road route from the drop to the prize: drawn on the minimap and used to preload the photos ahead. */
  route?: { lat: number; lng: number }[];
  onPose?: (lat: number, lng: number, heading: number, speed: number) => void;
  onEvent?: (e: RaceEvent) => void;
}) {
  const [kmh, setKmh] = useState(0);
  const [nitro, setNitro] = useState(1);
  const [road, setRoad] = useState<string | null>(null);
  const [toFinish, setToFinish] = useState<number | null>(null);
  const [clock, setClock] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [wheelAngle, setWheelAngle] = useState(0);
  const [loading, setLoading] = useState("Loading the real street…");
  const [dbg, setDbg] = useState("");

  const panoRef = useRef<HTMLDivElement>(null);
  const preRef = useRef<HTMLDivElement>(null);
  const spriteRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const wheelRef = useRef<HTMLDivElement>(null);
  const input = useRef({ throttle: 0, brake: 0, steer: 0, nitro: false });
  const wheelDrag = useRef<{ id: number } | null>(null);
  const onEvent = useRef(props.onEvent); onEvent.current = props.onEvent;
  const onPose = useRef(props.onPose); onPose.current = props.onPose;
  const frozen = useRef(!!props.frozen); frozen.current = !!props.frozen;

  useEffect(() => {
    const el = panoRef.current;
    if (!el) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let pano: google.maps.StreetViewPanorama | null = null;
    let layer: SpriteLayer | null = null;
    const { finish, tile } = props;
    const { toXZ } = projector(tile.lat, tile.lng);

    (async () => {
      try {
        const g = await loadGoogleMaps(props.mapsKey);
        if (cancelled) return;
        const svc = new g.maps.StreetViewService();
        const near = await svc.getPanorama({ location: props.drop, radius: 500, preference: g.maps.StreetViewPreference.NEAREST, source: g.maps.StreetViewSource.OUTDOOR }).catch(() => null);
        if (!near?.data?.location?.latLng) { onEvent.current?.({ type: "nocoverage" }); return; }
        const start = near.data.location.latLng;
        // Face the way that leads toward the prize, if a road does.
        const toPrize = bearingDeg(start.lat(), start.lng(), finish.lat, finish.lng);
        const links = near.data.links ?? [];
        const first = links.length ? links.reduce((p, c) => (Math.abs(angleDiff(c?.heading ?? 0, toPrize)) < Math.abs(angleDiff(p?.heading ?? 0, toPrize)) ? c : p)) : null;
        pano = new g.maps.StreetViewPanorama(el, {
          pano: near.data.location.pano,
          pov: { heading: first?.heading ?? toPrize, pitch: 0 },
          zoom: 0.6,
          disableDefaultUI: true, clickToGo: false, scrollwheel: false, linksControl: false, panControl: false,
          zoomControl: false, addressControl: false, fullscreenControl: false, enableCloseButton: false,
          motionTracking: false, motionTrackingControl: false, showRoadLabels: false,
        });
        setLoading("");

        // Preload: a second, invisible panorama is pointed at the photo we are
        // most likely to step to next, so its tiles are already in the
        // browser's cache when the hop comes (Google counts it as one more
        // panorama load per hunt; nothing per step).
        let pre: google.maps.StreetViewPanorama | null = null;
        if (preRef.current) {
          pre = new g.maps.StreetViewPanorama(preRef.current, {
            pano: near.data.location.pano, pov: { heading: first?.heading ?? toPrize, pitch: 0 }, zoom: 0.6,
            disableDefaultUI: true, clickToGo: false, scrollwheel: false, linksControl: false, panControl: false,
            zoomControl: false, addressControl: false, fullscreenControl: false, enableCloseButton: false,
            motionTracking: false, motionTrackingControl: false, showRoadLabels: false,
          });
        }
        let preTarget = near.data.location.pano ?? "", preAt = 0;
        // With a known route the preloader walks ahead of the player along it,
        // 35 m, 70 m then 105 m ahead in turn, so the next photos are in the
        // cache before they are needed.
        const route = props.route ?? [];
        const routeXZ = route.map((p) => toXZ(p.lat, p.lng));
        let preStep = 0;
        const preloadAlongRoute = (lat: number, lng: number) => {
          if (!pre || routeXZ.length < 2) return false;
          const [cx, cz] = toXZ(lat, lng);
          let ni = 0, nd = Infinity;
          for (let i = 0; i < routeXZ.length; i++) { const d = Math.hypot(routeXZ[i][0] - cx, routeXZ[i][1] - cz); if (d < nd) { nd = d; ni = i; } }
          if (nd > 120) return false; // off the route: fall back to the links
          const ahead = 35 * (preStep + 1);
          let acc = 0, ti = ni;
          for (let i = ni; i + 1 < routeXZ.length && acc < ahead; i++) { acc += Math.hypot(routeXZ[i + 1][0] - routeXZ[i][0], routeXZ[i + 1][1] - routeXZ[i][1]); ti = i + 1; }
          preStep = (preStep + 1) % 3;
          const key = `route:${ti}`;
          if (key === preTarget) return true;
          preTarget = key;
          pre.setPosition(route[ti]);
          return true;
        };

        // Everything drawn over the photo (prize, rivals, ghost, our traffic)
        // lives in the sprite layer: our own pictures at projected positions.
        layer = spriteRef.current ? new SpriteLayer(g, pano, spriteRef.current) : null;
        const prizeUrl = balloonIcon(finish.colors[0], finish.colors[1]);
        // Our own traffic: cars and people on the OpenStreetMap roads around
        // the player. (The cars and people in the photos are pixels and cannot move.)
        const traffic = new Traffic(tile, 3, 2);
        const rivalPos = new Map<string, { lat: number; lng: number; color: string }>();
        if (props.debug) (window as unknown as Record<string, unknown>).__svr = { pano, pre, traffic, layer, g };

        // Driving.
        let v = 0, hop = 0, heading = pano.getPov().heading, headingTarget = heading, last = performance.now();
        let t0 = last, moved = false, finished = false, lastSample = 0, hudAt = 0, hopping = false;
        const path: [number, number, number][] = [];
        const startsAt = props.startsAt ?? null;
        pano.addListener("pov_changed", () => { if (!hopping) { const h = pano!.getPov().heading; if (Math.abs(angleDiff(h, heading)) > 2) { heading = h; headingTarget = h; } } });
        pano.addListener("pano_changed", () => {
          const loc = pano!.getLocation();
          setRoad(loc?.shortDescription ?? loc?.description ?? null);
        });

        // One hop at a time: the next waits until the panorama has actually
        // changed (and a beat for its tiles), or the view goes black on a
        // slow connection.
        let hopDone = 0;
        pano.addListener("pano_changed", () => { hopDone = performance.now(); });
        const step = (link: google.maps.StreetViewLink) => {
          if (!link.pano || link.heading == null) return;
          hopping = true;
          hopDone = 0;
          pano!.setPano(link.pano);
          headingTarget = link.heading;
        };
        // The next photo is asked for only once the current one has really
        // arrived. There is no tiles-loaded event, but the tile downloads show
        // up in the browser's resource timing: a hop counts as settled when a
        // few new tiles have landed since it started (or after 3 s regardless).
        const TILE_RE = /streetviewpixels|ggpht.com|cbkd*.google/;
        const tilesSoFar = () => performance.getEntriesByType("resource").filter((e) => TILE_RE.test(e.name)).length;
        let tilesAtHop = 0, hopStartedAt = 0;
        const hopSettled = () => {
          if (!hopping) return true;
          const since = performance.now() - hopStartedAt;
          if (since > 3000) return true;
          if (hopDone === 0 || performance.now() - hopDone < 250) return false;
          return tilesSoFar() - tilesAtHop >= 3;
        };

        timer = setInterval(() => {
          if (cancelled || !pano) return;
          const now = performance.now();
          const dt = Math.min(0.2, (now - last) / 1000);
          last = now;
          const waiting = startsAt != null && Date.now() < startsAt;
          const inp = frozen.current || finished || waiting ? { throttle: 0, brake: 1, steer: 0, nitro: false } : input.current;
          if (startsAt != null) { if (!moved && !waiting) { moved = true; t0 = now - (Date.now() - startsAt); } }
          else if (!moved && inp.throttle > 0) { moved = true; t0 = now; }

          // Speed: 0..1 of a brisk drive; nitro adds a burst.
          const top = inp.nitro && nitro > 0 ? 1.5 : 1;
          if (inp.throttle > 0) v = Math.min(top, v + dt * 0.9 * (inp.nitro ? 1.6 : 1));
          else v = Math.max(0, v - dt * 0.6);
          if (inp.brake > 0) v = Math.max(0, v - dt * 2.5);
          if (inp.nitro && inp.throttle > 0 && nitroLeft > 0) nitroLeft = Math.max(0, nitroLeft - dt / 3.5); else nitroLeft = Math.min(1, nitroLeft + dt / 14);

          // Steering: look around when slow; when moving, bias the next junction.
          if (v < 0.15 && inp.steer !== 0) { heading = (heading + inp.steer * 70 * dt + 360) % 360; headingTarget = heading; pano.setPov({ heading, pitch: 0 }); }
          else {
            const d = angleDiff(headingTarget, heading);
            if (Math.abs(d) > 0.5) { heading = (heading + d * Math.min(1, dt * 5) + 360) % 360; pano.setPov({ heading, pitch: 0 }); }
          }

          // A hop along the road when enough speed has built up.
          if (hopping && hopSettled()) hopping = false;
          if (pre && !hopping && now - preAt > 300) {
            preAt = now;
            const here = pano.getPosition();
            if (here && preloadAlongRoute(here.lat(), here.lng())) { preAt = now + 600; }
            else {
            const links = (pano.getLinks() ?? []).filter((l): l is google.maps.StreetViewLink => !!l && l.heading != null && !!l.pano);
            const want = (heading + inp.steer * 75 + 360) % 360;
            if (links.length) {
              const best = links.reduce((p, c) => (Math.abs(angleDiff(c.heading!, want)) < Math.abs(angleDiff(p.heading!, want)) ? c : p));
              if (best.pano !== preTarget && Math.abs(angleDiff(best.heading!, want)) <= 100) { preTarget = best.pano!; pre.setPano(best.pano!); pre.setPov({ heading: best.heading!, pitch: 0 }); }
            }
            }
          }
          hop += v * HOPS_PER_SEC * dt;
          if (hop >= 1 && !hopping) {
            hop -= 1;
            hopStartedAt = performance.now();
            if (performance.getEntriesByType("resource").length > 200) performance.clearResourceTimings();
            tilesAtHop = tilesSoFar();
            const links = (pano.getLinks() ?? []).filter((l): l is google.maps.StreetViewLink => !!l && l.heading != null);
            const want = (heading + inp.steer * 75 + 360) % 360;
            if (links.length) {
              const best = links.reduce((p, c) => (Math.abs(angleDiff(c.heading!, want)) < Math.abs(angleDiff(p.heading!, want)) ? c : p));
              if (Math.abs(angleDiff(best.heading!, want)) <= 100) step(best); else { v = 0; hop = 0; }
            } else { v = 0; hop = 0; }
          }

          const pos = pano.getPosition();
          if (pos) {
            const lat = pos.lat(), lng = pos.lng();
            if (moved && !finished && now - lastSample >= 500) { lastSample = now; path.push([lat, lng, heading]); }
            onPose.current?.(lat, lng, heading, v * 20);
            const d = distanceM(lat, lng, finish.lat, finish.lng);
            if (!finished && moved && d <= FINISH_RADIUS) {
              finished = true;
              path.push([lat, lng, heading]);
              onEvent.current?.({ type: "finish", elapsedMs: Math.round(now - t0), path });
            }
            if (now - hudAt > 120) {
              hudAt = now;
              setKmh(Math.round(v * 70));
              setNitro(nitroLeft);
              setToFinish(d);
              if (moved && !finished) setClock(now - t0);
              if (startsAt != null) setCountdown(waiting ? Math.ceil((startsAt - Date.now()) / 1000) : null);
              drawMap(lat, lng, heading);
              if (props.debug) setDbg(`speed ${(v * 20).toFixed(1)} m/s heading ${Math.round(heading)} links ${(pano.getLinks() ?? []).length}\nlat ${lat.toFixed(5)} lng ${lng.toFixed(5)} to prize ${Math.round(d)} m rivals ${rivalPos.size} traffic ${traffic.agents.filter((a) => a.alive).length}`);
            }

            // The prize balloon, floating over the pin; a small beacon from afar.
            layer?.place("prize", finish.lat, finish.lng, { url: prizeUrl, wM: 9, hM: 12, liftM: 10, minPx: 44, maxPx: 520 });

            // Traffic: move everyone, then draw each at its projected spot.
            traffic.update(dt, lat, lng);
            if (layer) traffic.agents.forEach((a, i) => {
              const id = `t${i}`;
              if (!a.alive) { layer!.hide(id); return; }
              const view = viewOf(a.heading, bearingDeg(lat, lng, a.lat, a.lng));
              if (a.kind === "car") layer!.place(id, a.lat, a.lng, { url: carSprite(a.color, view), ...carBox(view) });
              else layer!.place(id, a.lat, a.lng, { url: personSprite(a.color, (Math.floor(now / 350) % 2) as 0 | 1, view === "left" ? "left" : "right"), wM: 0.6, hM: 1.7 });
            });
          }

          // The others: a car each, eased toward the last pose, named.
          const herePos = pano.getPosition();
          if (props.others && layer && herePos) {
            for (const [id, p] of props.others) {
              let sp = rivalPos.get(id);
              if (!sp) { sp = { lat: p.lat, lng: p.lng, color: OPPONENT_COLORS[rivalPos.size % OPPONENT_COLORS.length] }; rivalPos.set(id, sp); }
              sp.lat += (p.lat - sp.lat) * Math.min(1, dt * 4); sp.lng += (p.lng - sp.lng) * Math.min(1, dt * 4);
              const view = viewOf(p.h, bearingDeg(herePos.lat(), herePos.lng(), sp.lat, sp.lng));
              layer.place(`r:${id}`, sp.lat, sp.lng, { url: carSprite(sp.color, view), ...carBox(view), label: p.name || "Hunter" });
            }
            for (const id of [...rivalPos.keys()]) if (!props.others.has(id)) { rivalPos.delete(id); layer.remove(`r:${id}`); }
          }
          if (props.ghost && props.ghost.path.length > 1 && layer && herePos) {
            const gp = props.ghost.path;
            const tg = moved ? (now - t0) / 500 : 0;
            const i = Math.min(gp.length - 1, Math.floor(tg)), f = Math.min(1, tg - i);
            const a = gp[i], b = gp[Math.min(gp.length - 1, i + 1)];
            const glat = a[0] + (b[0] - a[0]) * f, glng = a[1] + (b[1] - a[1]) * f;
            const view = viewOf(a[2], bearingDeg(herePos.lat(), herePos.lng(), glat, glng));
            layer.place("ghost", glat, glng, { url: carSprite("#ffffff", view), ...carBox(view), opacity: 0.55, label: `${props.ghost.player} (ghost)` });
          }
        }, 50);
      } catch (e) {
        if (!cancelled) onEvent.current?.({ type: "error", message: e instanceof Error ? e.message : "Street View did not load." });
      }
    })();

    let nitroLeft = 1;
    const routeMapXZ = (props.route ?? []).map((p) => toXZ(p.lat, p.lng));
    const map = mapRef.current?.getContext("2d") ?? null;
    const drawMap = (lat: number, lng: number, headingDeg: number) => {
      if (!map || !mapRef.current) return;
      const [cx, cz] = toXZ(lat, lng);
      const W = mapRef.current.width, H = mapRef.current.height, R = 330, k = W / 2 / R;
      map.clearRect(0, 0, W, H);
      map.save();
      map.translate(W / 2, H / 2);
      map.rotate((-headingDeg * Math.PI) / 180);
      map.lineCap = "round";
      for (const r of tile.roads) {
        for (let i = 0; i + 1 < r.pts.length; i++) {
          const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
          if (Math.abs(ax - cx) > R && Math.abs(bx - cx) > R) continue;
          if (Math.abs(az - cz) > R && Math.abs(bz - cz) > R) continue;
          map.strokeStyle = r.kind === "primary" || r.kind === "trunk" || r.kind === "secondary" ? "#ffd166" : "#dfe7ee";
          map.lineWidth = r.kind === "residential" || r.kind === "living_street" ? 1.5 : 2.5;
          map.beginPath(); map.moveTo((ax - cx) * k, (az - cz) * k); map.lineTo((bx - cx) * k, (bz - cz) * k); map.stroke();
        }
      }
      // The route to the prize, if the server sent one.
      if (routeMapXZ.length > 1) {
        map.strokeStyle = "rgba(47, 142, 154, 0.95)"; map.lineWidth = 3; map.beginPath();
        for (let i = 0; i < routeMapXZ.length; i++) { const [rx, rz] = routeMapXZ[i]; if (i === 0) map.moveTo((rx - cx) * k, (rz - cz) * k); else map.lineTo((rx - cx) * k, (rz - cz) * k); }
        map.stroke();
      }
      const [fx, fz] = toXZ(finish.lat, finish.lng);
      const dx = fx - cx, dz = fz - cz, d = Math.hypot(dx, dz);
      map.fillStyle = finish.colors[1];
      if (d < R) { map.beginPath(); map.arc(dx * k, dz * k, 6, 0, Math.PI * 2); map.fill(); }
      else { const ux = dx / d, uz = dz / d, rr = W / 2 - 10; map.beginPath(); map.moveTo(ux * rr, uz * rr); map.lineTo(ux * (rr - 14) - uz * 7, uz * (rr - 14) + ux * 7); map.lineTo(ux * (rr - 14) + uz * 7, uz * (rr - 14) - ux * 7); map.fill(); }
      map.restore();
      map.fillStyle = "#ff4d6d"; map.beginPath(); map.arc(W / 2, H / 2, 4, 0, Math.PI * 2); map.fill();
      map.fillStyle = "rgba(255,255,255,0.9)"; map.beginPath(); map.moveTo(W / 2, H / 2 - 11); map.lineTo(W / 2 - 4, H / 2 - 4); map.lineTo(W / 2 + 4, H / 2 - 4); map.fill();
    };

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
      if (timer) clearInterval(timer);
      layer?.destroy();
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
    // The drop, the finish and the tile never change while mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.tile, props.drop, props.finish, props.mapsKey, props.debug, props.startsAt, props.ghost, props.others, props.route]);

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
      <div ref={preRef} className={styles.gl} style={{ opacity: 0, pointerEvents: "none" }} aria-hidden />
      <div ref={panoRef} className={styles.gl} />
      <div ref={spriteRef} className={styles.sprites} aria-hidden />
      {loading && <div className={styles.loadingPano}>{loading}</div>}
      {countdown != null && <div className={styles.countdown}>{countdown > 0 ? countdown : "GO"}</div>}
      <div className={styles.hud}>
        <div className={styles.top}>
          <div className={styles.roadName}>{road ?? "Street View"}</div>
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
