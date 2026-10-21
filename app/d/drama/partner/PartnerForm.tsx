"use client";

import { useState } from "react";
import styles from "../drama.module.css";

type Pkg = { key: string; name: string; note: string };

/** The partnership request: what the company wants, how to reach them. The owner replies by hand. */
export default function PartnerForm({ packages, stories, defaultStory }: { packages: Pkg[]; stories: { slug: string; title: string }[]; defaultStory: string }) {
  const [f, setF] = useState({ company: "", contactName: "", email: "", phone: "", package: "episode_sponsor", story: defaultStory, budget: "", message: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((cur) => ({ ...cur, [k]: e.target.value }));

  const submit = async () => {
    setError(""); setBusy(true);
    try {
      const r = await fetch("/api/drama/partner", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Something went wrong. Try again in a minute.");
      setSent(true);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  if (sent) {
    return (
      <div className={styles.panel}>
        <h2 className={styles.h2}>Thank you — we have it</h2>
        <p className={styles.p} style={{ margin: 0 }}>We’ll reply to {f.email} with a plan and a price, usually within a day.</p>
      </div>
    );
  }

  return (
    <div className={styles.panel} style={{ display: "grid", gap: 16, position: "relative" }}>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>What you have in mind</span>
        <div className={styles.pkgList} role="radiogroup">
          {packages.map((p) => (
            <label key={p.key} className={styles.pkg}>
              <input type="radio" name="package" value={p.key} checked={f.package === p.key} onChange={set("package")} />
              <span><p className={styles.pkgName}>{p.name}</p><p className={styles.pkgNote}>{p.note}</p></span>
            </label>
          ))}
        </div>
      </div>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Company</span>
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
        <span className={styles.fieldLabel}>Story (optional)</span>
        <select className={styles.input} value={f.story} onChange={set("story")}>
          <option value="">Any story — or a new one</option>
          {stories.map((s) => <option key={s.slug} value={s.slug}>{s.title}</option>)}
        </select>
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Budget (optional)</span>
        <input className={styles.input} value={f.budget} maxLength={80} onChange={set("budget")} placeholder="For example ₦300,000" />
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Tell us about it</span>
        <textarea className={styles.input} rows={4} value={f.message} maxLength={1500} onChange={set("message")} placeholder="Your product, who you want to reach, any dates" />
      </label>
      <label className={styles.hp} aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} /></label>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={busy} onClick={submit}>{busy ? "Sending…" : "Send"}</button>
    </div>
  );
}
