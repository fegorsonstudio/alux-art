"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./become-creator.module.css";
import { resizeIfNeeded } from "@/lib/resize-image";

interface Bank { name: string; code: string; }

export default function BecomeCreatorPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [banks, setBanks] = useState<Bank[]>([]);

  // Step 1 fields
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [avatarStoragePath, setAvatarStoragePath] = useState("");
  const [avatarPreview, setAvatarPreview] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarRef = useRef<HTMLInputElement>(null);

  // Step 2 fields
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [creatorId, setCreatorId] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/user/creator-status")
      .then(r => r.ok ? r.json() : { isCreator: false })
      .then(d => { if (d.isCreator) router.push("/creator-dashboard"); })
      .catch(() => {});
  }, [router]);

  useEffect(() => {
    fetch("/api/paystack/banks")
      .then(r => r.json())
      .then(d => { if (d.banks) setBanks(d.banks); })
      .catch(() => {});
  }, []);

  const uploadAvatar = async (file: File) => {
    setUploadingAvatar(true);
    const f = await resizeIfNeeded(file);
    const form = new FormData();
    form.append("file", f, f.name);
    form.append("bucket", "template-images");
    const res = await fetch("/api/upload/file", { method: "POST", body: form });
    if (!res.ok) { setUploadingAvatar(false); return; }
    const { storagePath } = await res.json();
    setAvatarStoragePath(storagePath);
    setAvatarPreview(URL.createObjectURL(file));
    setUploadingAvatar(false);
  };

  const submitStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!displayName.trim()) { setError("Display name is required"); return; }
    setSubmitting(true);
    const res = await fetch("/api/creators", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, bio, avatarStoragePath: avatarStoragePath || undefined, instagramUrl, websiteUrl }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401) { router.push("/login?redirect=/become-creator"); return; }
      setError(data.error ?? "Failed to create profile");
      setSubmitting(false);
      return;
    }
    setCreatorId(data.creator.id);
    setSubmitting(false);
    setStep(2);
  };

  const submitStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!bankCode || !accountNumber || !accountName) {
      setError("Please complete all bank fields");
      return;
    }
    setSubmitting(true);
    const res = await fetch("/api/paystack/subaccount", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bankCode, accountNumber, accountName }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to set up payouts");
      setSubmitting(false);
      return;
    }
    setStep(3);
  };

  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <Link href="/marketplace" className={styles.back}>← Marketplace</Link>
        <Link href="/" className={styles.navBrand}>Alux Art</Link>
      </header>

      <div className={styles.container}>
        <div className={styles.stepBar}>
          <div className={`${styles.stepDot} ${step >= 1 ? styles.stepDotActive : ""}`}>1</div>
          <div className={styles.stepLine} />
          <div className={`${styles.stepDot} ${step >= 2 ? styles.stepDotActive : ""}`}>2</div>
        </div>
        <div className={styles.stepLabels}>
          <span className={step === 1 ? styles.stepLabelActive : styles.stepLabel}>Profile</span>
          <span className={step === 2 ? styles.stepLabelActive : styles.stepLabel}>Payouts</span>
        </div>

        <h1 className={styles.title}>{step === 1 ? "Create your creator profile" : "Set up payouts"}</h1>
        <p className={styles.sub}>{step === 1 ? "Tell buyers who you are." : "We need your bank details to pay you when customers book your styles."}</p>

        {error && <p className={styles.error}>{error}</p>}

        {step === 1 && (
          <form className={styles.form} onSubmit={submitStep1}>
            <div className={styles.avatarSection}>
              <div className={styles.avatarPreview} onClick={() => avatarRef.current?.click()} role="button" tabIndex={0} onKeyDown={e => e.key === "Enter" && avatarRef.current?.click()}>
                {avatarPreview
                  ? <img src={avatarPreview} alt="Avatar" className={styles.avatarImg} />
                  : <span className={styles.avatarPlaceholder}>{uploadingAvatar ? "Uploading..." : "Add photo"}</span>
                }
              </div>
              <input type="file" accept="image/*" ref={avatarRef} className={styles.hidden} onChange={e => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); }} />
            </div>

            <label className={styles.field}>
              <span className={styles.label}>Display name *</span>
              <input className={styles.input} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your name or brand" maxLength={60} />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Bio</span>
              <textarea className={`${styles.input} ${styles.textarea}`} value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell buyers about your style..." rows={3} maxLength={400} />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Instagram URL</span>
              <input className={styles.input} value={instagramUrl} onChange={e => setInstagramUrl(e.target.value)} placeholder="https://instagram.com/yourhandle" type="url" />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Website</span>
              <input className={styles.input} value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)} placeholder="https://yourwebsite.com" type="url" />
            </label>

            <button type="submit" className={styles.submitBtn} disabled={submitting}>
              {submitting ? "Creating profile..." : "Continue to payouts →"}
            </button>
          </form>
        )}

        {step === 2 && (
          <form className={styles.form} onSubmit={submitStep2}>
            <p className={styles.payNote}>
              Your earnings will be sent directly to your bank account through Paystack after each successful booking.
            </p>

            <label className={styles.field}>
              <span className={styles.label}>Bank *</span>
              <select className={styles.input} value={bankCode} onChange={e => setBankCode(e.target.value)}>
                <option value="">Select your bank</option>
                {banks.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Account number *</span>
              <input className={styles.input} value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder="0123456789" maxLength={10} />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Account name (as registered with bank) *</span>
              <input className={styles.input} value={accountName} onChange={e => setAccountName(e.target.value)} placeholder="JOHN DOE" />
            </label>

            <div className={styles.btnRow}>
              <button type="button" className={styles.backBtn} onClick={() => setStep(1)}>← Back</button>
              <button type="submit" className={styles.submitBtn} disabled={submitting}>
                {submitting ? "Setting up..." : "Complete setup →"}
              </button>
            </div>

            <p className={styles.payFootNote}>Payment processing by Paystack. Alux Art does not store your bank credentials.</p>
          </form>
        )}

        {step === 3 && (
          <div className={styles.successBox}>
            <div className={styles.successIcon}>✓</div>
            <h2 className={styles.successTitle}>Application received!</h2>
            <p className={styles.successBody}>
              We&apos;ll review your application and email you within 48 hours.
              Once approved, you can log in and start building your templates.
            </p>
            <Link href="/marketplace" className={styles.backToMarketplace}>Browse the marketplace →</Link>
          </div>
        )}
      </div>
    </div>
  );
}
