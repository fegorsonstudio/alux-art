"use client";

import { useState } from "react";
import styles from "./drama.module.css";

/**
 * The two checkouts of the game: play a role (one photo of your face) or put
 * a brand in a scene (a product picture). Uploads go through the site's normal
 * upload route into identity-images; paying copies them somewhere that lasts
 * the whole story (lib/drama/payments.ts).
 */
type Props =
  | { mode: "cast"; slug: string; role: string; roleName: string; priceLabel: string; admin: boolean; defaultName: string }
  | { mode: "brand"; slug: string; episode: number; slot: string; slotLabel: string; priceLabel: string; admin: boolean; defaultName: string };

export default function CheckoutForm(p: Props) {
  const [name, setName] = useState(p.defaultName);
  const [brand, setBrand] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const pick = (f: File | null) => {
    setError("");
    if (!f) return;
    if (!f.type.startsWith("image/") || /svg/.test(f.type)) { setError("Choose a photo (JPEG, PNG or HEIC)."); return; }
    if (f.size > 30 * 1024 * 1024) { setError("That photo is over 30 MB. Choose a smaller one."); return; }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const submit = async () => {
    setError("");
    if (!file) { setError(p.mode === "cast" ? "Add a clear photo of your face." : "Add a picture of your product or logo."); return; }
    if (p.mode === "brand" && brand.trim().length < 2) { setError("Add your brand name."); return; }
    if (name.trim().length < 2) { setError(p.mode === "cast" ? "Add the name to credit you by." : "Add a contact name."); return; }
    if (!agree) { setError("Tick the box to confirm."); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("bucket", "identity-images");
      const up = await fetch("/api/upload/file", { method: "POST", body: fd });
      const upJson = await up.json().catch(() => ({}));
      if (!up.ok || !upJson.storagePath) throw new Error(upJson.error ?? "The upload did not go through.");
      const res = await fetch(p.mode === "cast" ? "/api/drama/join" : "/api/drama/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p.mode === "cast"
          ? { slug: p.slug, role: p.role, displayName: name, photoPath: upJson.storagePath }
          : { slug: p.slug, episode: p.episode, slot: p.slot, brandName: brand, contactName: name, phone, productPath: upJson.storagePath, note }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error ?? "Something went wrong.");
      if (out.url) { window.location.href = out.url; return; }
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className={styles.panel}>
        <h2 className={styles.h2}>{p.mode === "cast" ? "You're in the cast" : "Your slot is held"}</h2>
        <p className={styles.p}>{p.mode === "cast"
          ? "We check your photo, then make your character sheet. You'll see yourself when your character first appears."
          : "We check your picture and place your product in the scene. You'll see it before the episode posts."}</p>
        <a className={`${styles.btn} ${styles.primary}`} href={`/d/drama/${p.slug}`}>Back to the story</a>
      </div>
    );
  }

  return (
    <div className={styles.panel} style={{ display: "grid", gap: 16 }}>
      {p.mode === "brand" && (
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Brand name</span>
          <input className={styles.input} value={brand} maxLength={60} onChange={(e) => setBrand(e.target.value)} placeholder="As it should appear in the credit" />
        </label>
      )}
      <label className={styles.field}>
        <span className={styles.fieldLabel}>{p.mode === "cast" ? "Your name, as credited" : "Contact name"}</span>
        <input className={styles.input} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
      </label>
      {p.mode === "brand" && (
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Phone (optional)</span>
          <input className={styles.input} value={phone} maxLength={30} inputMode="tel" onChange={(e) => setPhone(e.target.value)} />
        </label>
      )}
      <div className={styles.field}>
        <span className={styles.fieldLabel}>{p.mode === "cast" ? "One clear photo of your face" : "Your product or logo"}</span>
        <label className={styles.drop}>
          {preview
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={preview} alt="" className={styles.dropImg} />
            : <span>{p.mode === "cast" ? "Face the camera, good light, nothing covering your face" : "A clean photo on a plain background works best"}</span>}
          <input type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0] ?? null)} />
        </label>
      </div>
      {p.mode === "brand" && (
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Anything we should know (optional)</span>
          <textarea className={styles.input} rows={3} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </label>
      )}
      <label className={styles.check}>
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>{p.mode === "cast"
          ? `I am 18 or older, this is my own face, and Alux may show my character in this story on Instagram and this site. My photo is kept until the story ends.`
          : `I own this brand or have the right to advertise it, and Alux may show it in this episode with a partner credit.`}</span>
      </label>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={busy} onClick={submit}>
        {busy ? "Working…" : p.admin ? "Add it free (admin test)" : `Pay ${p.priceLabel} and ${p.mode === "cast" ? "join" : "reserve"}`}
      </button>
      <p className={styles.sectionNote}>{p.mode === "cast" ? `Playing ${p.roleName}.` : p.slotLabel} Payment by Paystack — card, bank transfer or USSD.</p>
    </div>
  );
}
