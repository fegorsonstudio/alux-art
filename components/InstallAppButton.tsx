"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/useLocale";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Global floating "Install App" pill, mirroring LanguageSelector on the
// opposite corner. Android/Chrome gets a real one-tap native install prompt;
// iOS Safari has no such API, so it gets instructions for the manual
// Share -> Add to Home Screen step instead. Renders nothing once the app is
// already installed, or on browsers that offer neither path.
export default function InstallAppButton() {
  const tc = useT("common");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);
    setIsIOS(/iphone|ipad|ipod/i.test(navigator.userAgent));

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (isStandalone || (!deferredPrompt && !isIOS)) return null;

  const handleClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      return;
    }
    setShowIOSModal(true);
  };

  return (
    <>
      <div style={{ position: "fixed", bottom: 14, insetInlineEnd: 14, zIndex: 90 }}>
        <button
          type="button"
          onClick={handleClick}
          aria-label={tc("installApp")}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 12px", borderRadius: 999, cursor: "pointer",
            border: "1px solid rgba(127,127,127,0.3)",
            background: "var(--ls-bg, rgba(255,255,255,0.92))",
            backdropFilter: "blur(8px)", font: "inherit", fontSize: "0.8rem", fontWeight: 600,
            color: "#1f3d40", boxShadow: "0 2px 12px rgba(0,0,0,0.10)",
          }}
        >
          <span aria-hidden>📲</span>
          <span>{tc("installApp")}</span>
        </button>
      </div>

      {showIOSModal && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setShowIOSModal(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            background: "rgba(10,16,20,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--ls-bg, #ffffff)", borderRadius: 16,
              padding: "24px 22px", maxWidth: 320, width: "100%",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)", textAlign: "center",
              color: "#1f3d40",
            }}
          >
            <div style={{ fontSize: "1.6rem", marginBottom: 10 }} aria-hidden>⬆️</div>
            <h2 style={{ fontSize: "1.05rem", fontWeight: 800, margin: "0 0 8px" }}>{tc("iosInstallTitle")}</h2>
            <p style={{ fontSize: "0.88rem", lineHeight: 1.5, margin: "0 0 18px", opacity: 0.85 }}>
              {tc("iosInstallHint")}
            </p>
            <button
              type="button"
              onClick={() => setShowIOSModal(false)}
              style={{
                border: "1px solid rgba(127,127,127,0.3)", borderRadius: 8,
                padding: "9px 20px", cursor: "pointer", font: "inherit",
                fontSize: "0.85rem", fontWeight: 600, background: "transparent", color: "inherit",
              }}
            >
              {tc("close")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
