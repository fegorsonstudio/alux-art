"use client";

import { useState } from "react";
import styles from "../../drama.module.css";

const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

/**
 * "Fund season one": the sponsor's details go to the owner as a partnership
 * request (package season_funder) with the quoted price and format attached.
 * The owner confirms and sends the payment link.
 */
export default function SponsorForm({ story, storyTitle, format, formatName, priceNgn, episodes }: {
  story: string; storyTitle: string; format: string; formatName: string; priceNgn: number; episodes: number;
}) {
  const [f, setF] = useState({ company: "", contactName: "", email: "", phone: "", message: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((cur) => ({ ...cur, [k]: e.target.value }));

  const submit = async () => {
    setError(""); setBusy(true);
    try {
      const body = {
        ...f,
        package: "season_funder",
        story,
        budget: naira(priceNgn),
        message: `Fund season one of ${storyTitle}: ${episodes} episodes as ${formatName.toLowerCase()} (${format}), quoted ${naira(priceNgn)}.` + (f.message ? `\n\n${f.message}` : ""),
      };
      const r = await fetch("/api/drama/partner", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Something went wrong. Try again in a minute.");
      setSent(true);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  if (sent) {
    return (
      <div className={styles.panel}>
        <h2 className={styles.h2}>Thank you — we have it</h2>
        <p className={styles.p} style={{ margin: 0 }}>We’ll confirm the plan and send the payment link to {f.email}, usually within a day. Production starts the day the payment lands.</p>
      </div>
    );
  }

  return (
    <div className={styles.panel} style={{ display: "grid", gap: 16, position: "relative" }}>
      <p className={styles.p} style={{ margin: 0 }}>
        <strong>{storyTitle}</strong> · season one · {episodes} episodes · {formatName} · <strong>{naira(priceNgn)}</strong>
      </p>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Company or brand</span>
        <input className={styles.input} value={f.company} maxLength={80} onChange={set("company")} autoComplete="organization" />
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Your name</span>
        <input className={styles.input} value={f.contactName} maxLength={80} onChange={set("contactName")} autoComplete="name" />
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Email</span>
        <input className={styles.input} type="email" value={f.email} maxLength={120} onChange={set("email")} autoComplete="email" />
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Phone or WhatsApp (optional)</span>
        <input className={styles.input} value={f.phone} maxLength={30} inputMode="tel" onChange={set("phone")} autoComplete="tel" />
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Anything we should know (optional)</span>
        <textarea className={styles.input} rows={3} value={f.message} maxLength={1200} onChange={set("message")} placeholder="Your product, who you want to reach, any dates" />
      </label>
      <label className={styles.hp} aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} /></label>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={busy} onClick={submit}>{busy ? "Sending…" : `Fund season one — ${naira(priceNgn)}`}</button>
    </div>
  );
}
