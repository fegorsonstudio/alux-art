"use client";

import { useEffect, useRef } from "react";
import { BalloonScene } from "@/lib/ar/scene";
import type { OrientationSource } from "@/lib/ar/orientation";
import type { BurnerAudio } from "@/lib/ar/audio";
import styles from "./ar.module.css";

/**
 * The camera feed with the balloons drawn over it. Loaded only once the
 * viewer is active, so three.js never slows the first screen down.
 *
 * A finger that moves looks around; a finger that taps fires the burner of
 * the balloon under it.
 */
export type SceneApi = {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  renderNow: () => void;
  fps: () => number;
  balloons: () => number;
  night: () => boolean;
};

export default function ArScene(props: {
  stream: MediaStream | null;
  orientation: OrientationSource;
  audio: BurnerAudio | null;
  colors: [string, string];
  brand: string;
  logoUrl: string | null;
  count: number;
  paused: boolean;
  /** Metres walked east/north since the camera opened. */
  walk: { east: number; north: number } | null;
  onBurn: () => void;
  onApi: (api: SceneApi | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<BalloonScene | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; x0: number; y0: number; t0: number; moved: boolean } | null>(null);
  const onBurn = useRef(props.onBurn);
  onBurn.current = props.onBurn;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.srcObject = props.stream;
    if (props.stream) v.play().catch(() => undefined);
  }, [props.stream]);

  useEffect(() => {
    const canvas = canvasRef.current, video = videoRef.current;
    if (!canvas || !video) return;
    const scene = new BalloonScene(canvas, {
      colorA: props.colors[0], colorB: props.colors[1], brand: props.brand, logoUrl: props.logoUrl, count: props.count,
      audio: props.audio, onBurn: () => onBurn.current(),
    });
    scene.attachVideo(video);
    sceneRef.current = scene;
    const orientation = props.orientation;
    scene.onTick = (dt) => { orientation.tick(dt); scene.targetQuat.copy(orientation.target); };
    const ro = new ResizeObserver(() => scene.resize());
    ro.observe(canvas);
    scene.start();
    props.onApi({
      video, canvas,
      renderNow: () => scene.renderNow(),
      fps: () => scene.fps,
      balloons: () => scene.balloonCount,
      night: () => scene.isNight,
    });
    return () => {
      props.onApi(null);
      ro.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
    // Colours, brand, logo and audio never change while the page is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    if (props.paused) s.stop(); else s.start();
  }, [props.paused]);

  useEffect(() => {
    if (props.walk) sceneRef.current?.setViewerOffset(props.walk.east, props.walk.north);
  }, [props.walk]);

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 8) d.moved = true;
    if (d.moved) props.orientation.drag(e.clientX - d.x, e.clientY - d.y);
    d.x = e.clientX; d.y = e.clientY;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moved && performance.now() - d.t0 < 450) {
      const hit = sceneRef.current?.tap(e.clientX, e.clientY);
      if (hit) { try { navigator.vibrate?.(25); } catch { /* no haptics */ } }
    }
  };

  return (
    <div className={styles.stage} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      <video ref={videoRef} className={styles.video} playsInline muted autoPlay />
      <canvas ref={canvasRef} className={styles.gl} />
    </div>
  );
}
