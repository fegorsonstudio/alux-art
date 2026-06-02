"use client";

import { useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";

interface Props {
  templateUrl: string;
  creatorUsername: string;
  coverUrl: string | null;
  onClose: () => void;
}

function roundedFill(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

// Build the card as a PNG by drawing to Canvas 2D.
// QRCodeCanvas renders the QR into a <canvas> element — copying canvas to
// canvas via drawImage() is always taint-free and never hangs.
function buildCardPng(cardEl: HTMLDivElement, handle: string): Promise<Blob> {
  // Get the QR canvas rendered by QRCodeCanvas
  const qrCanvas = cardEl.querySelector("canvas") as HTMLCanvasElement | null;
  if (!qrCanvas) return Promise.reject(new Error("QR canvas not found"));

  const S = 2;

  // Layout (all values in pixels at 2× scale)
  const CARD_W = 300 * S;
  const PX     = 28 * S;
  const PT     = 32 * S;
  const PB     = 28 * S;
  const GAP    = 16 * S;
  const QR     = 200 * S;   // QR display size on output canvas
  const PP     = 24 * S;    // plinth padding
  const PW     = QR + 2 * PP;
  const PH     = QR + 2 * PP;
  const INSTRH = 88 * S;
  const CARD_H = PT + PH + GAP + 20 * S + GAP + 16 * S + GAP + S + GAP + INSTRH + PB;

  const canvas  = document.createElement("canvas");
  canvas.width  = CARD_W;
  canvas.height = CARD_H;
  const ctx     = canvas.getContext("2d")!;

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, 0, CARD_H);
  bg.addColorStop(0, "#0d0826");
  bg.addColorStop(1, "#03010a");
  ctx.fillStyle = bg;
  roundedFill(ctx, 0, 0, CARD_W, CARD_H, 24 * S);

  let y = PT;
  const plinthX = (CARD_W - PW) / 2;

  // White plinth with shadow
  ctx.save();
  ctx.shadowColor   = "rgba(0,0,0,0.4)";
  ctx.shadowBlur    = 40;
  ctx.shadowOffsetY = 20;
  ctx.fillStyle     = "#ffffff";
  roundedFill(ctx, plinthX, y, PW, PH, 16 * S);
  ctx.restore();
  ctx.fillStyle = "#ffffff";
  roundedFill(ctx, plinthX, y, PW, PH, 16 * S);

  // QR code — canvas-to-canvas, never taints
  ctx.drawImage(qrCanvas, plinthX + PP, y + PP, QR, QR);
  y += PH + GAP;

  // Creator handle
  ctx.save();
  ctx.font        = `bold ${15 * S}px system-ui,-apple-system,sans-serif`;
  ctx.fillStyle   = "#c4b5fd";
  ctx.textAlign   = "center";
  ctx.shadowColor = "rgba(167,139,250,0.6)";
  ctx.shadowBlur  = 12;
  ctx.fillText(handle, CARD_W / 2, y + 15 * S);
  ctx.restore();
  y += 20 * S + GAP;

  // Platform label
  ctx.save();
  ctx.font      = `${11 * S}px system-ui,-apple-system,sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.textAlign = "center";
  ctx.fillText("aluxartandframes.shop", CARD_W / 2, y + 11 * S);
  ctx.restore();
  y += 16 * S + GAP;

  // Divider
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(PX, y, CARD_W - 2 * PX, S);
  y += S + GAP;

  // Instructions — two columns
  const MX     = CARD_W / 2;
  const COLGAP = 12 * S;
  const COLW   = MX - PX - COLGAP;

  const drawCol = (lines: string[], cx: number) => {
    ctx.save();
    ctx.textAlign = "center";
    ctx.font      = `bold ${10 * S}px system-ui,-apple-system,sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText(lines[0].toUpperCase(), cx, y + 10 * S);
    ctx.font      = `${11 * S}px system-ui,-apple-system,sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    for (let i = 1; i < lines.length; i++) {
      ctx.fillText(lines[i], cx, y + (16 + i * 18) * S);
    }
    ctx.restore();
  };

  drawCol(
    ["iPhone", "📸 Screenshot", "🖼 Open Photos", "👆 Hold QR Code"],
    PX + COLW / 2
  );

  // Vertical column divider
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(MX - S / 2, y, S, INSTRH);

  drawCol(
    ["Android", "📸 Screenshot", "🔍 Google Lens", "🔗 Tap the Link"],
    MX + COLGAP + COLW / 2
  );

  // canvas.toBlob is async but runs on the GPU thread — no hanging
  return new Promise<Blob>((res, rej) =>
    canvas.toBlob(b => (b ? res(b) : rej(new Error("PNG encode failed"))), "image/png")
  );
}

export default function TemplateShareCard({
  templateUrl, creatorUsername, coverUrl, onClose,
}: Props) {
  const cardRef           = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const handle = "@" + creatorUsername.toUpperCase().replace(/\s+/g, "_");

  const handleDownload = async () => {
    if (typeof window === "undefined" || !cardRef.current) return;
    setDownloading(true);
    try {
      // Build and download the QR card PNG.
      const blob    = await buildCardPng(cardRef.current, handle);
      const blobUrl = URL.createObjectURL(blob);
      const link    = document.createElement("a");
      link.download = `${creatorUsername.toLowerCase().replace(/\s+/g, "-")}-qr-share.png`;
      link.href     = blobUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } finally {
      // Reset button as soon as the QR card is done — don't block on cover fetch.
      setDownloading(false);
    }

    // Cover download is fire-and-forget so it never blocks the button state.
    if (coverUrl) {
      fetch(coverUrl)
        .then(r => r.blob())
        .then(coverBlob => {
          const cu = URL.createObjectURL(coverBlob);
          const a  = document.createElement("a");
          a.download = `${creatorUsername.toLowerCase().replace(/\s+/g, "-")}-cover.png`;
          a.href     = cu;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(cu);
        })
        .catch(() => {/* best-effort */});
    }
  };

  return (
    <div style={wrapStyle}>
      <div ref={cardRef} style={cardStyle}>
        <div style={plinthStyle}>
          {/*
            QRCodeCanvas renders into a <canvas> element. We read that canvas
            in buildCardPng and copy it via drawImage() — always taint-free,
            no blob/Image loading, no hanging.
            size=400 (2× display size) keeps the QR crisp in the download;
            CSS scales it down to 200×200 for the on-screen card.
          */}
          <QRCodeCanvas
            value={templateUrl}
            size={400}
            fgColor="#3730a3"
            bgColor="#ffffff"
            style={{ width: "200px", height: "200px", display: "block" }}
          />
        </div>
        <p style={handleStyle}>{handle}</p>
        <p style={platformStyle}>aluxartandframes.shop</p>
        <div style={dividerStyle} />
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

      <button style={downloadBtnStyle} onClick={handleDownload} disabled={downloading}>
        {downloading ? "Saving..." : "Download Card + Cover"}
      </button>
      <button style={closeBtnStyle} onClick={onClose}>✕ Close</button>
    </div>
  );
}

/* ── Inline styles ── */

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
