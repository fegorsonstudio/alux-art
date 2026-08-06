"use client";

import { useEffect, useState } from "react";
import styles from "./creator-dashboard.module.css";

/**
 * Connect a creator's own WhatsApp Business number, so customers can book a
 * shoot by messaging them directly.
 *
 * The two values are pasted rather than granted through a one-click flow
 * because Meta requires Tech Provider status and App Review before one app may
 * manage another business's WhatsApp account. When that is approved this panel
 * gains a button and the same two columns get written either way.
 *
 * The token is write-only here: it is never sent back to the browser, so the
 * field shows empty even when a number is connected.
 */

type Status = {
  connected: boolean;
  phoneNumberId: string | null;
  conversations: number;
  webhookUrl: string;
};

export default function WhatsAppPanel() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/creator-dashboard/whatsapp")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setStatus(d))
      .catch(() => {});
  }, []);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/creator-dashboard/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumberId: phoneNumberId.trim(), accessToken: accessToken.trim() }),
      });
      const d = await r.json();
      if (!r.ok) {
        setMsg({ kind: "error", text: d.error ?? "That didn't work." });
        return;
      }
      setMsg({ kind: "ok", text: d.number ? `Connected ${d.number}${d.name ? ` (${d.name})` : ""}.` : "Connected." });
      setAccessToken("");
      setStatus((s) => (s ? { ...s, connected: true, phoneNumberId: phoneNumberId.trim() } : s));
    } catch {
      setMsg({ kind: "error", text: "Couldn't reach the server. Try again." });
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setMsg(null);
    try {
      await fetch("/api/creator-dashboard/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disconnect: true }),
      });
      setStatus((s) => (s ? { ...s, connected: false, phoneNumberId: null } : s));
      setPhoneNumberId("");
      setMsg({ kind: "ok", text: "Disconnected. Customers messaging that number won't get a reply." });
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;

  return (
    <div className={styles.storefrontSection}>
      <button type="button" className={styles.storefrontToggle} onClick={() => setOpen((o) => !o)}>
        <span>
          WhatsApp bookings{" "}
          <span style={{ opacity: 0.7, fontWeight: 400, fontSize: "0.85em" }}>
            {status.connected
              ? `· connected${status.conversations ? ` · ${status.conversations} chat${status.conversations === 1 ? "" : "s"}` : ""}`
              : "· not set up"}
          </span>
        </span>
        <span aria-hidden>{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div style={{ padding: "4px 2px 8px", display: "grid", gap: 14 }}>
          <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.55, opacity: 0.85 }}>
            Connect your own WhatsApp Business number and customers can book a shoot by
            messaging you. The bot shows your styles, collects their photos, takes payment
            and sends the finished images back in the chat.
          </p>

          {status.connected ? (
            <>
              <p style={{ margin: 0, fontSize: "0.9rem" }}>
                Connected to phone number ID <code>{status.phoneNumberId}</code>.
              </p>
              <div>
                <button type="button" onClick={disconnect} disabled={busy} className={styles.storefrontToggle}
                  style={{ width: "auto", padding: "8px 14px", opacity: busy ? 0.6 : 1 }}>
                  {busy ? "Disconnecting…" : "Disconnect"}
                </button>
              </div>
            </>
          ) : (
            <>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: "0.88rem", lineHeight: 1.7, opacity: 0.85 }}>
                <li>Set up a WhatsApp Business Account at developers.facebook.com</li>
                <li>Use a phone number that is <strong>not</strong> signed into the normal WhatsApp app</li>
                <li>Copy the <strong>phone number ID</strong> and a <strong>permanent access token</strong></li>
                <li>Paste both below</li>
              </ol>

              <div>
                <label className={styles.label} htmlFor="wa-phone-id">Phone number ID</label>
                <input id="wa-phone-id" className={styles.input} value={phoneNumberId} inputMode="numeric"
                  onChange={(e) => setPhoneNumberId(e.target.value)} placeholder="e.g. 123456789012345" />
                <p style={{ margin: "4px 0 0", fontSize: "0.78rem", opacity: 0.65 }}>
                  The numeric ID from Meta, not your phone number.
                </p>
              </div>

              <div>
                <label className={styles.label} htmlFor="wa-token">Permanent access token</label>
                <input id="wa-token" className={styles.input} type="password" value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)} placeholder="Paste the token" autoComplete="off" />
                <p style={{ margin: "4px 0 0", fontSize: "0.78rem", opacity: 0.65 }}>
                  Stored securely and never shown again after saving.
                </p>
              </div>

              <div>
                <button type="button" onClick={save} disabled={busy || !phoneNumberId || !accessToken}
                  className={styles.storefrontToggle}
                  style={{ width: "auto", padding: "9px 16px", opacity: busy || !phoneNumberId || !accessToken ? 0.5 : 1 }}>
                  {busy ? "Checking with Meta…" : "Connect number"}
                </button>
              </div>
            </>
          )}

          {msg && (
            <p style={{ margin: 0, fontSize: "0.86rem", color: msg.kind === "ok" ? "#2f7d5f" : "#b4453a" }}>
              {msg.text}
            </p>
          )}

          <details style={{ fontSize: "0.82rem", opacity: 0.75 }}>
            <summary style={{ cursor: "pointer" }}>Webhook details (for Meta setup)</summary>
            <p style={{ margin: "8px 0 0" }}>
              Callback URL: <code>{status.webhookUrl}</code>
              <br />
              Subscribe to the <code>messages</code> field. Ask us for the verify token.
            </p>
          </details>
        </div>
      )}
    </div>
  );
}
