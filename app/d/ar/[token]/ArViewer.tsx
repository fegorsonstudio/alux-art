"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { AppDictionary } from "@/lib/dictionaries";
import { GeofenceTracker, type GeoState, compassIndex, formatDistance } from "@/lib/ar/geo";
import { OrientationSource, requestMotionPermission, type HeadingSource } from "@/lib/ar/orientation";
import { BurnerAudio } from "@/lib/ar/audio";
import { composePhoto, sharePhoto } from "@/lib/ar/photo";
import { sendArEvent, distanceBucket, platformOf } from "@/lib/ar/events";
import { detectInApp, escapeUrl } from "@/lib/ar/in-app-browser";
import type { SceneApi } from "./ArScene";
import styles from "./ar.module.css";

const ArScene = dynamic(() => import("./ArScene"), { ssr: false });

export type ArGate = "ok" | "notFound" | "notStarted" | "ended" | "suspended";
export type ArCampaignPublic = {
  brand: string;
  tagline: string;
  logoUrl: string;
  colors: [string, string];
  lat: number;
  lng: number;
  radiusM: number;
  startsAt: string;
  balloonCount: number;
};
type Strings = AppDictionary["arViewer"];
type Phase =
  | "landing" | "inApp" | "desktop" | "unsupported" | "insecure" | "requesting" | "denied"
  | "outside" | "active" | "paused" | "notStarted" | "ended" | "suspended" | "notFound";

const fill = (s: string, v: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k) => (k in v ? String(v[k]) : `{${k}}`));

const SITE = "aluxartandframes.shop";

function stopStream(s: MediaStream | null) {
  s?.getTracks().forEach((t) => t.stop());
}

async function openCamera(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
}

export default function ArViewer(props: {
  token: string;
  gate: ArGate;
  preview: boolean;
  campaign: ArCampaignPublic | null;
  strings: Strings;
  themeLabels: { light: string; dark: string };
  dir: "ltr" | "rtl";
  locale: string;
  debug: boolean;
}) {
  const t = props.strings;
  const c = props.campaign;
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [phase, setPhase] = useState<Phase>("landing");
  const [denied, setDenied] = useState<"camera" | "location">("camera");
  const [geo, setGeo] = useState<GeoState | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [headingSource, setHeadingSource] = useState<HeadingSource>("none");
  const [heading, setHeading] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [walk, setWalk] = useState<{ east: number; north: number } | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [fps, setFps] = useState(0);
  const [here, setHere] = useState("");

  const started = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const tracker = useRef<GeofenceTracker | null>(null);
  const orientation = useRef<OrientationSource | null>(null);
  const sceneApi = useRef<SceneApi | null>(null);
  const audio = useRef<BurnerAudio | null>(null);
  const geoRef = useRef<GeoState | null>(null);
  const origin = useRef<{ lat: number; lng: number } | null>(null);
  const hintTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  /** "You're here, look up", then "tap a balloon", then nothing. */
  const runHints = (first: string) => {
    hintTimers.current.forEach(clearTimeout);
    setHint(first);
    hintTimers.current = [
      setTimeout(() => setHint(t.tapHint), 2800),
      setTimeout(() => setHint(null), 7500),
    ];
  };

  /** Where the viewer has walked since the camera opened, in metres. */
  const updateWalk = (g: GeoState) => {
    if (!g.fix) return;
    const o = origin.current;
    if (!o) return;
    const east = (g.lng - o.lng) * 111_320 * Math.cos((o.lat * Math.PI) / 180);
    const north = (g.lat - o.lat) * 110_540;
    setWalk({ east, north });
  };
  const phaseRef = useRef<Phase>("landing");
  phaseRef.current = phase;

  const directions = t.directions.split(",");

  // ---- first screen: what kind of device and what state the campaign is in ----
  useEffect(() => {
    try {
      const stored = localStorage.getItem("studio-theme");
      if (stored === "dark" || stored === "light") setTheme(stored);
    } catch { /* private mode */ }
    setHere(location.href);

    if (!c || props.gate === "notFound") { setPhase("notFound"); return; }
    if (props.gate === "ended") { setPhase("ended"); return; }
    if (!props.preview) {
      if (props.gate === "notStarted") { setPhase("notStarted"); return; }
      if (props.gate === "suspended") { setPhase("suspended"); return; }
    }
    if (!window.isSecureContext) { setPhase("insecure"); return; }
    if (detectInApp()) { setPhase("inApp"); return; }
    const coarse = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
    if (!coarse) { setPhase("desktop"); return; }
    const gl = (() => { try { const cv = document.createElement("canvas"); return !!(cv.getContext("webgl2") || cv.getContext("webgl")); } catch { return false; } })();
    if (!navigator.mediaDevices?.getUserMedia || !gl) { setPhase("unsupported"); return; }
    setPhase("landing");
    sendArEvent(props.token, { type: "open", preview: props.preview });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTheme = () => setTheme((prev) => {
    const next = prev === "dark" ? "light" : "dark";
    try { localStorage.setItem("studio-theme", next); } catch { /* private mode */ }
    return next;
  });

  // ---- the geofence decides between outside and active once started ----
  const onGeo = useCallback((s: GeoState) => {
    setGeo(s);
    geoRef.current = s;
    updateWalk(s);
    if (!started.current || props.preview) return;
    if (s.error === "denied") {
      setDenied("location");
      setPhase("denied");
      sendArEvent(props.token, { type: "permission_denied", which: "location", preview: props.preview });
      return;
    }
    const p = phaseRef.current;
    if (s.inside && (p === "outside")) {
      enterActive();
    } else if (!s.inside && p === "active") {
      stopStream(streamRef.current);
      streamRef.current = null;
      setStream(null);
      setPhase("outside");
    } else if (!s.inside && s.fix && p === "outside") {
      sendArEvent(props.token, { type: "outside", d: distanceBucket(s.distanceM), preview: props.preview });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.token, props.preview]);

  const enterActive = useCallback(async () => {
    if (!streamRef.current) {
      try {
        const s = await openCamera();
        streamRef.current = s;
        setStream(s);
      } catch {
        setPhase("paused");
        return;
      }
    }
    const g = geoRef.current;
    origin.current = g?.fix ? { lat: g.lat, lng: g.lng } : null;
    setWalk(null);
    setPhase("active");
    runHints(t.youAreHere);
    sendArEvent(props.token, { type: "activated", preview: props.preview });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.token, props.preview, t.youAreHere, t.tapHint]);

  // ---- Start: every permission is asked for inside this one tap ----
  const start = async () => {
    setPhase("requesting");
    // Sound has to be unlocked by a tap; this is the tap.
    if (!audio.current) audio.current = new BurnerAudio();
    audio.current.muted = muted;
    audio.current.unlock();
    const motionP = requestMotionPermission();
    const camP = openCamera().then((s) => ({ ok: true as const, s })).catch((e: unknown) => ({ ok: false as const, e }));
    if (!tracker.current && c) {
      tracker.current = new GeofenceTracker({ lat: c.lat, lng: c.lng, radiusM: c.radiusM }, onGeo);
      tracker.current.start();
    }
    const [motion, cam] = await Promise.all([motionP, camP]);
    if (motion === "denied") sendArEvent(props.token, { type: "permission_denied", which: "motion", preview: props.preview });
    if (!orientation.current) {
      orientation.current = new OrientationSource((s) => setHeadingSource(s));
      orientation.current.start();
    }
    if (!cam.ok) {
      setDenied("camera");
      setPhase("denied");
      sendArEvent(props.token, { type: "permission_denied", which: "camera", preview: props.preview });
      return;
    }
    streamRef.current = cam.s;
    setStream(cam.s);
    started.current = true;
    const g = geoRef.current;
    if (props.preview) {
      origin.current = g?.fix ? { lat: g.lat, lng: g.lng } : null;
      setPhase("active");
      runHints(t.tapHint);
      sendArEvent(props.token, { type: "activated", preview: true });
      return;
    }
    if (g?.inside) {
      origin.current = { lat: g.lat, lng: g.lng };
      setPhase("active");
      runHints(t.youAreHere);
      sendArEvent(props.token, { type: "activated", preview: false });
    } else {
      // The camera waits until they are at the spot.
      stopStream(cam.s);
      streamRef.current = null;
      setStream(null);
      setPhase("outside");
    }
  };

  const close = () => {
    stopStream(streamRef.current);
    streamRef.current = null;
    setStream(null);
    tracker.current?.stop();
    tracker.current = null;
    orientation.current?.stop();
    orientation.current = null;
    started.current = false;
    hintTimers.current.forEach(clearTimeout);
    setHint(null);
    setGeo(null);
    geoRef.current = null;
    origin.current = null;
    setWalk(null);
    setPhase("landing");
  };

  const toggleMute = () => setMuted((m) => {
    if (audio.current) audio.current.muted = !m;
    return !m;
  });

  const resume = async () => {
    try {
      const s = await openCamera();
      streamRef.current = s;
      setStream(s);
      setPhase("active");
    } catch {
      setDenied("camera");
      setPhase("denied");
    }
  };

  // ---- hidden tab: camera off, loop off ----
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      if (phaseRef.current === "active") {
        stopStream(streamRef.current);
        streamRef.current = null;
        setStream(null);
        setPhase("paused");
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  // ---- heading for the arrow and the debug line ----
  useEffect(() => {
    if (!props.debug && phase !== "outside") return;
    const id = setInterval(() => {
      setHeading(orientation.current?.heading ?? null);
      setFps(sceneApi.current?.fps() ?? 0);
    }, 500);
    return () => clearInterval(id);
  }, [phase, props.debug]);

  useEffect(() => () => {
    stopStream(streamRef.current);
    tracker.current?.stop();
    orientation.current?.stop();
    audio.current?.close();
    hintTimers.current.forEach(clearTimeout);
  }, []);

  // ---- the photo ----
  const takePhoto = async () => {
    const api = sceneApi.current;
    if (!api || !c || photoBusy) return;
    setPhotoBusy(true);
    try {
      const file = await composePhoto({
        video: api.video, glCanvas: api.canvas, renderNow: api.renderNow,
        brand: c.brand, tagline: c.tagline, site: SITE,
      });
      const url = URL.createObjectURL(file);
      setThumb(url);
      setTimeout(() => { setThumb(null); URL.revokeObjectURL(url); }, 2500);
      const how = await sharePhoto(file, c.brand);
      if (how !== "cancelled") {
        setToast(how === "shared" ? t.photoShare : t.photoSaved);
        setTimeout(() => setToast(null), 1800);
        sendArEvent(props.token, { type: "photo", preview: props.preview });
      }
    } catch {
      /* the share sheet refused, or the canvas could not be read: nothing to show */
    } finally {
      setPhotoBusy(false);
    }
  };

  // ---- pieces ----
  const ios = platformOf() === "ios";
  const mapsGoogle = c ? `https://maps.google.com/?q=${c.lat},${c.lng}` : "#";
  const mapsApple = c ? `https://maps.apple.com/?daddr=${c.lat},${c.lng}` : "#";
  const dateLong = (iso: string) => new Intl.DateTimeFormat(props.locale, { dateStyle: "long" }).format(new Date(iso));

  const header = (
    <header className={styles.bar}>
      <div className={styles.brand}>
        <img className={styles.logo} src="/logo.png" alt="" width={32} height={32} />
        <span>Alux Art</span>
      </div>
      <button type="button" className={styles.quiet} onClick={toggleTheme} aria-pressed={theme === "dark"}>
        {theme === "dark" ? props.themeLabels.light : props.themeLabels.dark}
      </button>
    </header>
  );

  const brandHead = c && (
    <>
      <img className={styles.brandLogo} src={c.logoUrl} alt="" />
      <h1 className={styles.title}>{fill(t.title, { brand: c.brand })}</h1>
      {props.preview && <span className={styles.previewBadge}>{t.preview}</span>}
    </>
  );

  const panel = (children: React.ReactNode) => (
    <main className={styles.main}>
      <section className={styles.panel}>{children}</section>
    </main>
  );

  let body: React.ReactNode;
  switch (phase) {
    case "notFound":
      body = panel(<><h1 className={styles.title}>Alux Art</h1><p className={`${styles.msg} ${styles.error}`}>{t.notFound}</p></>);
      break;
    case "ended":
      body = panel(<>{brandHead}<p className={`${styles.msg} ${styles.info}`}>{t.ended}</p></>);
      break;
    case "suspended":
      body = panel(<>{brandHead}<p className={`${styles.msg} ${styles.info}`}>{t.ended}</p></>);
      break;
    case "notStarted":
      body = panel(<>{brandHead}<p className={`${styles.msg} ${styles.info}`}>{fill(t.notStarted, { date: c ? dateLong(c.startsAt) : "" })}</p></>);
      break;
    case "insecure":
      body = panel(<>{brandHead}<p className={`${styles.msg} ${styles.error}`}>{t.insecure}</p></>);
      break;
    case "unsupported":
      body = panel(<>{brandHead}<p className={`${styles.msg} ${styles.error}`}>{t.unsupported}</p></>);
      break;
    case "desktop":
      body = panel(<>
        {brandHead}
        <p className={styles.intro}>{t.desktopTitle}</p>
        {here && <div className={styles.qr}><QRCodeSVG value={here} size={220} /></div>}
        <p className={styles.note}>{t.desktopHint}</p>
      </>);
      break;
    case "inApp": {
      const out = escapeUrl();
      body = panel(<>
        {brandHead}
        <p className={styles.intro}>{t.inAppTitle}</p>
        {out && <a className={styles.primary} href={out}>{t.inAppTitle}</a>}
        <p className={styles.note}>{t.inAppHint}</p>
      </>);
      break;
    }
    case "landing":
    case "requesting":
      body = panel(<>
        {brandHead}
        <p className={styles.intro}>{fill(t.intro, { brand: c?.brand ?? "" })}</p>
        <button type="button" className={styles.primary} onClick={start} disabled={phase === "requesting"}>
          {phase === "requesting" ? t.requesting : t.start}
        </button>
        <p className={styles.note}>{t.permissionsNote}</p>
      </>);
      break;
    case "denied":
      body = panel(<>
        {brandHead}
        <p className={`${styles.msg} ${styles.error}`}>{denied === "camera" ? t.cameraDenied : t.locationDenied}</p>
        <button type="button" className={styles.primary} onClick={start}>{t.tryAgain}</button>
        {denied === "location" && (
          <div className={styles.row}>
            <a className={styles.quiet} href={mapsGoogle} target="_blank" rel="noopener noreferrer">{t.openMaps}</a>
          </div>
        )}
      </>);
      break;
    case "outside": {
      const hasFix = !!geo?.fix && !geo.stale;
      const rel = geo && heading != null ? geo.bearingDeg - heading : null;
      body = panel(<>
        {brandHead}
        {hasFix && geo ? (
          <>
            <p className={styles.distance}>{fill(t.distanceAway, { distance: formatDistance(geo.distanceM, props.locale) })}</p>
            {rel != null ? (
              <div className={styles.arrowWrap}>
                <svg className={styles.arrow} viewBox="0 0 100 100" style={{ transform: `rotate(${rel}deg)` }} aria-hidden="true">
                  <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                  <path d="M50 12 L70 60 L50 50 L30 60 Z" fill="currentColor" />
                </svg>
              </div>
            ) : (
              <p className={styles.direction}>{fill(t.headTo, { direction: directions[compassIndex(geo.bearingDeg)] ?? "" })}</p>
            )}
            {geo.accuracyM > 30 && <p className={styles.note}>{fill(t.accuracyHint, { m: Math.round(geo.accuracyM) })}</p>}
          </>
        ) : (
          <p className={`${styles.msg} ${styles.info}`}>{t.searching}</p>
        )}
        <div className={styles.row}>
          <a className={styles.quiet} href={mapsGoogle} target="_blank" rel="noopener noreferrer">{t.openMaps}</a>
          {ios && <a className={styles.quiet} href={mapsApple}>Apple Maps</a>}
        </div>
        <button type="button" className={styles.quiet} onClick={close}>{t.close}</button>
      </>);
      break;
    }
    case "active":
    case "paused":
      body = c && (
        <>
          {orientation.current && (
            <ArScene
              stream={stream}
              orientation={orientation.current}
              audio={audio.current}
              walk={walk}
              onBurn={() => undefined}
              colors={c.colors}
              brand={c.brand}
              logoUrl={c.logoUrl}
              count={c.balloonCount}
              paused={phase === "paused"}
              onApi={(api) => { sceneApi.current = api; }}
            />
          )}
          <div className={styles.hud}>
            <div className={styles.hudTop}>
              <span className={styles.chip}><img className={styles.chipLogo} src={c.logoUrl} alt="" />{c.brand}{props.preview ? ` · ${t.preview}` : ""}</span>
              <div className={styles.hudBtns}>
                <button type="button" className={styles.sound} onClick={toggleMute} aria-pressed={muted} aria-label={muted ? t.soundOff : t.soundOn}>
                  {muted ? "🔇" : "🔊"}
                </button>
                <button type="button" className={styles.close} onClick={close} aria-label={t.close}>✕</button>
              </div>
            </div>
            <div className={styles.hudBottom}>
              {hint && phase === "active" && (
                <p className={styles.hint}>{headingSource === "drag" && hint === t.youAreHere ? t.dragHint : hint}</p>
              )}
              <button type="button" className={styles.shutter} onClick={takePhoto} disabled={photoBusy || phase !== "active"}>
                <span className={styles.shutterLabel}>{t.takePhoto}</span>
              </button>
            </div>
          </div>
          {toast && <div className={styles.toast} role="status">{toast}</div>}
          {thumb && <img className={styles.thumb} src={thumb} alt="" />}
          {phase === "paused" && <button type="button" className={styles.resume} onClick={resume}>{t.resume}</button>}
        </>
      );
      break;
  }

  const showHeader = phase !== "active" && phase !== "paused";

  return (
    <div className={styles.app} data-theme={theme} data-phase={phase} dir={props.dir}>
      {showHeader && header}
      {body}
      {props.debug && (
        <pre className={styles.debug}>{[
          `phase ${phase}${props.preview ? " (preview)" : ""}`,
          `dist ${geo?.fix ? Math.round(geo.distanceM) + " m ±" + Math.round(geo.accuracyM) : "no fix"} ${geo?.stale ? "stale" : ""} inside ${geo?.inside ?? "-"}${geo?.error ? " err " + geo.error : ""}`,
          `heading ${headingSource} ${heading == null ? "-" : Math.round(heading) + "°"}`,
          `fps ${fps} dpr ${typeof devicePixelRatio === "number" ? devicePixelRatio.toFixed(2) : "-"} balloons ${sceneApi.current?.balloons() ?? "-"} night ${sceneApi.current?.night() ?? "-"} walk ${walk ? Math.round(walk.east) + "," + Math.round(walk.north) : "-"}`,
          `video ${sceneApi.current?.video.videoWidth ?? 0}x${sceneApi.current?.video.videoHeight ?? 0} secure ${typeof window !== "undefined" ? window.isSecureContext : "-"}`,
        ].join("\n")}</pre>
      )}
    </div>
  );
}
