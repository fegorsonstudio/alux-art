"use client";

import { useRef, useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";

interface Props {
  templateUrl: string;
  creatorUsername: string;
  coverUrl: string | null;
  onClose: () => void;
}

export default function TemplateShareCard({ templateUrl, creatorUsername, coverUrl, onClose }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [logoDataUrl, setLogoDataUrl] = useState<string | undefined>(undefined);

  const handle = "@" + creatorUsername.toUpperCase().replace(/\s+/g, "_");

  // Pre-load logo as data URL so html2canvas doesn't need to fetch it during capture
  useEffect(() => {
    fetch("/logo.png")
      .then(r => r.blob())
      .then(blob => {
        const reader = new FileReader();
        reader.onloadend = () => setLogoDataUrl(reader.result as string);
        reader.readAsDataURL(blob);
      })
      .catch(() => {/* logo is optional */});
  }, []);

  const handleDownload = async () => {
    if (typeof window === "undefined" || !cardRef.current) return;
    setDownloading(true);
    try {
      const html2canvas = (await import("html2canvas")).default;

      const canvas = await html2canvas(cardRef.current, { scale: 2, useCORS: true });
      const link = document.createElement("a");
      link.download = `${creatorUsername.toLowerCase().replace(/\s+/g, "-")}-qr-share.png`;
      link.href = canvas.toDataURL("image/png");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      if (coverUrl) {
        try {
          const res = await fetch(coverUrl);
          const blob = await res.blob();
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.download = `${creatorUsername.toLowerCase().replace(/\s+/g, "-")}-cover.png`;
          a.href = blobUrl;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(blobUrl);
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
            imageSettings={logoDataUrl ? {
              src: logoDataUrl,
              height: 40,
              width: 40,
              excavate: true,
            } : undefined}
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
