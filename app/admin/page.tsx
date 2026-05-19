"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import styles from "./admin.module.css";

interface Coupon {
  id: string;
  code: string;
  description?: string;
  discount_type: string;
  discount_value: number;
  max_uses: number | null;
  use_count: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

interface AdminCreator {
  id: string;
  display_name: string;
  bank_name: string | null;
  account_name: string | null;
  paystack_subaccount_code: string | null;
  is_active: boolean;
  templateCount: number;
  created_at: string;
}

interface AdminData {
  pricing: { ngn: number; usd: number };
  modelSlots: Array<{ slot: number; model: string; fallback: string; enabled: boolean }>;
  users: Array<{ id: string; email: string; display_name: string; banned: boolean; created_at: string }>;
  shoots: Array<{ id: string; status: string; owner_email: string; created_at: string }>;
  metrics: { totalUsers: number; totalShoots: number; completedShoots: number; queueDepth: number };
}

interface ModelConfig {
  vision_model: "gemini" | "claude";
  generation_model: "nano-banana" | "seedream";
  locked_base_rollout_percent: number;
  locked_base_enabled: boolean;
}

export default function AdminPage() {
  const [data, setData] = useState<AdminData | null>(null);
  const [pricingNgn, setPricingNgn] = useState("");
  const [pricingUsd, setPricingUsd] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [modelConfig, setModelConfig] = useState<ModelConfig>({ vision_model: "gemini", generation_model: "nano-banana", locked_base_rollout_percent: 100, locked_base_enabled: false });
  const [rolloutInput, setRolloutInput] = useState("100");
  const [modelSaving, setModelSaving] = useState(false);
  const [modelMsg, setModelMsg] = useState("");

  // Coupon state
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [couponCode, setCouponCode] = useState("");
  const [couponDesc, setCouponDesc] = useState("");
  const [couponType, setCouponType] = useState<"percent" | "fixed">("percent");
  const [couponValue, setCouponValue] = useState("");
  const [couponMaxUses, setCouponMaxUses] = useState("");
  const [couponExpires, setCouponExpires] = useState("");
  const [couponSaving, setCouponSaving] = useState(false);
  const [couponMsg, setCouponMsg] = useState("");

  // Creators state
  const [adminCreators, setAdminCreators] = useState<AdminCreator[]>([]);

  useEffect(() => {
    fetch("/api/admin/coupons")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.coupons) setCoupons(d.coupons); })
      .catch(() => {});
    fetch("/api/admin/creators")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.creators) setAdminCreators(d.creators); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/admin/config")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { setModelConfig(d); setRolloutInput(String(d.locked_base_rollout_percent ?? 100)); } })
      .catch(() => {});
  }, []);

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

  const saveModelConfig = async (patch: Partial<ModelConfig>) => {
    setModelSaving(true);
    setModelMsg("");
    try {
      const next = { ...modelConfig, ...patch };
      const res = await fetch("/api/admin/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Error saving");
      setModelConfig(next);
      setModelMsg("Saved!");
    } catch (err) {
      setModelMsg(err instanceof Error ? err.message : "Error saving");
    } finally {
      setModelSaving(false);
      setTimeout(() => setModelMsg(""), 3000);
    }
  };

  const createCoupon = async () => {
    if (!couponCode.trim() || !couponValue) { setCouponMsg("Code and value are required"); return; }
    setCouponSaving(true);
    setCouponMsg("");
    try {
      const res = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: couponCode.trim().toUpperCase(),
          description: couponDesc.trim() || undefined,
          discountType: couponType,
          discountValue: Number(couponValue),
          maxUses: couponMaxUses ? Number(couponMaxUses) : undefined,
          expiresAt: couponExpires || undefined,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Error creating coupon");
      setCoupons(prev => [payload.coupon, ...prev]);
      setCouponCode(""); setCouponDesc(""); setCouponValue(""); setCouponMaxUses(""); setCouponExpires("");
      setCouponMsg("Coupon created!");
    } catch (err) {
      setCouponMsg(err instanceof Error ? err.message : "Error");
    } finally {
      setCouponSaving(false);
      setTimeout(() => setCouponMsg(""), 4000);
    }
  };

  const toggleCoupon = async (id: string, isActive: boolean) => {
    await fetch(`/api/admin/coupons/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    setCoupons(prev => prev.map(c => c.id === id ? { ...c, is_active: !isActive } : c));
  };

  const deleteCoupon = async (id: string) => {
    if (!confirm("Delete this coupon?")) return;
    await fetch(`/api/admin/coupons/${id}`, { method: "DELETE" });
    setCoupons(prev => prev.filter(c => c.id !== id));
  };

  const toggleCreator = async (id: string, isActive: boolean) => {
    await fetch("/api/admin/creators", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isActive: !isActive }),
    });
    setAdminCreators(prev => prev.map(c => c.id === id ? { ...c, is_active: !isActive } : c));
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

      {/* Model Config */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>AI Model Config</h2>
        <div className={styles.modelGrid}>
          <div className={styles.modelSection}>
            <div className={styles.modelLabel}>Vision Agent (brief building)</div>
            <div className={styles.modelPills}>
              {(["gemini", "claude"] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  className={`${styles.modelPill} ${modelConfig.vision_model === m ? styles.modelPillActive : ""}`}
                  onClick={() => saveModelConfig({ vision_model: m })}
                  disabled={modelSaving}
                >
                  {m === "gemini" ? "Gemini 2.5 Flash" : "Claude Sonnet / Opus"}
                </button>
              ))}
            </div>
            <div className={styles.modelHint}>
              {modelConfig.vision_model === "gemini"
                ? "Gemini 2.5 Flash analyzes identity images and builds shoot briefs."
                : "Claude Sonnet (identity) + Claude Opus (brief) handles vision tasks."}
            </div>
          </div>
          <div className={styles.modelSection}>
            <div className={styles.modelLabel}>Image Generation Model</div>
            <div className={styles.modelPills}>
              {(["nano-banana", "seedream"] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  className={`${styles.modelPill} ${modelConfig.generation_model === m ? styles.modelPillActive : ""}`}
                  onClick={() => saveModelConfig({ generation_model: m })}
                  disabled={modelSaving}
                >
                  {m === "nano-banana" ? "Flux Kontext (nano-banana)" : "SeedDream 4 (Bytedance)"}
                </button>
              ))}
            </div>
            <div className={styles.modelHint}>
              {modelConfig.generation_model === "nano-banana"
                ? "fal-ai/nano-banana-2/edit — Flux Kontext, strong identity lock."
                : "fal-ai/bytedance/seedream/v4/edit — SeedDream 4, multi-image editing."}
            </div>
          </div>
        </div>
        <div className={styles.modelSection}>
          <div className={styles.modelLabel}>Base-lock Feature</div>
          <div className={styles.modelPills}>
            {([true, false] as const).map(val => (
              <button
                key={String(val)}
                type="button"
                className={`${styles.modelPill} ${modelConfig.locked_base_enabled === val ? styles.modelPillActive : ""}`}
                onClick={() => saveModelConfig({ locked_base_enabled: val })}
                disabled={modelSaving}
              >
                {val ? "Enabled" : "Disabled"}
              </button>
            ))}
          </div>
          <div className={styles.modelHint}>
            {modelConfig.locked_base_enabled
              ? "Base-lock is ON — new shoots will generate a locked character reference before processing."
              : "Base-lock is OFF — shoots skip the base image step and go straight to generation."}
          </div>
        </div>
        <div className={styles.modelSection}>
          <div className={styles.modelLabel}>Base-lock Rollout — {rolloutInput}% of new shoots</div>
          <div className={styles.rolloutRow}>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={rolloutInput}
              className={styles.rolloutSlider}
              onChange={e => setRolloutInput(e.target.value)}
            />
            <input
              type="number"
              min={0}
              max={100}
              value={rolloutInput}
              className={styles.rolloutNumber}
              onChange={e => setRolloutInput(e.target.value)}
            />
            <button
              type="button"
              className={styles.saveBtn}
              onClick={() => saveModelConfig({ locked_base_rollout_percent: Number(rolloutInput) })}
              disabled={modelSaving}
            >
              {modelSaving ? "Saving…" : "Save"}
            </button>
          </div>
          <div className={styles.modelHint}>
            0% = locked base disabled for all. 100% = every shoot uses base-lock. Values in between are deterministic per shoot ID.
          </div>
        </div>
        {modelMsg && <span className={styles.saveMsg}>{modelMsg}</span>}
        {modelSaving && <span className={styles.saveMsg}>Saving…</span>}
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

      {/* Coupons */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Coupon Codes</h2>
        <div className={styles.couponForm}>
          <input className={styles.priceInput} style={{ width: 110 }} placeholder="CODE" value={couponCode} onChange={e => setCouponCode(e.target.value.toUpperCase())} maxLength={20} />
          <input className={styles.priceInput} style={{ width: 200 }} placeholder="Description (optional)" value={couponDesc} onChange={e => setCouponDesc(e.target.value)} />
          <select className={styles.priceInput} value={couponType} onChange={e => setCouponType(e.target.value as "percent" | "fixed")}>
            <option value="percent">% off platform fee</option>
            <option value="fixed">₦ off platform fee</option>
          </select>
          <input className={styles.priceInput} style={{ width: 80 }} type="number" placeholder={couponType === "percent" ? "%" : "₦"} value={couponValue} onChange={e => setCouponValue(e.target.value)} min={1} max={couponType === "percent" ? 100 : undefined} />
          <input className={styles.priceInput} style={{ width: 80 }} type="number" placeholder="Max uses" value={couponMaxUses} onChange={e => setCouponMaxUses(e.target.value)} />
          <input className={styles.priceInput} style={{ width: 140 }} type="datetime-local" value={couponExpires} onChange={e => setCouponExpires(e.target.value)} />
          <button type="button" className={styles.saveBtn} onClick={createCoupon} disabled={couponSaving}>{couponSaving ? "Creating..." : "Create"}</button>
          {couponMsg && <span className={styles.saveMsg}>{couponMsg}</span>}
        </div>
        <table className={styles.table} style={{ marginTop: 16 }}>
          <thead><tr><th>Code</th><th>Type</th><th>Value</th><th>Uses</th><th>Expires</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {coupons.map(c => (
              <tr key={c.id}>
                <td className={styles.mono}>{c.code}</td>
                <td>{c.discount_type === "percent" ? `${c.discount_value}%` : `₦${c.discount_value.toLocaleString()}`}</td>
                <td className={styles.mono}>{c.discount_type}</td>
                <td>{c.use_count}{c.max_uses ? ` / ${c.max_uses}` : ""}</td>
                <td>{c.expires_at ? new Date(c.expires_at).toLocaleDateString() : "—"}</td>
                <td><span className={c.is_active ? styles.activeBadge : styles.bannedBadge}>{c.is_active ? "Active" : "Inactive"}</span></td>
                <td style={{ display: "flex", gap: 6 }}>
                  <button className={styles.banBtn} onClick={() => toggleCoupon(c.id, c.is_active)}>{c.is_active ? "Disable" : "Enable"}</button>
                  <button className={styles.banBtn} onClick={() => deleteCoupon(c.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Creators */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Creators</h2>
        <table className={styles.table}>
          <thead><tr><th>Name</th><th>Bank</th><th>Subaccount</th><th>Templates</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {adminCreators.map(c => (
              <tr key={c.id}>
                <td>{c.display_name}</td>
                <td>{c.bank_name ?? "—"}{c.account_name ? ` · ${c.account_name}` : ""}</td>
                <td className={styles.mono}>{c.paystack_subaccount_code ? c.paystack_subaccount_code.slice(0, 20) + "…" : "Not set"}</td>
                <td>{c.templateCount}</td>
                <td><span className={c.is_active ? styles.activeBadge : styles.bannedBadge}>{c.is_active ? "Active" : "Suspended"}</span></td>
                <td><button className={styles.banBtn} onClick={() => toggleCreator(c.id, c.is_active)}>{c.is_active ? "Suspend" : "Activate"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

