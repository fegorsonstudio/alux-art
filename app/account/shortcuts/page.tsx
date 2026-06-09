"use client";

import { useState, useEffect } from "react";

interface Token {
  id: string;
  label: string;
  last_used_at: string | null;
  created_at: string;
}

export default function SiriShortcutsPage() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [label, setLabel] = useState("My iPhone");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchTokens(); }, []);

  async function fetchTokens() {
    try {
      const res = await fetch("/api/siri/token");
      if (!res.ok) throw new Error("Failed to load tokens.");
      const data = await res.json();
      setTokens(data.tokens); // API returns { tokens: [...] }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load tokens.");
    } finally {
      setFetching(false);
    }
  }

  async function generateToken(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNewToken(null);
    try {
      const res = await fetch("/api/siri/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate token.");
      setNewToken(data.token); // API returns { token, label } — shown once
      setLabel("My iPhone");
      fetchTokens();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to generate token.");
    } finally {
      setLoading(false);
    }
  }

  async function revokeToken(tokenId: string) {
    if (!confirm("Revoke this token? Your Shortcut using it will stop working immediately.")) return;
    try {
      const res = await fetch(`/api/siri/token/${tokenId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to revoke token.");
      fetchTokens();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to revoke token.");
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 text-slate-100">
      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Siri & Apple Intelligence Setup</h1>
        <p className="text-slate-400">
          Book editorial portraits completely hands-free using Siri Shortcuts.
        </p>
      </header>

      {error && (
        <div className="bg-red-950/40 border border-red-800 text-red-400 p-4 rounded-lg mb-6 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">

        {/* Token Management Panel */}
        <div className="space-y-8">
          <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-4">Generate Siri Access Token</h2>
            <p className="text-sm text-slate-400 mb-6">
              Create a dedicated token to bridge Apple Shortcuts securely with your account. Maximum 5 active devices.
            </p>

            <form onSubmit={generateToken} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Device Label
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  maxLength={60}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                  placeholder="e.g., My iPhone 15 Pro"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading || tokens.length >= 5}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 font-medium text-sm py-2.5 px-4 rounded-lg transition-colors"
              >
                {loading ? "Generating..." : tokens.length >= 5 ? "Token Limit Reached (Max 5)" : "Generate Token"}
              </button>
            </form>

            {newToken && (
              <div className="mt-6 p-4 bg-indigo-950/40 border border-indigo-500/30 rounded-lg">
                <p className="text-xs font-bold text-indigo-400 uppercase tracking-wide mb-1">
                  Copy This Key Now
                </p>
                <p className="text-xs text-slate-300 mb-3">
                  For your security, it will never be displayed again.
                </p>
                <div className="bg-slate-950 border border-slate-800 p-2.5 rounded font-mono text-xs select-all break-all text-indigo-200">
                  {newToken}
                </div>
              </div>
            )}
          </section>

          <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-4">Active Devices & Tokens</h2>
            {fetching ? (
              <p className="text-sm text-slate-500">Loading connections...</p>
            ) : tokens.length === 0 ? (
              <p className="text-sm text-slate-500 italic">No Siri tokens configured yet.</p>
            ) : (
              <div className="divide-y divide-slate-800">
                {tokens.map((t) => (
                  <div key={t.id} className="py-3.5 flex items-center justify-between first:pt-0 last:pb-0">
                    <div>
                      <h4 className="text-sm font-medium">{t.label}</h4>
                      <p className="text-xs text-slate-500">
                        Last active:{" "}
                        {t.last_used_at ? new Date(t.last_used_at).toLocaleDateString() : "Never used"}
                      </p>
                    </div>
                    <button
                      onClick={() => revokeToken(t.id)}
                      className="text-xs font-medium text-red-400 hover:text-red-300 transition-colors"
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Setup Instructions */}
        <div className="space-y-6">
          <h2 className="text-xl font-semibold">How to Install & Configure</h2>

          <ol className="relative border-l border-slate-800 space-y-6 ml-2">
            <li className="mb-10 ml-6">
              <span className="absolute flex items-center justify-center w-6 h-6 bg-slate-800 rounded-full -left-3 ring-8 ring-slate-950 text-xs font-bold text-slate-300">
                1
              </span>
              <h3 className="font-semibold text-sm text-slate-200 mb-1">Download Shortcut Template</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Open this link on your iPhone to add the Alux Quick Shoot shortcut to your library.
              </p>
              <a
                href="https://www.icloud.com/shortcuts/YOUR_SHORTCUT_LINK"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:underline mt-2"
              >
                Download &ldquo;Alux Quick Shoot&rdquo; Shortcut
              </a>
            </li>

            <li className="mb-10 ml-6">
              <span className="absolute flex items-center justify-center w-6 h-6 bg-slate-800 rounded-full -left-3 ring-8 ring-slate-950 text-xs font-bold text-slate-300">
                2
              </span>
              <h3 className="font-semibold text-sm text-slate-200 mb-1">Paste Your Access Token</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                When importing the shortcut it will ask for a token. Paste the key you generated on the left — it links the shortcut to your account.
              </p>
            </li>

            <li className="ml-6">
              <span className="absolute flex items-center justify-center w-6 h-6 bg-slate-800 rounded-full -left-3 ring-8 ring-slate-950 text-xs font-bold text-slate-300">
                3
              </span>
              <h3 className="font-semibold text-sm text-slate-200 mb-1">Screenshot a Template QR &amp; Trigger</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Screenshot any Alux template card so it is your last photo in the gallery. Then say:
              </p>
              <blockquote className="mt-2 p-2.5 bg-slate-950 border border-slate-800 rounded text-xs font-mono text-indigo-300 italic">
                &ldquo;Hey Siri, run Alux Quick Shoot&rdquo;
              </blockquote>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Siri scans the QR from your last photo, creates the booking, and opens the Paystack checkout — one Face ID tap to pay.
              </p>
            </li>
          </ol>
        </div>

      </div>
    </div>
  );
}
