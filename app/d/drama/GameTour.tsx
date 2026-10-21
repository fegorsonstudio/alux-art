"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import styles from "./drama.module.css";

/**
 * The game's mini tutorial: on a first visit it dims the page and lights up
 * one part at a time with a short note, so a newcomer understands the game at
 * once instead of working it out. "How it works" in the top bar plays it again.
 * Steps point at elements by their data-tour name; a step whose element is not
 * on the page is skipped. (The same idea as /admin/carousel's tour, in the game's look.)
 */

export type TourStep = { target: string; title: string; body: string };

type Box = { top: number; left: number; width: number; height: number };

export default function GameTour({ steps, seenKey, open, onClose }: { steps: TourStep[]; seenKey: string; open: boolean; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);

  const find = useCallback((i: number) => {
    const el = document.querySelector<HTMLElement>(`[data-tour="${steps[i]?.target}"]`);
    return el && el.offsetParent !== null ? el : null;
  }, [steps]);

  const move = useCallback((from: number, dir: 1 | -1) => {
    for (let i = from; i >= 0 && i < steps.length; i += dir) if (find(i)) return i;
    return -1;
  }, [find, steps.length]);

  const finish = useCallback(() => {
    try { localStorage.setItem(seenKey, "1"); } catch { /* private mode */ }
    onClose();
  }, [onClose, seenKey]);

  useEffect(() => { if (open) setIndex(Math.max(0, move(0, 1))); }, [open, move]);

  useLayoutEffect(() => {
    if (!open) return;
    const el = find(index);
    if (!el) { setBox(null); return; }
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBox({ top: r.top - 8, left: r.left - 8, width: r.width + 16, height: r.height + 16 });
    };
    measure();
    const t = window.setTimeout(measure, 450);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { window.clearTimeout(t); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [open, index, find]);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") finish(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, finish]);

  if (!open || !box) return null;
  const step = steps[index];
  const next = move(index + 1, 1);
  const prev = move(index - 1, -1);
  const shown = steps.map((_s, i) => i).filter((i) => find(i));
  const position = shown.indexOf(index) + 1;

  // The note goes under the lit part, else above it, else over its top: wherever it fits whole on screen.
  const vw = window.innerWidth, vh = window.innerHeight;
  const W = Math.min(330, vw - 24), H = 220;
  const clampX = (x: number) => Math.min(Math.max(12, x), vw - W - 12);
  const clampY = (y: number) => Math.min(Math.max(12, y), vh - H - 12);
  let top: number;
  if (box.top + box.height + 12 + H < vh) top = box.top + box.height + 12;
  else if (box.top - 12 - H > 0) top = box.top - 12 - H;
  else top = clampY(box.top + 12);
  const left = clampX(box.left);

  return (
    <div className={styles.tour} role="dialog" aria-modal="true" aria-label="How Alux Micro Drama works">
      <div className={styles.tourHole} style={{ top: box.top, left: box.left, width: box.width, height: box.height }} />
      <div className={styles.tourNote} style={{ top, left, width: W }}>
        <span className={styles.tourCount}>{position} of {shown.length}</span>
        <h3 className={styles.tourTitle}>{step.title}</h3>
        <p className={styles.tourBody}>{step.body}</p>
        <div className={styles.tourBtns}>
          {prev >= 0 && <button type="button" className={`${styles.btn} ${styles.quiet} ${styles.small}`} onClick={() => setIndex(prev)}>Back</button>}
          {next >= 0
            ? <button type="button" className={`${styles.btn} ${styles.primary} ${styles.small}`} onClick={() => setIndex(next)} autoFocus>Next</button>
            : <button type="button" className={`${styles.btn} ${styles.primary} ${styles.small}`} onClick={finish} autoFocus>Start playing</button>}
          {next >= 0 && <button type="button" className={styles.tourSkip} onClick={finish}>Skip</button>}
        </div>
      </div>
    </div>
  );
}
