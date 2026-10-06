"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import cs from "./carousel.module.css";

/**
 * "How to use" — a walk through the studio for someone opening it for the
 * first time. Each step dims the page and lights up one part of it with a
 * short note beside it. It runs once on a first visit, and the "How to use"
 * button in the top bar plays it again whenever it's wanted.
 *
 * Steps point at elements by their data-tour name; a step whose element is
 * not on the page (on a phone, before a post is open) is skipped.
 */

export type TourStep = { target: string; title: string; body: string };

export const TOUR_STEPS: TourStep[] = [
  { target: "list", title: "Your posts, in posting order",
    body: "Season 1 first, then Season 2. One post goes out at 7pm on Monday, Wednesday, Friday and Sunday. The coloured label says what each post is waiting for." },
  { target: "tabs", title: "What needs doing",
    body: "To do shows posts still waiting for photos, pictures or approval. Approved, Scheduled and Posted show the rest." },
  { target: "search", title: "Find any post",
    body: "Type S1, S2 story 3, a title, or a word like christmas." },
  { target: "photos", title: "1 · Add the before and after",
    body: "Drop the two photos here, or click a box to choose them. The before becomes slide 1, the after slide 2." },
  { target: "story", title: "2 · Make the story pictures",
    body: "Press Copy prompt, paste it into Google Flow, make the picture, then drop it on the same box. Attach the faces it lists so everyone looks the same in every picture." },
  { target: "cards", title: "3 · Check the words",
    body: "Change any line you like, then press Save. Changing a post you already approved sends it back to Draft." },
  { target: "when", title: "4 · Check the date and time",
    body: "Each post already has its day. Change it here if you need to — it's Lagos time." },
  { target: "actions", title: "5 · Preview, approve, schedule",
    body: "Preview draws every slide. Read them, press Approve, then Schedule. Nothing goes to Instagram until you do both. Unschedule takes it back any time before it posts." },
  { target: "download", title: "Download the slides",
    body: "Gets a zip with every slide as a JPEG, the caption and the story GIF — for posting by hand or sharing." },
  { target: "gif", title: "The story GIF",
    body: "Four short lines become a GIF for Instagram comments. Upload to GIPHY only after ticking that everyone in the photos agreed." },
  { target: "help", title: "That's it",
    body: "Press How to use whenever you want this tour again." },
];

const SEEN_KEY = "carousel-tour-seen";

/** True the first time this browser opens the studio. */
export function tourNotSeen(): boolean {
  try { return localStorage.getItem(SEEN_KEY) !== "1"; } catch { return false; }
}

type Box = { top: number; left: number; width: number; height: number };

export default function Tour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const steps = TOUR_STEPS;
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);

  const find = useCallback((i: number) => {
    const el = document.querySelector<HTMLElement>(`[data-tour="${steps[i]?.target}"]`);
    return el && el.offsetParent !== null ? el : null;
  }, [steps]);

  /** The next step (in `dir`) whose element is actually on the page. */
  const move = useCallback((from: number, dir: 1 | -1) => {
    for (let i = from; i >= 0 && i < steps.length; i += dir) if (find(i)) return i;
    return -1;
  }, [find, steps.length]);

  const finish = useCallback(() => {
    try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* fine */ }
    onClose();
  }, [onClose]);

  useEffect(() => { if (open) setIndex(Math.max(0, move(0, 1))); }, [open, move]);

  // Follow the lit element as the page scrolls or resizes.
  useLayoutEffect(() => {
    if (!open) return;
    const el = find(index);
    if (!el) { setBox(null); return; }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBox({ top: r.top - 8, left: r.left - 8, width: r.width + 16, height: r.height + 16 });
    };
    measure();
    const t = window.setTimeout(measure, 400);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
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
  const total = steps.filter((_s, i) => find(i)).length;
  const position = steps.slice(0, index + 1).filter((_s, i) => find(i)).length;

  // The note goes under the lit part, else above it, else beside it, else
  // over its top corner — wherever it fits whole on the screen.
  const W = 320, H = 230, vw = window.innerWidth, vh = window.innerHeight;
  const clampX = (x: number) => Math.min(Math.max(12, x), vw - W - 12);
  const clampY = (y: number) => Math.min(Math.max(12, y), vh - H - 12);
  let noteTop: number, noteLeft: number;
  if (box.top + box.height + 12 + H < vh) { noteTop = box.top + box.height + 12; noteLeft = clampX(box.left); }
  else if (box.top - 12 - H > 0) { noteTop = box.top - 12 - H; noteLeft = clampX(box.left); }
  else if (box.left + box.width + 12 + W < vw) { noteTop = clampY(box.top); noteLeft = box.left + box.width + 12; }
  else if (box.left - 12 - W > 0) { noteTop = clampY(box.top); noteLeft = box.left - 12 - W; }
  else { noteTop = clampY(box.top + 12); noteLeft = clampX(box.left + 12); }

  return (
    <div className={cs.tour} role="dialog" aria-modal="true" aria-label="How to use the Carousel Studio">
      <div className={cs.tourHole} style={{ top: box.top, left: box.left, width: box.width, height: box.height }} />
      <div
        className={cs.tourNote}
        style={{ top: noteTop, left: noteLeft }}
      >
        <span className={cs.tourCount}>{position} of {total}</span>
        <h3 className={cs.tourTitle}>{step.title}</h3>
        <p className={cs.tourBody}>{step.body}</p>
        <div className={cs.btns}>
          {prev >= 0 && <button type="button" className={`${cs.btn} ${cs.btnGhost} ${cs.btnSmall}`} onClick={() => setIndex(prev)}>Back</button>}
          {next >= 0
            ? <button type="button" className={`${cs.btn} ${cs.btnSmall}`} onClick={() => setIndex(next)} autoFocus>Next</button>
            : <button type="button" className={`${cs.btn} ${cs.btnSmall}`} onClick={finish} autoFocus>Done</button>}
          {next >= 0 && <button type="button" className={cs.tourSkip} onClick={finish}>Skip the tour</button>}
        </div>
      </div>
    </div>
  );
}
