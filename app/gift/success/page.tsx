"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useState, Suspense } from "react";

function GiftSuccessContent() {
  const searchParams = useSearchParams();
  const giftId = searchParams.get("gift_id") ?? "";
  const giftUrl = giftId ? `https://aluxartandframes.shop/gift/${giftId}` : "";

  const [copied, setCopied] = useState(false);

  function copyLink() {
    if (!giftUrl) return;
    navigator.clipboard.writeText(giftUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={iconWrap}>
          <svg viewBox="0 0 48 48" fill="none" style={{ width: 56, height: 56 }}>
            <rect x="4" y="20" width="40" height="26" rx="3" fill="#3730a3" opacity="0.15" stroke="#6d28d9" strokeWidth="2"/>
            <rect x="10" y="12" width="28" height="10" rx="3" fill="#3730a3" opacity="0.15" stroke="#6d28d9" strokeWidth="2"/>
            <path d="M24 12C24 12 20 6 16 8s-2 6 4 6h8c6 0 8-4 4-6s-8 4-8 4z" fill="#c4b5fd" opacity="0.7"/>
            <line x1="24" y1="12" x2="24" y2="46" stroke="#6d28d9" strokeWidth="2"/>
          </svg>
        </div>

        <h1 style={headingStyle}>Your gift is ready!</h1>
        <p style={subStyle}>
          Payment received. Share the link below with your friend — they&rsquo;ll get a premium unboxing experience.
        </p>

        {giftUrl && (
          <div style={linkBoxStyle}>
            <input
              readOnly
              value={giftUrl}
              style={linkInputStyle}
              onFocus={e => e.currentTarget.select()}
            />
            <button type="button" style={copyBtnStyle} onClick={copyLink}>
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        )}

        <p style={noteStyle}>
          Link expires in 30 days. Your friend will be prompted to sign up and upload their photos before the session starts.
        </p>

        <Link href="/marketplace" style={browseLinkStyle}>Browse more styles →</Link>
      </div>
    </div>
  );
}

export default function GiftSuccessPage() {
  return (
    <Suspense>
      <GiftSuccessContent />
    </Suspense>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "radial-gradient(circle at 20% 20%, rgba(109,40,217,0.18) 0%, transparent 50%), linear-gradient(135deg, #0d0826 0%, #030712 100%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px 16px",
};

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "24px",
  padding: "40px 32px",
  maxWidth: "480px",
  width: "100%",
  textAlign: "center",
  backdropFilter: "blur(12px)",
};

const iconWrap: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  marginBottom: "20px",
};

const headingStyle: React.CSSProperties = {
  margin: "0 0 12px",
  color: "#f5f3ff",
  fontSize: "1.7rem",
  fontWeight: 700,
  fontFamily: "system-ui, sans-serif",
};

const subStyle: React.CSSProperties = {
  margin: "0 0 28px",
  color: "rgba(255,255,255,0.6)",
  fontSize: "0.95rem",
  lineHeight: 1.6,
  fontFamily: "system-ui, sans-serif",
};

const linkBoxStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  marginBottom: "20px",
};

const linkInputStyle: React.CSSProperties = {
  flex: 1,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: "10px",
  padding: "10px 14px",
  color: "#c4b5fd",
  fontSize: "0.82rem",
  fontFamily: "monospace",
  outline: "none",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const copyBtnStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, #3730a3, #6d28d9)",
  color: "#fff",
  border: "none",
  borderRadius: "10px",
  padding: "10px 18px",
  fontSize: "0.88rem",
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
  flexShrink: 0,
};

const noteStyle: React.CSSProperties = {
  margin: "0 0 28px",
  color: "rgba(255,255,255,0.35)",
  fontSize: "0.8rem",
  lineHeight: 1.5,
  fontFamily: "system-ui, sans-serif",
};

const browseLinkStyle: React.CSSProperties = {
  display: "inline-block",
  color: "rgba(255,255,255,0.5)",
  fontSize: "0.88rem",
  textDecoration: "none",
  fontFamily: "system-ui, sans-serif",
};
