"use client";

import { useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";

/**
 * A campaign's QR code with a PNG download. The QR is drawn by qrcode.react
 * into a canvas; the download copies that canvas onto a padded white square,
 * which never taints (same trick as TemplateShareCard).
 */
export default function ArQr(props: { url: string; fileName: string; label: string; size?: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const shown = props.size ?? 160;

  const download = () => {
    const src = wrap.current?.querySelector("canvas") as HTMLCanvasElement | null;
    if (!src || busy) return;
    setBusy(true);
    try {
      const out = document.createElement("canvas");
      out.width = 640; out.height = 640;
      const ctx = out.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 640, 640);
      ctx.drawImage(src, 64, 64, 512, 512);
      out.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url; a.download = props.fileName;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 5000);
        }
        setBusy(false);
      }, "image/png");
    } catch { setBusy(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
      <div ref={wrap} style={{ padding: 10, background: "#fff", borderRadius: 10, lineHeight: 0 }}>
        <QRCodeCanvas value={props.url} size={512} fgColor="#263235" bgColor="#ffffff" style={{ width: shown, height: shown }} />
      </div>
      <button type="button" onClick={download} disabled={busy}
        style={{ font: "inherit", fontSize: "0.8rem", fontWeight: 700, padding: "7px 12px", borderRadius: 8, cursor: "pointer",
          border: "1px solid rgba(67,159,169,0.35)", background: "rgba(255,255,255,0.7)", color: "inherit" }}>
        {props.label}
      </button>
    </div>
  );
}
