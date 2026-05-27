"use client";
import { useState } from "react";
import Link from "next/link";
import styles from "../legal.module.css";

export default function SupportPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [shootId, setShootId] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/support/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, shootId, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Failed to send. Please try again."); setStatus("error"); return; }
      setStatus("done");
    } catch {
      setError("Network error. Please try again.");
      setStatus("error");
    }
  };

  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <Link href="/" className={styles.navBrand}>Alux Art</Link>
        <Link href="/studio" className={styles.navLink}>Back to Studio</Link>
      </nav>

      <div className={styles.content}>
        <p className={styles.eyebrow}>Support</p>
        <h1 className={styles.title}>Contact Us</h1>

        {status === "done" ? (
          <div className={styles.successCard}>
            <p className={styles.successTitle}>Message sent</p>
            <p className={styles.successBody}>
              We&apos;ve received your message and will reply to your email shortly.
            </p>
            <Link href="/studio" className={styles.successLink}>← Back to Studio</Link>
            <div className={styles.directEmail}>
              Or email us directly at{" "}
              <a href="mailto:aluxartandframes@gmail.com">aluxartandframes@gmail.com</a>
            </div>
          </div>
        ) : (
          <div className={styles.formCard}>
            <p className={styles.formIntro}>
              Having trouble with a payment or shoot? Fill in the form below and we&apos;ll get
              back to you as soon as possible.
            </p>

            <form onSubmit={handleSubmit}>
              <div className={styles.formRow}>
                <div className={styles.formFieldNoMargin}>
                  <label className={styles.label}>Your name</label>
                  <input
                    className={styles.input}
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                    placeholder="Full name"
                  />
                </div>
                <div className={styles.formFieldNoMargin}>
                  <label className={styles.label}>Your email</label>
                  <input
                    className={styles.input}
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              <div className={styles.formField}>
                <label className={styles.label}>Subject</label>
                <input
                  className={styles.input}
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="e.g. Payment not confirmed, image issue…"
                />
              </div>

              <div className={styles.formField}>
                <label className={styles.label}>
                  Shoot ID{" "}
                  <span className={styles.labelNote}>
                    (optional — copy from Studio → &quot;Copy support ref&quot;)
                  </span>
                </label>
                <input
                  className={styles.input}
                  value={shootId}
                  onChange={e => setShootId(e.target.value)}
                  placeholder="e.g. 8ab238dd-1fac-…"
                />
              </div>

              <div className={styles.formField}>
                <label className={styles.label}>Message</label>
                <textarea
                  className={styles.textarea}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  required
                  placeholder="Describe your issue in as much detail as possible…"
                />
              </div>

              {status === "error" && (
                <p className={styles.formError}>{error}</p>
              )}

              <button
                type="submit"
                disabled={status === "loading"}
                className={styles.submitBtn}
              >
                {status === "loading" ? "Sending…" : "Send message"}
              </button>
            </form>

            <div className={styles.directEmail}>
              Or email us directly at{" "}
              <a href="mailto:aluxartandframes@gmail.com">aluxartandframes@gmail.com</a>
            </div>
          </div>
        )}
      </div>

      <footer className={styles.footer}>
        <span className={styles.footerBrand}>Alux Art</span>
        <span className={styles.footerNote}>© 2026 Alux Art and Frames. All rights reserved.</span>
      </footer>
    </div>
  );
}
