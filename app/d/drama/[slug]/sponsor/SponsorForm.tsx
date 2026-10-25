"use client";

import { useState } from "react";
import styles from "../../drama.module.css";

const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

/**
 * "Fund season one": a signed-in sponsor pays the quoted price through Paystack
 * (the quote is frozen on their sponsorship row); anyone can instead send the
 * owner a request (package season_funder) and get the payment link by email.
 */
export default function SponsorForm({ story, storyTitle, format, formatName, priceNgn, episodes, signedIn, admin, loginHref, defaultName }: {
  story: string; storyTitle: string; format: string; formatName: string; priceNgn: number; episodes: number;
  signedIn: boolean; admin: boolean; loginHref: string; defaultName: string;
}) {
  const [f, setF] = useState({ company: "", contactName: defaultName, email: "", phone: "", message: "", website: "" });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState<"request" | "paid" | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((cur) => ({ ...cur, [k]: e.target.value }));

  const pay = async () => {
    setError(""); setBusy("pay");
    try {
      const r = await fetch("/api/drama/sponsor", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: story, format, brandName: f.company, contactName: f.contactName, phone: f.phone, note: f.message }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Something went wrong. Try again in a minute.");
      if (j.url) { window.location.href = j.url; return; }
      setSent("paid");
    } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  };

  const ask = async () => {
    setError(""); setBusy("ask");
    try {
      const body = {
        ...f, package: "season_funder", story, budget: naira(priceNgn),
        message: `Fund season one of ${storyTitle}: ${episodes} episodes as ${formatName.toLowerCase()} (${format}), quoted ${naira(priceNgn)}.` + (f.message ? `\n\n${f.message}` : ""),
      };
      const r = await fetch("/api/drama/partner", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Something went wrong. Try again in a minute.");
      setSent("request");
    } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  };

  if (sent) {
    return (
      <div className={styles.panel}>
        <h2 className={styles.h2}>{sent === "paid" ? "You present season one" : "Thank you — we have it"}</h2>
        <p className={styles.p} style={{ margin: 0 }}>
          {sent === "paid"
            ? `${f.company} now presents season one of ${storyTitle}. We'll email the plan for your credits and your report.`
            : `We'll confirm the plan and send the payment link to ${f.email}, usually within a day. Production starts the day the payment lands.`}
        </p>
      </div>
    );
  }

  const needEmail = !signedIn;
  const ready = f.company.trim().length >= 2 && f.contactName.trim().length >= 2 && (!needEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email));

  return (
    <div className={styles.panel} style={{ display: "grid", gap: 16, position: "relative" }}>
      <p className={styles.p} style={{ margin: 0 }}>
        <strong>{storyTitle}</strong> · season one · {episodes} episodes · {formatName} · <strong>{naira(priceNgn)}</strong>
        {admin ? " · admin: no charge" : ""}
      </p>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Company or brand</span>
        <input className={styles.input} value={f.company} maxLength={80} onChange={set("company")} autoComplete="organization" />
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Your name</span>
        <input className={styles.input} value={f.contactName} maxLength={80} onChange={set("contactName")} autoComplete="name" />
      </label>
      {needEmail && (
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Email</span>
          <input className={styles.input} type="email" value={f.email} maxLength={120} onChange={set("email")} autoComplete="email" />
        </label>
      )}
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
      <div className={styles.actions}>
        {signedIn ? (
          <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={!!busy || !ready} onClick={pay}>
            {busy === "pay" ? "Opening Paystack…" : admin ? "Sponsor it (free, admin)" : `Pay ${naira(priceNgn)} now`}
          </button>
        ) : (
          <a className={`${styles.btn} ${styles.primary}`} href={loginHref}>Sign in with Google to pay now</a>
        )}
        <button type="button" className={`${styles.btn} ${styles.quiet}`} disabled={!!busy || !ready} onClick={ask}>
          {busy === "ask" ? "Sending…" : "Ask us first"}
        </button>
      </div>
      <p className={styles.small} style={{ margin: 0 }}>
        Paying holds the season for you at this price. “Ask us first” sends your details to the studio; we reply with the plan and a payment link.
      </p>
    </div>
  );
}
