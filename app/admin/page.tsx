"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import styles from "./admin.module.css";

interface AdminData {
  pricing: { ngn: number; usd: number };
  modelSlots: Array<{ slot: number; model: string; fallback: string; enabled: boolean }>;
  users: Array<{ id: string; email: string; display_name: string; banned: boolean; created_at: string }>;
  shoots: Array<{ id: string; status: string; owner_email: string; created_at: string }>;
  metrics: { totalUsers: number; totalShoots: number; completedShoots: number; queueDepth: number };
}

export default function AdminPage() {
  const [data, setData] = useState<AdminData | null>(null);
  const [pricingNgn, setPricingNgn] = useState("");
  const [pricingUsd, setPricingUsd] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/admin/overview")
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Unable to load dashboard");
        return d;
      })
      .then(d => {
        setData(d);
        setPricingNgn(String(d.pricing?.ngn ?? 15000));
        setPricingUsd(String(d.pricing?.usd ?? 10));
      })
      .catch(err => setMsg(err instanceof Error ? err.message : "Unable to load dashboard"));
  }, []);

  const savePricing = async () => {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/pricing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ngn: Number(pricingNgn), usd: Number(pricingUsd) }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Error saving");
      setData(prev => prev ? { ...prev, pricing: payload.pricing } : prev);
      setMsg("Saved!");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Error saving");
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(""), 3000);
    }
  };

  const toggleBan = async (userId: string, banned: boolean) => {
    await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, banned: !banned }),
    });
    setData(prev => prev ? { ...prev, users: prev.users.map(u => u.id === userId ? { ...u, banned: !banned } : u) } : prev);
  };

  if (!data) return <div className={styles.loading}>Loading dashboard…</div>;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.back}>← Studio</Link>
        <h1 className={styles.title}>Admin Dashboard</h1>
      </header>

      {/* Metrics */}
      <div className={styles.metricsGrid}>
        <div className={styles.metric}><span className={styles.metricVal}>{data.metrics?.totalUsers ?? 0}</span><span className={styles.metricLabel}>Users</span></div>
        <div className={styles.metric}><span className={styles.metricVal}>{data.metrics?.totalShoots ?? 0}</span><span className={styles.metricLabel}>Shoots</span></div>
        <div className={styles.metric}><span className={styles.metricVal}>{data.metrics?.completedShoots ?? 0}</span><span className={styles.metricLabel}>Completed</span></div>
        <div className={styles.metric}><span className={styles.metricVal}>{data.metrics?.queueDepth ?? 0}</span><span className={styles.metricLabel}>In Queue</span></div>
      </div>

      {/* Pricing */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Pricing</h2>
        <div className={styles.priceRow}>
          <label className={styles.priceLabel}>NGN (₦)</label>
          <input className={styles.priceInput} value={pricingNgn} onChange={e => setPricingNgn(e.target.value)} type="number" />
          <label className={styles.priceLabel}>USD ($)</label>
          <input className={styles.priceInput} value={pricingUsd} onChange={e => setPricingUsd(e.target.value)} type="number" />
          <button type="button" className={styles.saveBtn} onClick={savePricing} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
          {msg && <span className={styles.saveMsg}>{msg}</span>}
        </div>
      </div>

      {/* Recent Shoots */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Recent Shoots</h2>
        <table className={styles.table}>
          <thead><tr><th>ID</th><th>User</th><th>Status</th><th>Date</th></tr></thead>
          <tbody>
            {(data.shoots ?? []).slice(0, 20).map(s => (
              <tr key={s.id}>
                <td className={styles.mono}>{s.id.slice(0, 8)}…</td>
                <td>{s.owner_email}</td>
                <td><span className={styles.badge}>{s.status}</span></td>
                <td>{new Date(s.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Users */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Users</h2>
        <table className={styles.table}>
          <thead><tr><th>Email</th><th>Joined</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {(data.users ?? []).map(u => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>{new Date(u.created_at).toLocaleDateString()}</td>
                <td><span className={u.banned ? styles.bannedBadge : styles.activeBadge}>{u.banned ? "Banned" : "Active"}</span></td>
                <td><button className={styles.banBtn} onClick={() => toggleBan(u.id, u.banned)}>{u.banned ? "Unban" : "Ban"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

