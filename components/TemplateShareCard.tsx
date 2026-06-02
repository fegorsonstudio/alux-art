"use client";

import { useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

interface Props {
  templateUrl: string;
  creatorUsername: string;
  coverUrl: string | null;
  onClose: () => void;
}

// Capture a DOM element as a PNG Blob using SVG foreignObject → Canvas.
// No external libraries, no network requests — resolves synchronously after
// the image loads from a local blob: URL Chrome creates in-process.
async function captureAsPng(el: HTMLElement): Promise<Blob> {
  const { width, height } = el.getBoundingClientRect();
  const scale = 2;
  const W = Math.round(width * scale);
  const H = Math.round(height * scale);

  const clone = el.cloneNode(true) as HTMLElement;
  // Remove any <image> / <img> nodes — Chrome blocks cross-origin resources
  // inside SVG foreignObject, and we don't need them for this card.
  clone.querySelectorAll("image, img").forEach(n => n.remove());

  // Serialize the cloned HTML into an SVG with a foreignObject wrapper.
  const xml = new XMLSerializer().serializeToString(
    (() => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      svg.setAttribute("width", String(W));
      svg.setAttribute("height", String(H));

      const fo = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
      fo.setAttribute("width", String(W));
      fo.setAttribute("height", String(H));

      const wrapper = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
      wrapper.setAttribute(
        "style",
        `transform:scale(${scale});transform-origin:top left;` +
          `width:${width}px;height:${height}px;overflow:hidden;`
      );
      wrapper.appendChild(clone);
      fo.appendChild(wrapper);
      svg.appendChild(fo);
      return svg;
    })()
  );

  const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("SVG render failed"));
      i.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    canvas.getContext("2d")!.drawImage(img, 0, 0);

    return new Promise<Blob>((res, rej) =>
      canvas.toBlob(b => (b ? res(b) : rej(new Error("PNG encode failed"))), "image/png")
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function TemplateShareCard({ templateUrl, creatorUsername, coverUrl, onClose }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const handle = "@" + creatorUsername.toUpperCase().replace(/\s+/g, "_");

  const handleDownload = async () => {
    if (typeof window === "undefined" || !cardRef.current) return;
    setDownloading(true);
    try {
      const blob = await captureAsPng(cardRef.current);
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `${creatorUsername.toLowerCase().replace(/\s+/g, "-")}-qr-share.png`;
      link.href = blobUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);

      if (coverUrl) {
        try {
          const res = await fetch(coverUrl);
          const coverBlob = await res.blob();
          const coverUrl2 = URL.createObjectURL(coverBlob);
          const a = document.createElement("a");
          a.download = `${creatorUsername.toLowerCase().replace(/\s+/g, "-")}-cover.png`;
          a.href = coverUrl2;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(coverUrl2);
        } catch {
          // cover download is best-effort
        }
      }
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div style={wrapStyle}>
      {/* Capture target */}
      <div ref={cardRef} style={cardStyle}>
        {/* QR plinth */}
        <div style={plinthStyle}>
          <QRCodeSVG
            value={templateUrl}
            size={200}
            fgColor="#3730a3"
            bgColor="transparent"
          />
        </div>

        {/* Creator handle */}
        <p style={handleStyle}>{handle}</p>

        {/* Platform label */}
        <p style={platformStyle}>aluxartandframes.shop</p>

        {/* Divider */}
        <div style={dividerStyle} />

        {/* Two-column instructions */}
        <div style={instructionsGrid}>
          <div style={instrColStyle}>
            <p style={instrHeadStyle}>iPhone</p>
            <p style={instrLineStyle}>📸 Screenshot</p>
            <p style={instrLineStyle}>🖼 Open Photos</p>
            <p style={instrLineStyle}>👆 Hold QR Code</p>
          </div>
          <div style={instrDivStyle} />
          <div style={instrColStyle}>
            <p style={instrHeadStyle}>Android</p>
            <p style={instrLineStyle}>📸 Screenshot</p>
            <p style={instrLineStyle}>🔍 Google Lens</p>
            <p style={instrLineStyle}>🔗 Tap the Link</p>
          </div>
        </div>
      </div>

      {/* Action buttons (outside capture target) */}
      <button style={downloadBtnStyle} onClick={handleDownload} disabled={downloading}>
        {downloading ? "Saving..." : "Download Card + Cover"}
      </button>
      <button style={closeBtnStyle} onClick={onClose}>✕ Close</button>
    </div>
  );
}

/* ── Inline styles (no CSS module needed — isolated component) ── */

const wrapStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "12px",
  padding: "16px",
};

const cardStyle: React.CSSProperties = {
  background: "linear-gradient(180deg, #0d0826 0%, #03010a 100%)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "24px",
  padding: "32px 28px 28px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "16px",
  width: "300px",
};

const plinthStyle: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: "16px",
  padding: "24px",
  boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const handleStyle: React.CSSProperties = {
  margin: 0,
  color: "#c4b5fd",
  fontWeight: 700,
  fontSize: "15px",
  letterSpacing: "0.15em",
  textTransform: "uppercase",
  textShadow: "0 0 12px rgba(167,139,250,0.6)",
  fontFamily: "system-ui, sans-serif",
};

const platformStyle: React.CSSProperties = {
  margin: 0,
  color: "rgba(255,255,255,0.35)",
  fontSize: "11px",
  letterSpacing: "0.08em",
  fontFamily: "system-ui, sans-serif",
};

const dividerStyle: React.CSSProperties = {
  width: "100%",
  height: "1px",
  background: "rgba(255,255,255,0.08)",
};

const instructionsGrid: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "0",
  width: "100%",
};

const instrColStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: "4px",
};

const instrDivStyle: React.CSSProperties = {
  width: "1px",
  alignSelf: "stretch",
  background: "rgba(255,255,255,0.08)",
  margin: "0 12px",
};

const instrHeadStyle: React.CSSProperties = {
  margin: "0 0 6px",
  color: "rgba(255,255,255,0.6)",
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  fontFamily: "system-ui, sans-serif",
};

const instrLineStyle: React.CSSProperties = {
  margin: 0,
  color: "rgba(255,255,255,0.45)",
  fontSize: "11px",
  lineHeight: 1.6,
  fontFamily: "system-ui, sans-serif",
};

const downloadBtnStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, #3730a3, #6d28d9)",
  color: "#fff",
  border: "none",
  borderRadius: "12px",
  padding: "12px 24px",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
  width: "300px",
  letterSpacing: "0.02em",
};

const closeBtnStyle: React.CSSProperties = {
  background: "transparent",
  color: "rgba(255,255,255,0.5)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: "10px",
  padding: "8px 20px",
  fontSize: "13px",
  cursor: "pointer",
  width: "300px",
};
