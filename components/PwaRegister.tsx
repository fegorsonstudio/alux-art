"use client";

import { useEffect } from "react";

// Registers the no-op service worker so Chrome/Android treat the app as
// installable. Silently no-ops on browsers without SW support (e.g. some
// in-app webviews) — installability just won't be offered there.
export default function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return null;
}
