"use client";

import { useState, useEffect, useCallback } from "react";

export type Currency = "NGN" | "USD";

export function useCurrency() {
  const [currency, setCurrency] = useState<Currency>("NGN");
  const [usdToNgn, setUsdToNgn] = useState(1600);

  useEffect(() => {
    // Auto-detect: default to NGN for Nigeria/Lagos timezone, USD otherwise
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const isNigeria = tz === "Africa/Lagos";
    const stored = localStorage.getItem("alux-currency") as Currency | null;
    setCurrency(stored ?? (isNigeria ? "NGN" : "USD"));

    fetch("/api/fx-rate")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.usdToNgn) setUsdToNgn(d.usdToNgn); })
      .catch(() => {});
  }, []);

  const toggle = useCallback(() => {
    setCurrency(c => {
      const next: Currency = c === "NGN" ? "USD" : "NGN";
      localStorage.setItem("alux-currency", next);
      return next;
    });
  }, []);

  const format = useCallback((ngn: number): string => {
    if (currency === "NGN") return `₦${Math.round(ngn).toLocaleString()}`;
    return `$${(ngn / usdToNgn).toFixed(2)}`;
  }, [currency, usdToNgn]);

  return { currency, usdToNgn, toggle, format };
}
