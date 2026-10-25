"use client";

import { useState } from "react";
import styles from "../drama.module.css";

type Picked = { file: File; preview: string; name: string; url: string; note: string };
const MAX = 30 * 1024 * 1024;

async function upload(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("bucket", "identity-images");
  const up = await fetch("/api/upload/file", { method: "POST", body: fd });
  const j = await up.json().catch(() => ({}));
  if (!up.ok || !j.storagePath) throw new Error(j.error ?? "The upload did not go through.");
  return j.storagePath as string;
}

/** The brand's request: product pictures with names and links, who to reach, how to reach them. */
export default function BrandSeriesForm({ genres }: { genres: string[] }) {
  const [products, setProducts] = useState<Picked[]>([]);
  const [f, setF] = useState({ brandName: "", contactName: "", email: "", phone: "", instagram: "", city: "", genre: "", audience: "", message: "", website: "" });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((cur) => ({ ...cur, [k]: e.target.value }));
  const setP = (i: number, k: "name" | "url" | "note", v: string) => setProducts((cur) => cur.map((p, j) => (j === i ? { ...p, [k]: v } : p)));

  const add = (files: FileList | null) => {
    setError("");
    const next: Picked[] = [];
    for (const file of Array.from(files ?? [])) {
      if (!file.type.startsWith("image/") || /svg/.test(file.type)) { setError("Product pictures must be JPEG, PNG or WebP."); continue; }
      if (file.size > MAX) { setError(`${file.name} is over 30 MB.`); continue; }
      next.push({ file, preview: URL.createObjectURL(file), name: file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").slice(0, 60), url: "", note: "" });
    }
    setProducts((cur) => [...cur, ...next].slice(0, 12));
  };

  const submit = async () => {
    setError("");
    if (!products.length) { setError("Add at least one product picture."); return; }
    if (f.brandName.trim().length < 2 || f.contactName.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) { setError("Add your brand, your name and an email we can reply to."); return; }
    try {
      const sent: { name: string; url: string; note: string; path: string }[] = [];
      for (const [i, p] of products.entries()) {
        setBusy(`Sending picture ${i + 1} of ${products.length}…`);
        sent.push({ name: p.name, url: p.url, note: p.note, path: await upload(p.file) });
      }
      setBusy("Sending your request…");
      const r = await fetch("/api/drama/brand-series", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, products: sent }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Something went wrong. Try again in a minute.");
      setSent(true);
    } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  };

  if (sent) {
    return (
      <div className={styles.panel}>
        <h2 className={styles.h2}>Thank you — we have your products</h2>
        <p className={styles.p} style={{ margin: 0 }}>We’ll write the season and send you a link to read it, with the budget, at {f.email}, usually within two days.</p>
      </div>
    );
  }

  return (
    <div className={styles.panel} style={{ display: "grid", gap: 16, position: "relative" }}>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Your products</span>
        <label className={styles.drop}>
          <span>Add pictures — one product per picture, on a plain background if you can</span>
          <input type="file" accept="image/*" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        </label>
        {products.map((p, i) => (
          <div key={p.preview} className={styles.panel} style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: 10, padding: 10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.preview} alt="" style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 10 }} />
            <div style={{ display: "grid", gap: 6 }}>
              <input className={styles.input} value={p.name} maxLength={80} placeholder="Product name" onChange={(e) => setP(i, "name", e.target.value)} />
              <input className={styles.input} value={p.url} maxLength={400} inputMode="url" placeholder="Link to the product (optional)" onChange={(e) => setP(i, "url", e.target.value)} />
              <input className={styles.input} value={p.note} maxLength={300} placeholder="Anything we should know about it (optional)" onChange={(e) => setP(i, "note", e.target.value)} />
              <button type="button" className={`${styles.btn} ${styles.quiet} ${styles.small}`} onClick={() => setProducts((cur) => cur.filter((_, j) => j !== i))}>Remove</button>
            </div>
          </div>
        ))}
      </div>
      <label className={styles.field}><span className={styles.fieldLabel}>Brand</span><input className={styles.input} value={f.brandName} maxLength={80} onChange={set("brandName")} autoComplete="organization" /></label>
      <label className={styles.field}><span className={styles.fieldLabel}>Your name</span><input className={styles.input} value={f.contactName} maxLength={80} onChange={set("contactName")} autoComplete="name" /></label>
      <label className={styles.field}><span className={styles.fieldLabel}>Email</span><input className={styles.input} type="email" value={f.email} maxLength={120} onChange={set("email")} autoComplete="email" /></label>
      <label className={styles.field}><span className={styles.fieldLabel}>Phone or WhatsApp (optional)</span><input className={styles.input} value={f.phone} maxLength={30} inputMode="tel" onChange={set("phone")} /></label>
      <label className={styles.field}><span className={styles.fieldLabel}>Your Instagram (optional)</span><input className={styles.input} value={f.instagram} maxLength={60} placeholder="@yourbrand" onChange={set("instagram")} /></label>
      <div className={styles.split}>
        <label className={styles.field}><span className={styles.fieldLabel}>City (optional)</span><input className={styles.input} value={f.city} maxLength={40} placeholder="Lagos, Abuja, Enugu…" onChange={set("city")} /></label>
        <label className={styles.field}><span className={styles.fieldLabel}>Kind of story (optional)</span>
          <select className={styles.input} value={f.genre} onChange={set("genre")}>
            <option value="">Let the engine choose</option>
            {genres.map((g) => <option key={g} value={g}>{g === "romcom" ? "Romcom" : g[0].toUpperCase() + g.slice(1)}</option>)}
          </select>
        </label>
      </div>
      <label className={styles.field}><span className={styles.fieldLabel}>Who do you want to reach? (optional)</span><input className={styles.input} value={f.audience} maxLength={300} placeholder="For example: young professionals in Lagos who shop online" onChange={set("audience")} /></label>
      <label className={styles.field}><span className={styles.fieldLabel}>Anything else (optional)</span><textarea className={styles.input} rows={3} value={f.message} maxLength={1500} onChange={set("message")} /></label>
      <label className={styles.hp} aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} /></label>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={!!busy} onClick={submit}>{busy || "Write my series"}</button>
    </div>
  );
}
