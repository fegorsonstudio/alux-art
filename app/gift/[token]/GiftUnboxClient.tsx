"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface GiftData {
  id: string;
  senderName: string;
  customMessage: string | null;
  packageSize: number;
  isClaimed: boolean;
  expiresAt: string;
  template: {
    id: string;
    title: string;
    description: string | null;
    category: string;
    shootMode: string;
    aspectRatio: string;
  };
  images: { url: string | null; purpose: string }[];
}

export default function GiftUnboxClient({ gift, token }: { gift: GiftData; token: string }) {
  const router = useRouter();
  const [opened, setOpened] = useState(false);
  const [lidFlying, setLidFlying] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState("");
  const [galleryIdx, setGalleryIdx] = useState(0);
  const isExpired = new Date(gift.expiresAt) < new Date();

  const galleryImages = gift.images.filter(img => img.url);

  function openBox() {
    if (isExpired || gift.isClaimed) return;
    setLidFlying(true);
    setTimeout(() => setOpened(true), 500);
  }

  async function handleClaim() {
    setClaiming(true);
    setError("");
    try {
      const res = await fetch(`/api/gift/${token}/claim`, { method: "POST" });
      const data = await res.json();
      if (res.status === 401) {
        window.location.href = `/login?next=/gift/${token}`;
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setClaiming(false);
        return;
      }
      if (data.needsIdentityImages) {
        router.push(`/studio?claim_gift=${token}`);
        return;
      }
      if (data.redirect) {
        router.push(data.redirect);
        return;
      }
    } catch {
      setError("Network error. Please try again.");
      setClaiming(false);
    }
  }

  return (
    <>
      <style>{`
        @keyframes giftFloat {
          0%, 100% { transform: translateY(0px) rotate(-0.8deg); }
          50% { transform: translateY(-14px) rotate(0.8deg); }
        }
        @keyframes giftGlow {
          0%, 100% { filter: drop-shadow(0 0 18px rgba(109,40,217,0.5)) drop-shadow(0 0 40px rgba(109,40,217,0.2)); }
          50% { filter: drop-shadow(0 0 30px rgba(167,139,250,0.7)) drop-shadow(0 0 60px rgba(109,40,217,0.35)); }
        }
        @keyframes lidFlyAnim {
          0%   { transform: translateY(0) rotate(0deg) scale(1); opacity: 1; }
          30%  { transform: translateY(-20px) rotate(-4deg) scale(1.04); opacity: 1; }
          100% { transform: translateY(-200px) rotate(-18deg) scale(0.7); opacity: 0; }
        }
        @keyframes boxPop {
          0%   { transform: scale(1); }
          40%  { transform: scale(1.06) translateY(-4px); }
          100% { transform: scale(1); }
        }
        @keyframes revealFade {
          0%   { opacity: 0; transform: translateY(28px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes sparkleIn {
          0%, 100% { opacity: 0; transform: scale(0) rotate(0deg); }
          50%       { opacity: 1; transform: scale(1) rotate(180deg); }
        }
        @keyframes tapPulse {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.04); }
        }
        .giftBoxFloat {
          animation: giftFloat 3.2s ease-in-out infinite, giftGlow 3.2s ease-in-out infinite;
          cursor: pointer;
        }
        .giftBoxFloat:hover .giftBody { border-color: rgba(167,139,250,0.8); }
        .giftBoxPopping { animation: boxPop 0.5s ease-out forwards; }
        .giftLidFlying { animation: lidFlyAnim 0.55s cubic-bezier(0.25,0.46,0.45,0.94) forwards; }
        .revealContent { animation: revealFade 0.8s ease-out 0.15s both; }
        .tapHintPulse { animation: tapPulse 2s ease-in-out infinite; }
        .sparkle { animation: sparkleIn 0.7s ease-out var(--delay, 0s) both; }
      `}</style>

      <div style={pageStyle}>
        <div style={containerStyle}>
          {/* Brand bar */}
          <div style={brandBarStyle}>
            <Link href="/marketplace" style={brandLinkStyle}>Alux Art</Link>
          </div>

          {!opened ? (
            /* ---- Gift box state ---- */
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "28px", paddingTop: "28px" }}>
              <p style={youHaveStyle}>You have a gift waiting</p>

              {/* The box */}
              <button
                type="button"
                className={lidFlying ? "giftBoxPopping" : "giftBoxFloat"}
                style={boxWrapBtnStyle}
                onClick={openBox}
                aria-label="Open your gift"
              >
                {/* Bow */}
                <div style={bowWrapStyle}>
                  <div style={{ ...bowLoopStyle, left: 14, transform: "rotate(-22deg) scaleX(-1)" }} />
                  <div style={{ ...bowLoopStyle, right: 14, transform: "rotate(22deg)" }} />
                  <div style={bowKnotStyle} />
                </div>

                {/* Lid */}
                <div className={lidFlying ? "giftLidFlying" : undefined} style={lidStyle}>
                  <div style={lidRibbonStyle} />
                </div>

                {/* Body */}
                <div className="giftBody" style={bodyStyle}>
                  <div style={bodyRibbonVStyle} />
                  <div style={bodyRibbonHStyle} />
                </div>
              </button>

              {/* Sparkles (shown after lid flies) */}
              {lidFlying && (
                <div style={{ position: "absolute", pointerEvents: "none" }}>
                  {["0s", "0.1s", "0.2s", "0.15s", "0.05s"].map((d, i) => (
                    <span
                      key={i}
                      className="sparkle"
                      style={{
                        "--delay": d,
                        position: "absolute",
                        fontSize: "1.4rem",
                        left: `${[-60, 60, -30, 90, -80][i]}px`,
                        top: `${[-40, -50, -80, -30, -20][i]}px`,
                      } as React.CSSProperties}
                    >
                      {["✦", "✦", "✦", "✦", "✦"][i]}
                    </span>
                  ))}
                </div>
              )}

              {isExpired ? (
                <p style={statusNoteStyle}>This gift link has expired.</p>
              ) : gift.isClaimed ? (
                <p style={statusNoteStyle}>This gift has already been claimed.</p>
              ) : (
                <p className="tapHintPulse" style={tapHintStyle}>
                  Tap to open
                </p>
              )}

              {!isExpired && !gift.isClaimed && (
                <p style={fromStyle}>
                  A gift from <strong style={{ color: "#c4b5fd" }}>{gift.senderName}</strong>
                </p>
              )}
            </div>
          ) : (
            /* ---- Revealed state ---- */
            <div className="revealContent" style={revealWrapStyle}>
              {/* Sparkle row */}
              <div style={{ display: "flex", gap: "12px", justifyContent: "center", fontSize: "1.1rem", color: "#c4b5fd", marginBottom: "4px" }}>
                {["✦", "✦", "✦", "✦", "✦"].map((s, i) => <span key={i}>{s}</span>)}
              </div>

              <p style={revealFromStyle}>
                A gift from <strong style={{ color: "#c4b5fd" }}>{gift.senderName}</strong>
              </p>

              <h1 style={revealHeadingStyle}>
                {gift.senderName} gifted you an elite Virtual Studio Session
              </h1>

              {gift.customMessage && (
                <div style={messageBoxStyle}>
                  <p style={messageTextStyle}>&ldquo;{gift.customMessage}&rdquo;</p>
                </div>
              )}

              {/* Session pills */}
              <div style={pillRowStyle}>
                <span style={pillStyle}><span style={pillDotStyle} />{gift.packageSize} professional images</span>
                <span style={pillStyle}><span style={pillDotStyle} />{gift.template.category}</span>
                <span style={pillStyle}>
                  <span style={pillDotStyle} />
                  {gift.template.shootMode === "advanced" ? "Full customisation" : "Standard"} style
                </span>
              </div>

              {/* Gallery */}
              {galleryImages.length > 0 && (
                <div style={galleryWrapStyle}>
                  <p style={galleryCaptionStyle}>{gift.template.title}</p>
                  <div style={galleryGridStyle}>
                    {galleryImages.slice(0, 6).map((img, i) => (
                      <button
                        key={i}
                        type="button"
                        style={{
                          ...galleryItemStyle,
                          backgroundImage: img.url ? `url(${img.url})` : undefined,
                          opacity: i === galleryIdx ? 1 : 0.55,
                          transform: i === galleryIdx ? "scale(1.05)" : "scale(1)",
                        }}
                        onClick={() => setGalleryIdx(i)}
                        aria-label={`Sample image ${i + 1}`}
                      />
                    ))}
                  </div>
                  {/* Large preview */}
                  {galleryImages[galleryIdx]?.url && (
                    <div style={largePreviewStyle}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={galleryImages[galleryIdx].url!}
                        alt={gift.template.title}
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* CTA */}
              {gift.isClaimed ? (
                <div style={endBoxStyle}>
                  <p style={endNoteStyle}>This gift has already been claimed.</p>
                  <Link href="/marketplace" style={browseLinkStyle}>Browse more styles →</Link>
                </div>
              ) : isExpired ? (
                <div style={endBoxStyle}>
                  <p style={endNoteStyle}>This gift link has expired.</p>
                </div>
              ) : (
                <div style={ctaGroupStyle}>
                  {error && <p style={errorStyle}>{error}</p>}
                  <button
                    type="button"
                    style={{ ...claimBtnStyle, opacity: claiming ? 0.7 : 1, cursor: claiming ? "default" : "pointer" }}
                    onClick={handleClaim}
                    disabled={claiming}
                  >
                    {claiming ? "Preparing your session..." : "Claim Your Studio Session"}
                  </button>
                  <p style={ctaNoteStyle}>
                    You&apos;ll upload your photos to personalise the look. Valid until{" "}
                    {new Date(gift.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ---- Styles ---- */

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: [
    "radial-gradient(circle at 18% 12%, rgba(109,40,217,0.28) 0%, transparent 42%)",
    "radial-gradient(circle at 82% 88%, rgba(55,48,163,0.22) 0%, transparent 38%)",
    "radial-gradient(circle at 50% 50%, rgba(109,40,217,0.08) 0%, transparent 60%)",
    "linear-gradient(135deg, #0d0826 0%, #030712 100%)",
  ].join(", "),
  display: "flex",
  justifyContent: "center",
  padding: "0 16px 64px",
  overflowX: "hidden",
};

const containerStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "560px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  position: "relative",
};

const brandBarStyle: React.CSSProperties = {
  width: "100%",
  display: "flex",
  justifyContent: "center",
  padding: "20px 0 12px",
};

const brandLinkStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.35)",
  textDecoration: "none",
  fontSize: "0.78rem",
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  fontFamily: "system-ui, sans-serif",
};

const youHaveStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.45)",
  fontSize: "0.88rem",
  fontFamily: "system-ui, sans-serif",
  margin: 0,
  letterSpacing: "0.04em",
};

/* Gift box pieces */
const boxWrapBtnStyle: React.CSSProperties = {
  position: "relative",
  background: "none",
  border: "none",
  padding: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  cursor: "pointer",
  userSelect: "none",
};

const bowWrapStyle: React.CSSProperties = {
  position: "relative",
  width: 120,
  height: 36,
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-end",
  zIndex: 2,
};

const bowLoopStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 6,
  width: 36,
  height: 26,
  borderRadius: "50% 50% 0 0",
  background: "linear-gradient(135deg, #7c3aed, #5b21b6)",
  border: "1.5px solid rgba(167,139,250,0.5)",
};

const bowKnotStyle: React.CSSProperties = {
  width: 14,
  height: 14,
  borderRadius: "50%",
  background: "linear-gradient(135deg, #c4b5fd, #7c3aed)",
  border: "1.5px solid rgba(196,181,253,0.6)",
  position: "absolute",
  bottom: 2,
  zIndex: 1,
};

const lidStyle: React.CSSProperties = {
  width: 132,
  height: 34,
  background: "linear-gradient(145deg, #3730a3 0%, #1e1b6a 100%)",
  border: "1.5px solid rgba(109,40,217,0.7)",
  borderRadius: "6px 6px 0 0",
  position: "relative",
  overflow: "hidden",
  boxShadow: "0 -4px 18px rgba(109,40,217,0.35)",
  zIndex: 1,
};

const lidRibbonStyle: React.CSSProperties = {
  position: "absolute",
  left: "50%",
  top: 0,
  bottom: 0,
  transform: "translateX(-50%)",
  width: 18,
  background: "linear-gradient(90deg, rgba(167,139,250,0.3), rgba(196,181,253,0.5), rgba(167,139,250,0.3))",
};

const bodyStyle: React.CSSProperties = {
  width: 120,
  height: 100,
  background: "linear-gradient(165deg, #2d2484 0%, #1a1660 60%, #0f0c47 100%)",
  border: "1.5px solid rgba(109,40,217,0.65)",
  borderTop: "none",
  borderRadius: "0 0 10px 10px",
  position: "relative",
  overflow: "hidden",
  boxShadow: "0 12px 40px rgba(55,48,163,0.4), inset 0 0 30px rgba(109,40,217,0.1)",
};

const bodyRibbonVStyle: React.CSSProperties = {
  position: "absolute",
  left: "50%",
  top: 0,
  bottom: 0,
  transform: "translateX(-50%)",
  width: 18,
  background: "linear-gradient(90deg, rgba(109,40,217,0.25), rgba(167,139,250,0.45), rgba(109,40,217,0.25))",
};

const bodyRibbonHStyle: React.CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  top: "38%",
  transform: "translateY(-50%)",
  height: 18,
  background: "linear-gradient(180deg, rgba(109,40,217,0.2), rgba(167,139,250,0.4), rgba(109,40,217,0.2))",
};

const tapHintStyle: React.CSSProperties = {
  color: "rgba(196,181,253,0.7)",
  fontSize: "0.88rem",
  fontFamily: "system-ui, sans-serif",
  margin: 0,
  letterSpacing: "0.05em",
};

const statusNoteStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.4)",
  fontSize: "0.88rem",
  fontFamily: "system-ui, sans-serif",
  margin: 0,
  textAlign: "center",
};

const fromStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.5)",
  fontSize: "0.88rem",
  fontFamily: "system-ui, sans-serif",
  margin: 0,
};

/* Reveal state */

const revealWrapStyle: React.CSSProperties = {
  width: "100%",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "24px",
  paddingTop: "20px",
  textAlign: "center",
};

const revealFromStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.45)",
  fontSize: "0.85rem",
  fontFamily: "system-ui, sans-serif",
  margin: 0,
};

const revealHeadingStyle: React.CSSProperties = {
  color: "#f5f3ff",
  fontSize: "clamp(1.4rem, 5vw, 2rem)",
  fontWeight: 800,
  fontFamily: "system-ui, sans-serif",
  lineHeight: 1.25,
  margin: 0,
  maxWidth: 480,
};

const messageBoxStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(167,139,250,0.2)",
  borderRadius: "12px",
  padding: "16px 20px",
  maxWidth: 420,
  width: "100%",
};

const messageTextStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.65)",
  fontSize: "0.95rem",
  lineHeight: 1.65,
  fontStyle: "italic",
  fontFamily: "Georgia, serif",
  margin: 0,
};

const pillRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  justifyContent: "center",
};

const pillStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  background: "rgba(109,40,217,0.15)",
  border: "1px solid rgba(109,40,217,0.3)",
  borderRadius: "20px",
  padding: "5px 12px",
  color: "rgba(196,181,253,0.85)",
  fontSize: "0.78rem",
  fontFamily: "system-ui, sans-serif",
  fontWeight: 500,
};

const pillDotStyle: React.CSSProperties = {
  width: 5,
  height: 5,
  borderRadius: "50%",
  background: "#7c3aed",
  flexShrink: 0,
};

const galleryWrapStyle: React.CSSProperties = {
  width: "100%",
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  alignItems: "center",
};

const galleryCaptionStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.35)",
  fontSize: "0.72rem",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  fontFamily: "system-ui, sans-serif",
  margin: 0,
};

const galleryGridStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  justifyContent: "center",
  flexWrap: "wrap",
};

const galleryItemStyle: React.CSSProperties = {
  width: 72,
  height: 72,
  borderRadius: "8px",
  backgroundSize: "cover",
  backgroundPosition: "center",
  background: "rgba(255,255,255,0.06)",
  border: "1.5px solid rgba(109,40,217,0.2)",
  cursor: "pointer",
  transition: "opacity 0.2s, transform 0.2s, border-color 0.2s",
  padding: 0,
  flexShrink: 0,
};

const largePreviewStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 380,
  aspectRatio: "4/5",
  borderRadius: "14px",
  overflow: "hidden",
  border: "1.5px solid rgba(109,40,217,0.25)",
  boxShadow: "0 20px 60px rgba(55,48,163,0.3)",
};

const ctaGroupStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "12px",
  width: "100%",
  maxWidth: 400,
};

const errorStyle: React.CSSProperties = {
  color: "#f87171",
  fontSize: "0.85rem",
  fontFamily: "system-ui, sans-serif",
  margin: 0,
  textAlign: "center",
};

const claimBtnStyle: React.CSSProperties = {
  width: "100%",
  background: "linear-gradient(135deg, #3730a3 0%, #6d28d9 100%)",
  color: "#fff",
  border: "none",
  borderRadius: "14px",
  padding: "16px 24px",
  fontSize: "1rem",
  fontWeight: 700,
  fontFamily: "system-ui, sans-serif",
  letterSpacing: "0.01em",
  boxShadow: "0 8px 30px rgba(109,40,217,0.4)",
  transition: "opacity 0.2s, transform 0.15s",
};

const ctaNoteStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.3)",
  fontSize: "0.75rem",
  lineHeight: 1.5,
  fontFamily: "system-ui, sans-serif",
  margin: 0,
  textAlign: "center",
};

const endBoxStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "12px",
};

const endNoteStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.35)",
  fontSize: "0.88rem",
  fontFamily: "system-ui, sans-serif",
  margin: 0,
};

const browseLinkStyle: React.CSSProperties = {
  color: "rgba(196,181,253,0.7)",
  fontSize: "0.88rem",
  fontFamily: "system-ui, sans-serif",
  textDecoration: "none",
};
