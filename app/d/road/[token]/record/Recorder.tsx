"use client";

import { useEffect, useRef, useState } from "react";
import styles from "@/app/d/race/demo/race.module.css";
import own from "./record.module.css";

/**
 * The in-app road camera. Drive or walk the road with the phone pointing
 * ahead; the video is recorded on the phone (MediaRecorder) while the GPS is
 * logged once a second, then uploaded in 8 MB parts and prepared on our
 * server. Nothing comes from Google: the road is the player's own footage.
 */

type Phase = "intro" | "camera" | "recording" | "review" | "uploading" | "done" | "error";
type Sample = [number, number, number, number]; // seconds, lat, lng, accuracy
const MAX_SECONDS = 180, MIN_SECONDS = 6;

export default function Recorder(props: {
  token: string;
  status: "live" | "scheduled" | "ended" | "suspended" | "notFound";
  brand: { name: string; logoUrl: string; colors: [string, string] } | null;
}) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [error, setError] = useState<string | null>(null);
  const [secs, setSecs] = useState(0);
  const [fixes, setFixes] = useState(0);
  const [acc, setAcc] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [recorder, setRecorder] = useState("");
  const [progress, setProgress] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");

  const live = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const blob = useRef<Blob | null>(null);
  const mime = useRef("");
  const samples = useRef<Sample[]>([]);
  const startedAt = useRef(0);
  const recording = useRef(false);
  const watchId = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const wake = useRef<{ release: () => Promise<void> } | null>(null);

  useEffect(() => {
    try { const n = localStorage.getItem("bounty-name"); if (n) setRecorder(n); } catch { /* private mode */ }
    return () => { stopEverything(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopEverything = () => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    if (watchId.current != null) { navigator.geolocation?.clearWatch(watchId.current); watchId.current = null; }
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void wake.current?.release().catch(() => undefined);
    wake.current = null;
  };

  /** Open the camera and start listening to the GPS (samples are kept only while recording). */
  const begin = async (face = facing) => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser cannot record video. Open the link in Chrome or Safari.");
      setPhase("error");
      return;
    }
    try {
      stream.current?.getTracks().forEach((t) => t.stop());
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: face }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: false,
      });
      stream.current = s;
      if (live.current) { live.current.srcObject = s; await live.current.play().catch(() => undefined); }
      if (navigator.geolocation && watchId.current == null) {
        watchId.current = navigator.geolocation.watchPosition(
          (p) => {
            setAcc(Math.round(p.coords.accuracy));
            if (recording.current) {
              samples.current.push([(Date.now() - startedAt.current) / 1000, p.coords.latitude, p.coords.longitude, p.coords.accuracy]);
              setFixes(samples.current.length);
            }
          },
          () => setAcc(null),
          { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
        );
      }
      setPhase("camera");
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      setError(name === "NotAllowedError" ? "The camera was refused. Allow the camera for this site and try again. If you opened this inside Instagram or WhatsApp, open it in Chrome or Safari instead." : "The camera could not start. Close other apps using it and try again.");
      setPhase("error");
    }
  };

  const flip = () => { const f = facing === "environment" ? "user" : "environment"; setFacing(f); void begin(f); };

  const pickMime = () => {
    const tries = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    for (const t of tries) if (MediaRecorder.isTypeSupported(t)) return t;
    return "";
  };

  const startRec = async () => {
    if (!stream.current) return;
    const m = pickMime();
    try {
      const r = new MediaRecorder(stream.current, m ? { mimeType: m, videoBitsPerSecond: 3_000_000 } : { videoBitsPerSecond: 3_000_000 });
      mime.current = r.mimeType || m || "video/webm";
      chunks.current = [];
      samples.current = [];
      setFixes(0);
      r.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.current.push(e.data); };
      r.onstop = () => {
        recording.current = false;
        const b = new Blob(chunks.current, { type: mime.current });
        blob.current = b;
        const url = URL.createObjectURL(b);
        setBlobUrl(url);
        stream.current?.getTracks().forEach((t) => t.stop());
        stream.current = null;
        void wake.current?.release().catch(() => undefined);
        wake.current = null;
        const dur = (Date.now() - startedAt.current) / 1000;
        if (dur < MIN_SECONDS) { setError(`That was only ${Math.round(dur)} seconds. Record at least ${MIN_SECONDS}.`); setPhase("review"); return; }
        setError(null);
        setPhase("review");
      };
      rec.current = r;
      startedAt.current = Date.now();
      recording.current = true;
      r.start(1000);
      setSecs(0);
      setPhase("recording");
      try { wake.current = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen") ?? null; } catch { wake.current = null; }
      timer.current = setInterval(() => {
        const s = Math.floor((Date.now() - startedAt.current) / 1000);
        setSecs(s);
        if (s >= MAX_SECONDS) stopRec();
      }, 250);
    } catch {
      setError("Recording could not start on this phone. Try Chrome or Safari.");
      setPhase("error");
    }
  };

  const stopRec = () => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    if (rec.current && rec.current.state !== "inactive") rec.current.stop();
  };

  const retake = () => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlobUrl(null);
    blob.current = null;
    setError(null);
    void begin();
  };

  /** Upload in parts (the server allows 32 MB a request), then close the upload with the GPS track. */
  const upload = async () => {
    const b = blob.current;
    if (!b) return;
    setPhase("uploading");
    setProgress(0);
    setError(null);
    try { localStorage.setItem("bounty-name", recorder); } catch { /* private mode */ }
    try {
      const c = await fetch(`/api/road/${props.token}/create`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, recorder, mime: b.type || mime.current, bytes: b.size }) });
      const cj = await c.json();
      if (!c.ok) throw new Error(cj.error || "The upload could not start.");
      const partBytes: number = cj.partBytes;
      const parts = Math.ceil(b.size / partBytes);
      for (let n = 0; n < parts; n++) {
        const slice = b.slice(n * partBytes, Math.min(b.size, (n + 1) * partBytes));
        let ok = false;
        for (let attempt = 0; attempt < 3 && !ok; attempt++) {
          const r = await fetch(`/api/road/${props.token}/part?id=${cj.id}&n=${n}`, { method: "PUT", body: slice, headers: { "Content-Type": "application/octet-stream" } }).catch(() => null);
          ok = !!r && r.ok;
          if (!ok) await new Promise((res) => setTimeout(res, 1500));
        }
        if (!ok) throw new Error(`Part ${n + 1} of ${parts} did not upload. Check your connection and try again.`);
        setProgress(Math.round(((n + 1) / parts) * 100));
      }
      const d = await fetch(`/api/road/${props.token}/done`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: cj.id, parts, track: samples.current }) });
      const dj = await d.json();
      if (!d.ok) throw new Error(dj.error || "The upload could not be closed.");
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The upload failed.");
      setPhase("review");
    }
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const huntUrl = `/d/race/${props.token}`;

  const panel = (inner: React.ReactNode) => <div className={styles.panelWrap}><div className={styles.panel}>{inner}</div></div>;
  const head = props.brand && (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={own.logo} src={props.brand.logoUrl} alt="" />
      <p className={styles.kicker}>Bounty Run · {props.brand.name}</p>
    </>
  );

  if (!props.brand || props.status === "notFound") {
    return <div className={styles.app} data-phase="notFound">{panel(<><p className={styles.kicker}>Bounty Run</p><p className={`${styles.msg} ${styles.error}`}>This bounty link is not valid.</p></>)}</div>;
  }
  if (props.status !== "live") {
    return <div className={styles.app} data-phase="closed">{panel(<>{head}<p className={`${styles.msg} ${styles.error}`}>{props.status === "scheduled" ? "This bounty has not started yet." : "This bounty is over."}</p></>)}</div>;
  }

  return (
    <div className={styles.app} data-phase={phase}>
      {(phase === "camera" || phase === "recording") && (
        <div className={own.cam}>
          <video ref={live} className={own.live} playsInline muted autoPlay />
          <div className={own.camTop}>
            <span className={`${own.pill} ${phase === "recording" ? own.rec : ""}`}>{phase === "recording" ? `● ${fmt(secs)}` : "Ready"}</span>
            <span className={own.pill}>{acc == null ? "GPS: searching…" : `GPS ±${acc} m · ${fixes} fixes`}</span>
          </div>
          <p className={own.hint}>{phase === "recording" ? "Keep the phone steady and pointing straight down the road. Tap the square to stop." : "Point the phone straight down the road, hold it level, then tap the red button to start. Up to 3 minutes."}</p>
          <div className={own.camBottom}>
            <button type="button" className={styles.quiet} onClick={() => { stopEverything(); setPhase("intro"); }} disabled={phase === "recording"}>Back</button>
            {phase === "recording"
              ? <button type="button" className={`${own.shutter} ${own.stop}`} onClick={stopRec} aria-label="Stop recording"><span /></button>
              : <button type="button" className={own.shutter} onClick={startRec} aria-label="Start recording" />}
            <button type="button" className={styles.quiet} onClick={flip} disabled={phase === "recording"}>Flip</button>
          </div>
        </div>
      )}

      {phase === "intro" && panel(
        <>
          {head}
          <h1 className={styles.title}>Record your road</h1>
          <p className={styles.note}>Film the road you want everyone to race on. Drive or walk it with the phone pointing straight ahead, from where the race should start to where it should end. Six seconds to three minutes. The road is prepared on our server in a minute or two and then appears on the hunt page for everyone.</p>
          <p className={styles.note}>The camera and your location are used on this phone only while you record; the video and the route are then uploaded to the game.</p>
          <input className={own.name} value={recorder} maxLength={24} placeholder="Your name (shown with the road)" onChange={(e) => setRecorder(e.target.value)} />
          <button type="button" className={styles.primary} onClick={() => begin()}>Open the camera</button>
          <a className={styles.quiet} href={huntUrl}>Back to the hunt</a>
        </>,
      )}

      {phase === "review" && panel(
        <>
          {head}
          <h1 className={styles.title}>Your road</h1>
          {blobUrl && <video className={own.preview} src={blobUrl} controls playsInline muted />}
          <p className={styles.note}>{fmt(secs)} long · {fixes} GPS fixes{fixes < 3 ? " (no route was captured; the game will still play, with an estimated length)" : ""}</p>
          <input className={own.name} value={name} maxLength={60} placeholder="Name this road, e.g. 441 Road to the roundabout" onChange={(e) => setName(e.target.value)} />
          {error && <p className={`${styles.msg} ${styles.error}`}>{error}</p>}
          <button type="button" className={styles.primary} onClick={upload} disabled={secs < MIN_SECONDS}>Use this road</button>
          <button type="button" className={styles.quiet} onClick={retake}>Record again</button>
        </>,
      )}

      {phase === "uploading" && panel(
        <>
          {head}
          <h1 className={styles.title}>Uploading…</h1>
          <div className={own.bar}><div style={{ width: `${progress}%` }} /></div>
          <p className={styles.note}>{progress}% · keep this page open until it finishes.</p>
        </>,
      )}

      {phase === "done" && panel(
        <>
          {head}
          <h1 className={styles.title}>Road received</h1>
          <p className={styles.msg}>We are preparing it now. It appears on the hunt page in a minute or two, named “{name || "A road"}”.</p>
          <a className={styles.primary} href={huntUrl}>Go to the hunt</a>
          <button type="button" className={styles.quiet} onClick={() => { setName(""); setPhase("intro"); }}>Record another road</button>
        </>,
      )}

      {phase === "error" && panel(
        <>
          {head}
          <p className={`${styles.msg} ${styles.error}`}>{error}</p>
          <button type="button" className={styles.primary} onClick={() => begin()}>Try again</button>
          <a className={styles.quiet} href={huntUrl}>Back to the hunt</a>
        </>,
      )}
    </div>
  );
}
