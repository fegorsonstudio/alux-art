"use client";

import { useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";

interface Props {
  templateUrl: string;
  creatorUsername: string;
  coverUrl: string | null;
  onClose: () => void;
  includeCover?: boolean;
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

// Build the 4:5 card as a PNG by drawing to Canvas 2D.
// QRCodeCanvas renders the QR into a <canvas> element — copying canvas to
// canvas via drawImage() is always taint-free and never hangs.
function buildCardPng(cardEl: HTMLDivElement, handle: string): Promise<Blob> {
  const qrCanvas = cardEl.querySelector("canvas") as HTMLCanvasElement | null;
  if (!qrCanvas) return Promise.reject(new Error("QR canvas not found"));

  const S = 2;

  // 4:5 aspect ratio — 600 × 750 at 2× scale
  const CARD_W = 300 * S;   // 600
  const CARD_H = 375 * S;   // 750

  const PX     = 20 * S;    // horizontal margin
  const PT     = 24 * S;    // top padding (before CTA)
  const PB     = 20 * S;    // bottom padding
  const GAP    = 10 * S;    // vertical gap between sections

  // QR plinth: 65% of card width
  const PW     = Math.round(CARD_W * 0.65);  // 390
  const PP     = 16 * S;                      // plinth padding
  const QR     = PW - 2 * PP;                 // 326 — QR size on canvas
  const PH     = PW;                           // square plinth
  const plinthX = Math.round((CARD_W - PW) / 2);

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

  // CTA — "TAKE A SCREENSHOT NOW!" (1.1rem → 18px display → 36px canvas)
  ctx.save();
  ctx.font        = `bold ${18 * S}px system-ui,-apple-system,sans-serif`;
  ctx.fillStyle   = "rgba(255,255,255,0.92)";
  ctx.textAlign   = "center";
  ctx.letterSpacing = "0.15em";
  ctx.fillText("TAKE A SCREENSHOT NOW!", CARD_W / 2, y + 18 * S);
  ctx.restore();
  y += 20 * S + GAP;

  // White plinth with shadow
  ctx.save();
  ctx.shadowColor   = "rgba(0,0,0,0.4)";
  ctx.shadowBlur    = 30;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle     = "#ffffff";
  roundedFill(ctx, plinthX, y, PW, PH, 16 * S);
  ctx.restore();
  ctx.fillStyle = "#ffffff";
  roundedFill(ctx, plinthX, y, PW, PH, 16 * S);

  // QR code — canvas-to-canvas, never taints
  ctx.drawImage(qrCanvas, plinthX + PP, y + PP, QR, QR);
  y += PH + GAP;

  // Creator handle (1.2rem → 19px display → 38px canvas)
  ctx.save();
  ctx.font        = `bold ${19 * S}px system-ui,-apple-system,sans-serif`;
  ctx.fillStyle   = "#c4b5fd";
  ctx.textAlign   = "center";
  ctx.shadowColor = "rgba(167,139,250,0.6)";
  ctx.shadowBlur  = 10;
  ctx.fillText(handle, CARD_W / 2, y + 19 * S);
  ctx.restore();
  y += 22 * S + GAP;

  // Platform label (0.85rem → 14px display → 28px canvas)
  ctx.save();
  ctx.font      = `${14 * S}px system-ui,-apple-system,sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.textAlign = "center";
  ctx.fillText("aluxartandframes.shop", CARD_W / 2, y + 14 * S);
  ctx.restore();
  y += 16 * S + GAP;

  // Divider
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(PX, y, CARD_W - 2 * PX, S);
  y += S + GAP;

  // Instructions — two columns
  const INSTRH = CARD_H - y - PB;
  const MX     = CARD_W / 2;
  const COLGAP = 10 * S;
  const COLW   = MX - PX - COLGAP;

  const drawCol = (lines: string[], cx: number) => {
    ctx.save();
    ctx.textAlign = "center";
    ctx.font      = `bold ${9 * S}px system-ui,-apple-system,sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText(lines[0].toUpperCase(), cx, y + 9 * S);
    ctx.font      = `${10 * S}px system-ui,-apple-system,sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    for (let i = 1; i < lines.length; i++) {
      ctx.fillText(lines[i], cx, y + (14 + i * 16) * S);
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

  return new Promise<Blob>((res, rej) =>
    canvas.toBlob(b => (b ? res(b) : rej(new Error("PNG encode failed"))), "image/png")
  );
}

export default function TemplateShareCard({
  templateUrl, creatorUsername, coverUrl, onClose, includeCover = false,
}: Props) {
  const cardRef           = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const handle = "@" + creatorUsername.toUpperCase().replace(/\s+/g, "_");

  const handleDownload = async () => {
    if (typeof window === "undefined" || !cardRef.current) return;
    setDownloading(true);
    try {
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

    // Cover download — Image+canvas approach, fire-and-forget.
    if (includeCover && coverUrl) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const cvs = document.createElement("canvas");
        cvs.width  = img.naturalWidth;
        cvs.height = img.naturalHeight;
        const ctx2d = cvs.getContext("2d");
        if (!ctx2d) return;
        ctx2d.drawImage(img, 0, 0);
        cvs.toBlob(b => {
          if (!b) return;
          const cu = URL.createObjectURL(b);
          const a  = document.createElement("a");
          a.download = `${creatorUsername.toLowerCase().replace(/\s+/g, "-")}-cover.png`;
          a.href     = cu;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(cu);
        }, "image/png");
      };
      img.onerror = () => {/* best-effort */};
      img.src = coverUrl;
    }
  };

  return (
    <div style={wrapStyle}>
      <div ref={cardRef} style={cardStyle}>
        {/* CTA — sits above the plinth against the dark background */}
        <p style={ctaStyle}>Take a Screenshot Now!</p>

        <div style={plinthStyle}>
          {/*
            QRCodeCanvas renders into a <canvas> element. We read that canvas
            in buildCardPng and copy it via drawImage() — always taint-free.
            size=326 (2× display size 163px) keeps the QR crisp in the download.
          */}
          <QRCodeCanvas
            value={templateUrl}
            size={326}
            fgColor="#3730a3"
            bgColor="#ffffff"
            style={{ width: "163px", height: "163px", display: "block" }}
          />
        </div>

        <div style={handleGroupStyle}>
          <p style={handleStyle}>{handle}</p>
          <p style={platformStyle}>aluxartandframes.shop</p>
        </div>

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
        {downloading ? "Saving..." : includeCover ? "Download Card + Cover" : "Download Card"}
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
  padding: "24px 20px 20px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "8px",
  width: "300px",
  height: "375px",
  overflow: "hidden",
  boxSizing: "border-box",
};

const ctaStyle: React.CSSProperties = {
  margin: "0 0 8px",
  color: "rgba(255,255,255,0.92)",
  fontWeight: 700,
  fontSize: "1.1rem",
  letterSpacing: "0.15em",
  textTransform: "uppercase",
  fontFamily: "system-ui, sans-serif",
};

const plinthStyle: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: "16px",
  padding: "20px",
  boxShadow: "0 14px 30px rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const handleGroupStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "4px",
  flexShrink: 0,
};

const handleStyle: React.CSSProperties = {
  margin: 0,
  color: "#c4b5fd",
  fontWeight: 700,
  fontSize: "1.2rem",
  letterSpacing: "0.15em",
  textTransform: "uppercase",
  textShadow: "0 0 10px rgba(167,139,250,0.6)",
  fontFamily: "system-ui, sans-serif",
};

const platformStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "rgba(255,255,255,0.4)",
  fontSize: "0.85rem",
  letterSpacing: "0.08em",
  fontFamily: "system-ui, sans-serif",
};

const dividerStyle: React.CSSProperties = {
  width: "100%",
  height: "1px",
  background: "rgba(255,255,255,0.1)",
  flexShrink: 0,
};

const instructionsGrid: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "0",
  width: "100%",
  flexShrink: 0,
  paddingBottom: "16px",
  boxSizing: "border-box",
};

const instrColStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: "2px",
};

const instrDivStyle: React.CSSProperties = {
  width: "1px",
  alignSelf: "stretch",
  background: "rgba(255,255,255,0.08)",
  margin: "0 10px",
};

const instrHeadStyle: React.CSSProperties = {
  margin: "0 0 4px",
  color: "rgba(255,255,255,0.6)",
  fontSize: "9px",
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  fontFamily: "system-ui, sans-serif",
};

const instrLineStyle: React.CSSProperties = {
  margin: 0,
  color: "rgba(255,255,255,0.45)",
  fontSize: "10px",
  lineHeight: 1.5,
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
