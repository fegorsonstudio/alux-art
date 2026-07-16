"use client";

import { useEffect, useRef, useState } from "react";
import { LOCALES, LOCALE_NAMES } from "@/lib/i18n";
import { useLocale } from "@/lib/useLocale";

// Global floating language pill — the app has no shared header, so this lives
// in the root layout and reaches every page. Bottom-left (inline-start) keeps
// it clear of the checkout sheets and chat-style CTAs that sit bottom-right.
export default function LanguageSelector() {
  const { locale, setLocale } = useLocale();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div
      ref={wrapRef}
      style={{ position: "fixed", bottom: 14, insetInlineStart: 14, zIndex: 90 }}
    >
      {open && (
        <div
          style={{
            position: "absolute", bottom: "calc(100% + 8px)", insetInlineStart: 0,
            background: "var(--ls-bg, #ffffff)", border: "1px solid rgba(127,127,127,0.25)",
            borderRadius: 12, boxShadow: "0 8px 30px rgba(0,0,0,0.18)", overflow: "hidden",
            minWidth: 168,
          }}
        >
          {LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => { setLocale(l); setOpen(false); }}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                width: "100%", padding: "9px 14px", border: "none", cursor: "pointer",
                background: l === locale ? "rgba(47,142,154,0.12)" : "transparent",
                font: "inherit", fontSize: "0.85rem", color: "inherit", textAlign: "start",
              }}
            >
              <span>{LOCALE_NAMES[l]}</span>
              {l === locale && <span style={{ color: "#2f8e9a", fontWeight: 700 }}>✓</span>}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Language"
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "7px 12px", borderRadius: 999, cursor: "pointer",
          border: "1px solid rgba(127,127,127,0.3)",
          background: "var(--ls-bg, rgba(255,255,255,0.92))",
          backdropFilter: "blur(8px)", font: "inherit", fontSize: "0.8rem", fontWeight: 600,
          color: "#1f3d40", boxShadow: "0 2px 12px rgba(0,0,0,0.10)",
        }}
      >
        <span aria-hidden>🌐</span>
        <span>{LOCALE_NAMES[locale]}</span>
      </button>
    </div>
  );
}
