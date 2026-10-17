/**
 * The "take a photo" button: the camera frame plus the balloons plus a brand
 * strip, as one JPEG the phone can share or save.
 */

export function composePhoto(opts: {
  video: HTMLVideoElement;
  glCanvas: HTMLCanvasElement;
  renderNow: () => void;
  brand: string;
  tagline: string;
  site: string;
}): Promise<File> {
  const { video, glCanvas } = opts;
  const cw = glCanvas.clientWidth || video.clientWidth, ch = glCanvas.clientHeight || video.clientHeight;
  let scale = Math.min(window.devicePixelRatio || 1, 2);
  if (Math.max(cw, ch) * scale > 1600) scale = 1600 / Math.max(cw, ch);
  const W = Math.round(cw * scale), H = Math.round(ch * scale);

  const out = document.createElement("canvas");
  out.width = W; out.height = H;
  const ctx = out.getContext("2d")!;

  // The video is shown with object-fit: cover; draw the same crop.
  const vw = video.videoWidth || cw, vh = video.videoHeight || ch;
  const s = Math.max(W / vw, H / vh);
  ctx.drawImage(video, (W - vw * s) / 2, (H - vh * s) / 2, vw * s, vh * s);

  // Render and copy in the same task, so the GL buffer is still there.
  opts.renderNow();
  ctx.drawImage(glCanvas, 0, 0, W, H);

  const strip = Math.round(H * 0.11);
  const g = ctx.createLinearGradient(0, H - strip, 0, H);
  g.addColorStop(0, "rgba(10,20,24,0)");
  g.addColorStop(0.35, "rgba(10,20,24,0.72)");
  g.addColorStop(1, "rgba(10,20,24,0.9)");
  ctx.fillStyle = g;
  ctx.fillRect(0, H - strip, W, strip);

  const font = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
  const pad = Math.round(W * 0.045);
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${Math.round(strip * 0.34)}px ${font}`;
  ctx.fillText(opts.brand, pad, H - strip * 0.42, W * 0.7);
  if (opts.tagline) {
    ctx.font = `400 ${Math.round(strip * 0.22)}px ${font}`;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(opts.tagline, pad, H - strip * 0.14, W * 0.7);
  }
  ctx.textAlign = "right";
  ctx.font = `600 ${Math.round(strip * 0.18)}px ${font}`;
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText(opts.site, W - pad, H - strip * 0.16);

  const name = `${opts.brand.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "balloons"}-balloons.jpg`;
  return new Promise((resolve, reject) => {
    out.toBlob((blob) => blob ? resolve(new File([blob], name, { type: "image/jpeg" })) : reject(new Error("toBlob failed")), "image/jpeg", 0.9);
  });
}

/** Share sheet where the phone has one, otherwise a download. Returns what happened. */
export async function sharePhoto(file: File, title: string): Promise<"shared" | "saved" | "cancelled"> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.share === "function" && typeof nav.canShare === "function" && nav.canShare({ files: [file] })) {
    try { await nav.share({ files: [file], title }); return "shared"; }
    catch (e) { if ((e as { name?: string })?.name === "AbortError") return "cancelled"; }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url; a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "saved";
}
