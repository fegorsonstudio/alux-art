"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import styles from "./collage-editor.module.css";

export interface CollageImage {
  id: string;
  url: string;
}

interface Props {
  templateId: string;
  images: CollageImage[];
  onSave: (storagePath: string, previewUrl: string) => void;
  onClose: () => void;
}

type FrameStyle = "polaroid" | "rounded" | "plain";
type ShadowLevel = "none" | "soft" | "medium" | "heavy";

const W = 900;
const H = 1200;

function proxyUrl(url: string) {
  if (url.startsWith("blob:") || url.startsWith("data:") || url.startsWith("/")) return url;
  return `/api/proxy?url=${encodeURIComponent(url)}`;
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = proxyUrl(src);
  });
}

function cover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number, y: number, w: number, h: number,
) {
  const ar = img.naturalWidth / img.naturalHeight;
  const ba = w / h;
  let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
  if (ar > ba) { sw = sh * ba; sx = (img.naturalWidth - sw) / 2; }
  else { sh = sw / ba; sy = (img.naturalHeight - sh) / 2; }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const SHADOWS: Record<ShadowLevel, [number, number, number, string]> = {
  none:   [0,  0,  0,  "transparent"],
  soft:   [18, 3,  6,  "rgba(0,0,0,0.26)"],
  medium: [28, 5,  9,  "rgba(0,0,0,0.38)"],
  heavy:  [40, 8,  14, "rgba(0,0,0,0.52)"],
};

function setShadow(ctx: CanvasRenderingContext2D, level: ShadowLevel) {
  const [b, ox, oy, c] = SHADOWS[level];
  ctx.shadowBlur = b; ctx.shadowOffsetX = ox; ctx.shadowOffsetY = oy; ctx.shadowColor = c;
}
function clearShadow(ctx: CanvasRenderingContext2D) {
  ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; ctx.shadowColor = "transparent";
}

function render(
  canvas: HTMLCanvasElement,
  hero: HTMLImageElement | null,
  tiles: (HTMLImageElement | undefined)[],
  frame: FrameStyle,
  shadow: ShadowLevel,
  gradient: boolean,
) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = "#ede9e3";
  ctx.fillRect(0, 0, W, H);

  // Hero fills canvas
  if (hero) cover(ctx, hero, 0, 0, W, H);

  // Gradient vignette so tiles read against any background
  if (gradient) {
    const g = ctx.createLinearGradient(0, H * 0.48, 0, H);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.38)");
    ctx.fillStyle = g;
    ctx.fillRect(0, H * 0.48, W, H * 0.52);
  }

  const n = Math.max(2, Math.min(4, tiles.length));
  if (n === 0) return;

  const outerPad = 18;
  const gap = 12;
  const tileW = Math.floor((W - outerPad * 2 - gap * (n - 1)) / n);
  const tileH = Math.round(tileW * 1.48);

  // Frame geometry
  const fSide = frame === "plain" ? 0 : Math.round(tileW * 0.044);
  const fBot = frame === "polaroid" ? Math.round(tileW * 0.148) : fSide;
  const radius = frame === "rounded" ? Math.round(tileW * 0.068) : (frame === "polaroid" ? 3 : 0);

  // Position tiles: bottom-aligned with a small margin
  const tileY = Math.max(Math.round(H * 0.63), H - tileH - 20);

  for (let i = 0; i < n; i++) {
    const fx = outerPad + i * (tileW + gap);
    const fy = tileY;
    ctx.save();

    if (frame !== "plain") {
      // White backing card with shadow
      setShadow(ctx, shadow);
      ctx.fillStyle = "#ffffff";
      if (radius > 0) { rrect(ctx, fx, fy, tileW, tileH, radius); ctx.fill(); }
      else ctx.fillRect(fx, fy, tileW, tileH);
      clearShadow(ctx);

      // Image inside frame
      const ix = fx + fSide, iy = fy + fSide;
      const iw = tileW - fSide * 2, ih = tileH - fSide - fBot;

      if (tiles[i]) {
        if (radius > 0) {
          ctx.save();
          rrect(ctx, ix, iy, iw, ih, Math.max(0, radius - fSide));
          ctx.clip();
          cover(ctx, tiles[i]!, ix, iy, iw, ih);
          ctx.restore();
        } else {
          cover(ctx, tiles[i]!, ix, iy, iw, ih);
        }
      }
    } else {
      // Plain: shadow directly on image edges
      setShadow(ctx, shadow);
      if (tiles[i]) cover(ctx, tiles[i]!, fx, fy, tileW, tileH);
      else { ctx.fillStyle = "#ccc"; ctx.fillRect(fx, fy, tileW, tileH); }
      clearShadow(ctx);
    }
    ctx.restore();
  }
}

export default function CollageEditor({ templateId, images, onSave, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState<Map<string, HTMLImageElement>>(new Map());
  const [heroId, setHeroId] = useState(images[0]?.id ?? "");
  const [tileIds, setTileIds] = useState<string[]>(images.slice(1, 5).map(i => i.id));
  const [frame, setFrame] = useState<FrameStyle>("polaroid");
  const [shadow, setShadow_] = useState<ShadowLevel>("soft");
  const [gradient, setGradient] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    const map = new Map<string, HTMLImageElement>();
    Promise.all(
      images.map(img => loadImg(img.url).then(el => { map.set(img.id, el); }).catch(() => {}))
    ).then(() => { if (alive) setLoaded(new Map(map)); });
    return () => { alive = false; };
  }, [images]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    render(canvas, loaded.get(heroId) ?? null, tileIds.map(id => loaded.get(id)), frame, shadow, gradient);
  }, [heroId, tileIds, frame, shadow, gradient, loaded]);

  const toggleTile = (id: string) => {
    if (id === heroId) return;
    setTileIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id)
        : prev.length >= 4 ? [...prev.slice(1), id] : [...prev, id]
    );
  };

  const handleSave = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true); setErr("");
    let blob: Blob | null = null;
    try { blob = await new Promise<Blob | null>(r => canvas.toBlob(r, "image/jpeg", 0.93)); }
    catch { setErr("Export failed — image CORS issue. Try a different browser."); setSaving(false); return; }
    if (!blob) { setErr("Export failed"); setSaving(false); return; }

    const presign = await fetch("/api/upload/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: "cover-collage.jpg", contentType: "image/jpeg", size: blob.size, bucket: "template-images" }),
    });
    if (!presign.ok) { setErr("Upload failed"); setSaving(false); return; }
    const { uploadUrl, storagePath } = await presign.json();

    const put = await fetch(uploadUrl, { method: "PUT", body: blob, headers: { "Content-Type": "image/jpeg" } });
    if (!put.ok) { setErr("Upload failed"); setSaving(false); return; }

    const patch = await fetch(`/api/templates/${templateId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coverStoragePath: storagePath }),
    });
    if (!patch.ok) { setErr("Failed to update cover"); setSaving(false); return; }

    onSave(storagePath, URL.createObjectURL(blob));
  }, [templateId, onSave]);

  const FRAMES: FrameStyle[] = ["polaroid", "rounded", "plain"];
  const SHADOWS: ShadowLevel[] = ["none", "soft", "medium", "heavy"];

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>Collage Cover Editor</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          <div className={styles.preview}>
            <canvas
              ref={canvasRef}
              width={W}
              height={H}
              className={styles.canvas}
            />
            <p className={styles.canvasHint}>900 × 1200 export</p>
          </div>

          <div className={styles.controls}>
            <div className={styles.group}>
              <span className={styles.groupLabel}>Hero image <span className={styles.groupNote}>fills the background</span></span>
              <div className={styles.thumbRow}>
                {images.map(img => (
                  <button key={img.id} type="button"
                    className={`${styles.thumb} ${heroId === img.id ? styles.thumbHero : ""}`}
                    onClick={() => setHeroId(img.id)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt="" className={styles.thumbImg} />
                    {heroId === img.id && <span className={styles.badge}>Hero</span>}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.group}>
              <span className={styles.groupLabel}>Tiles <span className={styles.groupNote}>pick 2 – 4 photos</span></span>
              <div className={styles.thumbRow}>
                {images.filter(img => img.id !== heroId).map(img => (
                  <button key={img.id} type="button"
                    className={`${styles.thumb} ${tileIds.includes(img.id) ? styles.thumbSelected : ""}`}
                    onClick={() => toggleTile(img.id)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt="" className={styles.thumbImg} />
                    {tileIds.includes(img.id) && (
                      <span className={styles.tileNum}>{tileIds.indexOf(img.id) + 1}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.group}>
              <span className={styles.groupLabel}>Frame style</span>
              <div className={styles.pills}>
                {FRAMES.map(f => (
                  <button key={f} type="button"
                    className={`${styles.pill} ${frame === f ? styles.pillActive : ""}`}
                    onClick={() => setFrame(f)}
                  >{f.charAt(0).toUpperCase() + f.slice(1)}</button>
                ))}
              </div>
            </div>

            <div className={styles.group}>
              <span className={styles.groupLabel}>Shadow</span>
              <div className={styles.pills}>
                {SHADOWS.map(s => (
                  <button key={s} type="button"
                    className={`${styles.pill} ${shadow === s ? styles.pillActive : ""}`}
                    onClick={() => setShadow_(s)}
                  >{s.charAt(0).toUpperCase() + s.slice(1)}</button>
                ))}
              </div>
            </div>

            <div className={styles.group}>
              <span className={styles.groupLabel}>Gradient overlay <span className={styles.groupNote}>darkens lower half for contrast</span></span>
              <div className={styles.pills}>
                <button type="button" className={`${styles.pill} ${gradient ? styles.pillActive : ""}`} onClick={() => setGradient(true)}>On</button>
                <button type="button" className={`${styles.pill} ${!gradient ? styles.pillActive : ""}`} onClick={() => setGradient(false)}>Off</button>
              </div>
            </div>

            {err && <p className={styles.error}>{err}</p>}
          </div>
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            type="button"
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={saving || tileIds.length < 2}
          >{saving ? "Saving..." : "Save as Cover"}</button>
        </div>
      </div>
    </div>
  );
}
