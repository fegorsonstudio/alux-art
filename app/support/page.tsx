"use client";
import { useState } from "react";
import Link from "next/link";

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
    <div style={{ minHeight: "100vh", background: "#f9f9f7", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", padding: "48px 16px" }}>
      <div style={{ width: "100%", maxWidth: 520 }}>
        <Link href="/studio" style={{ fontSize: "0.85rem", color: "#666", textDecoration: "none", display: "inline-block", marginBottom: 24 }}>
          ← Back to Studio
        </Link>

        <h1 style={{ fontSize: "1.6rem", fontWeight: 700, marginBottom: 6, color: "#111" }}>Contact Support</h1>
        <p style={{ color: "#555", fontSize: "0.95rem", marginBottom: 32, lineHeight: 1.5 }}>
          Having trouble with a payment or shoot? Fill in the form below and we&apos;ll get back to you as soon as possible.
        </p>

        {status === "done" ? (
          <div style={{ background: "#e8f5ee", border: "1px solid #a8d8bc", borderRadius: 10, padding: "24px 20px", textAlign: "center" }}>
            <p style={{ fontWeight: 600, color: "#1a6b40", marginBottom: 8 }}>Message sent!</p>
            <p style={{ color: "#333", fontSize: "0.9rem" }}>We&apos;ve received your message and will reply to your email shortly.</p>
            <Link href="/studio" style={{ display: "inline-block", marginTop: 20, fontSize: "0.9rem", color: "#1a6b40" }}>← Go back to Studio</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Your name</label>
                <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} required placeholder="Full name" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Your email</label>
                <input style={inputStyle} type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Subject</label>
              <input style={inputStyle} value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Payment not confirmed, image issue…" />
            </div>

            <div>
              <label style={labelStyle}>Shoot ID <span style={{ color: "#999", fontWeight: 400 }}>(optional — copy from Studio → &quot;Copy support ref&quot;)</span></label>
              <input style={inputStyle} value={shootId} onChange={e => setShootId(e.target.value)} placeholder="e.g. 8ab238dd-1fac-..." />
            </div>

            <div>
              <label style={labelStyle}>Message</label>
              <textarea
                style={{ ...inputStyle, height: 130, resize: "vertical" }}
                value={message}
                onChange={e => setMessage(e.target.value)}
                required
                placeholder="Describe your issue in as much detail as possible…"
              />
            </div>

            {(status === "error") && (
              <p style={{ color: "#c00", fontSize: "0.85rem", margin: 0 }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={status === "loading"}
              style={{
                padding: "12px 24px", borderRadius: 8, border: "none",
                background: status === "loading" ? "#999" : "#111",
                color: "#fff", fontWeight: 600, fontSize: "0.95rem",
                cursor: status === "loading" ? "default" : "pointer",
                transition: "background 0.15s",
              }}
            >
              {status === "loading" ? "Sending…" : "Send message"}
            </button>
          </form>
        )}

        <p style={{ marginTop: 32, color: "#999", fontSize: "0.8rem" }}>
          You can also email us directly at{" "}
          <a href="mailto:aluxartandframes@gmail.com" style={{ color: "#555" }}>aluxartandframes@gmail.com</a>
        </p>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#333", marginBottom: 5,
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 7, border: "1px solid #ddd",
  fontSize: "0.9rem", background: "#fff", color: "#111", outline: "none",
  boxSizing: "border-box",
};
