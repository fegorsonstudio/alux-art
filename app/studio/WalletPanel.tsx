"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "../workspace.module.css";

/**
 * The wallet, on the website.
 *
 * Self-contained on purpose: it fetches its own data and owns its own state, so
 * dropping it into the studio page costs that page one line and cannot disturb
 * the shoot flow around it.
 *
 * The refund rule is not written here. It arrives from /api/wallet, which reads
 * the same constant the chat bot and the payment description read, so the three
 * cannot end up wording it differently.
 */

type Movement = { amount: string; credit: boolean; what: string; when: string };
type Wallet = { balanceNgn: number; balance: string; terms: string; history: Movement[] };

const AMOUNTS = [1000, 5000, 10000, 20000];

export default function WalletPanel() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/wallet", { cache: "no-store" });
      if (!res.ok) return;                        // signed out: show nothing at all
      setWallet(await res.json());
    } catch { /* offline — the panel simply stays hidden */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Coming back from Paystack, the money lands via the webhook a moment later.
  // Re-reading on return is what makes the new balance appear without a manual
  // refresh, which is the first thing anybody does after paying.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!new URLSearchParams(window.location.search).has("wallet")) return;
    setOpen(true);
    const timers = [1500, 4000, 9000].map((ms) => window.setTimeout(() => void load(), ms));
    return () => timers.forEach(clearTimeout);
  }, [load]);

  const topUp = useCallback(async (amountNgn: number) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/wallet/topup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountNgn }),
      });
      const data = await res.json();
      if (!res.ok || !data.authorizationUrl) {
        setError(data.error ?? "Could not start that top-up. Please try again.");
        return;
      }
      window.location.href = data.authorizationUrl;
    } catch {
      setError("Could not reach the payment page. Please try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  if (!wallet) return null;

  return (
    <div className={styles.panel}>
      <div className={styles.panelTitleRow}>
        <p className={styles.panelTitle}>Wallet</p>
        <button className={styles.clearLibBtn} onClick={() => setOpen((v) => !v)}>
          {open ? "Close" : "Top up"}
        </button>
      </div>

      <p style={{ margin: "2px 0 6px", fontSize: "1.6rem", fontWeight: 800, letterSpacing: "-0.02em" }}>
        {wallet.balance}
      </p>

      <p className={styles.helperText}>
        {wallet.balanceNgn > 0
          ? "This comes off your next shoot automatically — no card needed."
          : "Add money once, then book without entering card details each time."}
      </p>

      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
          {/* The rule sits ABOVE the buttons, not behind a tooltip and not after
              payment. A prepaid balance generates disputes when the terms are
              discovered at refund time, and a dispute costs more than the refund. */}
          <p className={styles.helperText} style={{ margin: 0 }}>💳 {wallet.terms}</p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
            {AMOUNTS.map((amount) => (
              <button
                key={amount}
                className={styles.payBtn}
                style={{ fontSize: "0.92rem", padding: "11px 8px" }}
                disabled={busy}
                onClick={() => void topUp(amount)}
              >
                ₦{amount.toLocaleString("en-NG")}
              </button>
            ))}
          </div>

          {error && (
            <p className={styles.helperText} style={{ color: "#a9544d", margin: 0 }}>{error}</p>
          )}
        </div>
      )}

      {wallet.history.length > 0 && (
        <details style={{ marginTop: 4 }}>
          <summary className={styles.helperText} style={{ cursor: "pointer", margin: 0 }}>
            Recent activity
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {wallet.history.map((h, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: "0.76rem" }}>
                <span style={{ color: "#5d7a80" }}>
                  {h.what}
                  <span style={{ opacity: 0.65 }}>
                    {" · "}{new Date(h.when).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
                  </span>
                </span>
                <span style={{ fontWeight: 700, color: h.credit ? "#2f7d6b" : "#5d7a80", whiteSpace: "nowrap" }}>
                  {h.amount}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
