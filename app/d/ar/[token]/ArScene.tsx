"use client";

import { useEffect, useRef } from "react";
import { BalloonScene } from "@/lib/ar/scene";
import type { OrientationSource } from "@/lib/ar/orientation";
import styles from "./ar.module.css";

/**
 * The camera feed with the balloons drawn over it. Loaded only once the
 * viewer is active, so three.js never slows the first screen down.
 */
export type SceneApi = {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  renderNow: () => void;
  fps: () => number;
  balloons: () => number;
};

export default function ArScene(props: {
  stream: MediaStream | null;
  orientation: OrientationSource;
  colors: [string, string];
  brand: string;
  logoUrl: string | null;
  count: number;
  paused: boolean;
  onApi: (api: SceneApi | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<BalloonScene | null>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);

  // The stream into the <video>. Re-run when the stream is replaced after a pause.
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
    });
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
    });
    return () => {
      props.onApi(null);
      ro.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
    // Colours, brand and logo never change while the page is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    if (props.paused) s.stop(); else s.start();
  }, [props.paused]);

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    props.orientation.drag(e.clientX - d.x, e.clientY - d.y);
    d.x = e.clientX; d.y = e.clientY;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };

  return (
    <div className={styles.stage} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      <video ref={videoRef} className={styles.video} playsInline muted autoPlay />
      <canvas ref={canvasRef} className={styles.gl} />
    </div>
  );
}
