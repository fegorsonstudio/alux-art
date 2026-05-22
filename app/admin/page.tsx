"use client";

import { useState, useEffect, useMemo } from "react";
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

interface ShootRow {
  id: string;
  status: string;
  owner_email: string;
  user_id: string;
  mode: string;
  aspect_ratio: string;
  package_size: number;
  currency: string;
  created_at: string;
  imageCounts: { total: number; done: number; failed: number };
}

interface AdminData {
  pricing: { ngn: number; usd: number };
  users: Array<{ id: string; email: string; display_name: string; banned: boolean; currency: string; created_at: string }>;
  shoots: ShootRow[];
  metrics: {
    totalUsers: number;
    totalShoots: number;
    completedShoots: number;
    failedShoots: number;
    queueDepth: number;
    todayShoots: number;
  };
  revenue: { today: number; month: number; total: number; totalSales: number };
  marketplace: { totalCreators: number; publishedTemplates: number };
}

interface ModelConfig {
  vision_model: "gemini" | "claude";
  generation_model: "nano-banana" | "seedream";
  locked_base_rollout_percent: number;
  locked_base_enabled: boolean;
  platform_fee_ngn: number;
  platform_price_1_ngn: number;
  platform_price_5_ngn: number;
  prompt_only_mode: boolean;
  polish_pass_enabled: boolean;
}

// ---- Helpers ----

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 2) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function dateBucket(iso: string): string {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.getTime() === today.getTime()) return "Today";
  if (d.getTime() === yesterday.getTime()) return "Yesterday";
  const diff = Math.floor((today.getTime() - d.getTime()) / 86400000);
  if (diff < 7) return d.toLocaleDateString("en-US", { weekday: "long" });
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function groupShootsByDate(shoots: ShootRow[]): { label: string; items: ShootRow[] }[] {
  const order: string[] = [];
  const map = new Map<string, ShootRow[]>();
  for (const s of shoots) {
    const bucket = dateBucket(s.created_at);
    if (!map.has(bucket)) { map.set(bucket, []); order.push(bucket); }
    map.get(bucket)!.push(s);
  }
  return order.map(label => ({ label, items: map.get(label)! }));
}

const STATUS_LABELS: Record<string, string> = {
  QUEUED: "Queued", PROCESSING: "Processing", COMPLETE: "Complete",
  FAILED: "Failed", PENDING: "Pending", BASE_LOCKING: "Base lock",
  BASE_REVIEW: "Review", BASE_REJECTED: "Rejected",
};

const STATUS_CLASS: Record<string, string> = {
  QUEUED: "statusQueued", PROCESSING: "statusProcessing", COMPLETE: "statusComplete",
  FAILED: "statusFailed", PENDING: "statusPending", BASE_LOCKING: "statusBaselocking",
  BASE_REVIEW: "statusBasereview", BASE_REJECTED: "statusFailed",
};

const PENDING_MIGRATIONS = [
  {
    id: "016",
    name: "template_images.custom_name",
    sql: "ALTER TABLE template_images ADD COLUMN IF NOT EXISTS custom_name text;",
    check: async () => {
      const res = await fetch("/api/marketplace/migration-check?col=template_images.custom_name");
      return res.ok && (await res.json()).exists;
    },
  },
  {
    id: "017a",
    name: "creators.theme",
    sql: "ALTER TABLE creators ADD COLUMN IF NOT EXISTS theme text DEFAULT 'alux';",
    check: null,
  },
  {
    id: "017b",
    name: "creators.font_family",
    sql: "ALTER TABLE creators ADD COLUMN IF NOT EXISTS font_family text DEFAULT 'default';",
    check: null,
  },
];

const MIGRATION_SQL = PENDING_MIGRATIONS.map(m => m.sql).join("\n");
const SUPABASE_SQL_URL = "https://supabase.com/dashboard/project/owdfoxglbxrqhgqbvkon/sql/new";

function MigrationsCard() {
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<"idle"|"checking"|"ok"|"needed">("idle");

  const checkStatus = async () => {
    setStatus("checking");
    const res = await fetch("/api/admin/migration-status");
    if (!res.ok) { setStatus("needed"); return; }
    const d = await res.json();
    setStatus(d.allApplied ? "ok" : "needed");
  };

  const copy = () => {
    navigator.clipboard.writeText(MIGRATION_SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={styles.card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <h2 className={styles.cardTitle} style={{ margin: 0 }}>Pending Migrations</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={styles.banBtn} onClick={checkStatus} disabled={status === "checking"}>
            {status === "checking" ? "Checking…" : "Check status"}
          </button>
          {status === "ok" && <span style={{ color: "#177767", fontSize: "0.82rem", alignSelf: "center" }}>✓ All applied</span>}
        </div>
      </div>
      <p style={{ fontSize: "0.8rem", color: "#7aafb4", margin: "8px 0 12px" }}>
        These columns must be added to Supabase before themes and custom reference names work.
        Copy the SQL below and run it in the{" "}
        <a href={SUPABASE_SQL_URL} target="_blank" rel="noopener noreferrer" style={{ color: "#2f8e9a" }}>
          Supabase SQL editor ↗
        </a>
      </p>
      <pre style={{
        background: "rgba(0,0,0,0.06)", borderRadius: 8, padding: "12px 14px",
        fontSize: "0.75rem", overflowX: "auto", margin: "0 0 12px",
        fontFamily: "monospace", lineHeight: 1.7,
      }}>{MIGRATION_SQL}</pre>
      <button className={styles.banBtn} onClick={copy} style={{ marginRight: 8 }}>
        {copied ? "Copied!" : "Copy SQL"}
      </button>
      <a href={SUPABASE_SQL_URL} target="_blank" rel="noopener noreferrer" className={styles.banBtn}
        style={{ textDecoration: "none", display: "inline-block" }}>
        Open SQL editor ↗
      </a>
    </div>
  );
}


export default function AdminPage() {
  const [data, setData] = useState<AdminData | null>(null);
  const [err, setErr] = useState("");
  const [pricingNgn, setPricingNgn] = useState("");
  const [pricingUsd, setPricingUsd] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const [modelConfig, setModelConfig] = useState<ModelConfig>({
    vision_model: "gemini", generation_model: "nano-banana",
    locked_base_rollout_percent: 100, locked_base_enabled: false,
    platform_fee_ngn: 15000, platform_price_1_ngn: 1500, platform_price_5_ngn: 7500,
    prompt_only_mode: false, polish_pass_enabled: false,
  });
  const [rolloutInput, setRolloutInput] = useState("100");
  const [platformFeeInput, setPlatformFeeInput] = useState("15000");
  const [price1Input, setPrice1Input] = useState("1500");
  const [price5Input, setPrice5Input] = useState("7500");
  const [modelSaving, setModelSaving] = useState(false);
  const [modelMsg, setModelMsg] = useState("");

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [couponCode, setCouponCode] = useState("");
  const [couponDesc, setCouponDesc] = useState("");
  const [couponType, setCouponType] = useState<"percent" | "fixed">("percent");
  const [couponValue, setCouponValue] = useState("");
  const [couponMaxUses, setCouponMaxUses] = useState("");
  const [couponExpires, setCouponExpires] = useState("");
  const [couponSaving, setCouponSaving] = useState(false);
  const [couponMsg, setCouponMsg] = useState("");

  const [adminCreators, setAdminCreators] = useState<AdminCreator[]>([]);
  const [shootFilter, setShootFilter] = useState("ALL");
  const [userSearch, setUserSearch] = useState("");

  useEffect(() => {
    fetch("/api/admin/overview")
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? "Error"); return d; })
      .then(d => {
        setData(d);
        setPricingNgn(String(d.pricing?.ngn ?? 15000));
        setPricingUsd(String(d.pricing?.usd ?? 10));
      })
      .catch(e => setErr(e.message));

    fetch("/api/admin/config")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setModelConfig(d);
          setRolloutInput(String(d.locked_base_rollout_percent ?? 100));
          setPlatformFeeInput(String(d.platform_fee_ngn ?? 15000));
          setPrice1Input(String(d.platform_price_1_ngn ?? 1500));
          setPrice5Input(String(d.platform_price_5_ngn ?? 7500));
        }
      })
      .catch(() => {});

    fetch("/api/admin/coupons")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.coupons) setCoupons(d.coupons); })
      .catch(() => {});

    fetch("/api/admin/creators")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.creators) setAdminCreators(d.creators); })
      .catch(() => {});
  }, []);

  const savePricing = async () => {
    setSaving(true); setMsg("");
    try {
      const res = await fetch("/api/admin/pricing", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ngn: Number(pricingNgn), usd: Number(pricingUsd) }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Error saving");
      setData(prev => prev ? { ...prev, pricing: payload.pricing } : prev);
      setMsg("Saved!");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Error"); }
    finally { setSaving(false); setTimeout(() => setMsg(""), 3000); }
  };

  const saveModelConfig = async (patch: Partial<ModelConfig>) => {
    setModelSaving(true); setModelMsg("");
    try {
      const next = { ...modelConfig, ...patch };
      const res = await fetch("/api/admin/config", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Error");
      setModelConfig(next); setModelMsg("Saved!");
    } catch (e) { setModelMsg(e instanceof Error ? e.message : "Error"); }
    finally { setModelSaving(false); setTimeout(() => setModelMsg(""), 3000); }
  };

  const createCoupon = async () => {
    if (!couponCode.trim() || !couponValue) { setCouponMsg("Code and value are required"); return; }
    setCouponSaving(true); setCouponMsg("");
    try {
      const res = await fetch("/api/admin/coupons", {
        method: "POST", headers: { "Content-Type": "application/json" },
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
      if (!res.ok) throw new Error(payload.error ?? "Error");
      setCoupons(prev => [payload.coupon, ...prev]);
      setCouponCode(""); setCouponDesc(""); setCouponValue(""); setCouponMaxUses(""); setCouponExpires("");
      setCouponMsg("Created!");
    } catch (e) { setCouponMsg(e instanceof Error ? e.message : "Error"); }
    finally { setCouponSaving(false); setTimeout(() => setCouponMsg(""), 4000); }
  };

  const toggleCoupon = async (id: string, isActive: boolean) => {
    await fetch(`/api/admin/coupons/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
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
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isActive: !isActive }),
    });
    setAdminCreators(prev => prev.map(c => c.id === id ? { ...c, is_active: !isActive } : c));
  };

  const toggleBan = async (userId: string, banned: boolean) => {
    await fetch("/api/admin/users", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, banned: !banned }),
    });
    setData(prev => prev ? { ...prev, users: prev.users.map(u => u.id === userId ? { ...u, banned: !banned } : u) } : prev);
  };

  const filteredShoots = useMemo(() => {
    const all = data?.shoots ?? [];
    if (shootFilter === "ALL") return all;
    return all.filter(s => s.status === shootFilter);
  }, [data?.shoots, shootFilter]);

  const shootGroups = useMemo(() => groupShootsByDate(filteredShoots), [filteredShoots]);

  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return data?.users ?? [];
    const q = userSearch.toLowerCase();
    return (data?.users ?? []).filter(u => u.email.toLowerCase().includes(q) || u.display_name?.toLowerCase().includes(q));
  }, [data?.users, userSearch]);

  if (err) return <div className={styles.loading}>{err}</div>;
  if (!data) return <div className={styles.loading}>Loading dashboard…</div>;

  const { metrics, revenue, marketplace } = data;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.back}>← Studio</Link>
        <h1 className={styles.title}>Admin Dashboard</h1>
      </header>

      {/* ---- Metrics ---- */}
      <div className={styles.metricsGrid}>
        <div className={styles.metric}>
          <span className={styles.metricVal}>{metrics.totalUsers}</span>
          <span className={styles.metricLabel}>Users</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricVal}>{metrics.totalShoots.toLocaleString()}</span>
          <span className={styles.metricLabel}>Total Shoots</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricVal}>{metrics.completedShoots.toLocaleString()}</span>
          <span className={styles.metricLabel}>Completed</span>
        </div>
        <div className={styles.metric}>
          <span className={`${styles.metricVal} ${metrics.failedShoots > 0 ? styles.metricDanger : ""}`}>{metrics.failedShoots}</span>
          <span className={styles.metricLabel}>Failed</span>
        </div>
        <div className={styles.metric}>
          <span className={`${styles.metricVal} ${metrics.queueDepth > 0 ? styles.metricLive : ""}`}>{metrics.queueDepth}</span>
          <span className={styles.metricLabel}>In Queue</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricVal}>{metrics.todayShoots}</span>
          <span className={styles.metricLabel}>Today</span>
        </div>
      </div>

      {/* ---- Revenue + Marketplace ---- */}
      <div className={styles.revenueRow}>
        <div className={styles.card} style={{ flex: 2 }}>
          <h2 className={styles.cardTitle}>Revenue (Template Sales)</h2>
          <div className={styles.revenueGrid}>
            <div className={styles.revenueItem}>
              <span className={styles.revenueVal}>₦{revenue.today.toLocaleString()}</span>
              <span className={styles.revenueLabel}>Today</span>
            </div>
            <div className={styles.revenueItem}>
              <span className={styles.revenueVal}>₦{revenue.month.toLocaleString()}</span>
              <span className={styles.revenueLabel}>This Month</span>
            </div>
            <div className={styles.revenueItem}>
              <span className={styles.revenueVal}>₦{revenue.total.toLocaleString()}</span>
              <span className={styles.revenueLabel}>All Time</span>
            </div>
            <div className={styles.revenueItem}>
              <span className={styles.revenueVal}>{revenue.totalSales}</span>
              <span className={styles.revenueLabel}>Sales</span>
            </div>
          </div>
        </div>
        <div className={styles.card} style={{ flex: 1 }}>
          <h2 className={styles.cardTitle}>Marketplace</h2>
          <div className={styles.revenueGrid}>
            <div className={styles.revenueItem}>
              <span className={styles.revenueVal}>{marketplace.publishedTemplates}</span>
              <span className={styles.revenueLabel}>Templates</span>
            </div>
            <div className={styles.revenueItem}>
              <span className={styles.revenueVal}>{marketplace.totalCreators}</span>
              <span className={styles.revenueLabel}>Creators</span>
            </div>
          </div>
        </div>
      </div>

      {/* ---- Pricing ---- */}
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

      {/* ---- AI Model Config ---- */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>AI Model Config</h2>
        <div className={styles.modelGrid}>
          <div className={styles.modelSection}>
            <div className={styles.modelLabel}>Vision Agent</div>
            <div className={styles.modelPills}>
              {(["gemini", "claude"] as const).map(m => (
                <button key={m} type="button"
                  className={`${styles.modelPill} ${modelConfig.vision_model === m ? styles.modelPillActive : ""}`}
                  onClick={() => saveModelConfig({ vision_model: m })} disabled={modelSaving}>
                  {m === "gemini" ? "Gemini 2.5 Flash" : "Claude Sonnet / Opus"}
                </button>
              ))}
            </div>
            <div className={styles.modelHint}>{modelConfig.vision_model === "gemini" ? "Gemini 2.5 Flash analyzes identity images and builds shoot briefs." : "Claude Sonnet (identity) + Claude Opus (brief) handles vision tasks."}</div>
          </div>
          <div className={styles.modelSection}>
            <div className={styles.modelLabel}>Image Generation</div>
            <div className={styles.modelPills}>
              {(["nano-banana", "seedream"] as const).map(m => (
                <button key={m} type="button"
                  className={`${styles.modelPill} ${modelConfig.generation_model === m ? styles.modelPillActive : ""}`}
                  onClick={() => saveModelConfig({ generation_model: m })} disabled={modelSaving}>
                  {m === "nano-banana" ? "Flux Kontext" : "SeedDream 4"}
                </button>
              ))}
            </div>
            <div className={styles.modelHint}>{modelConfig.generation_model === "nano-banana" ? "fal-ai/nano-banana-2/edit — strong identity lock." : "fal-ai/bytedance/seedream/v4/edit — multi-image editing."}</div>
          </div>
          <div className={styles.modelSection}>
            <div className={styles.modelLabel}>Base-lock Feature</div>
            <div className={styles.modelPills}>
              {([true, false] as const).map(val => (
                <button key={String(val)} type="button"
                  className={`${styles.modelPill} ${modelConfig.locked_base_enabled === val ? styles.modelPillActive : ""}`}
                  onClick={() => saveModelConfig({ locked_base_enabled: val })} disabled={modelSaving}>
                  {val ? "Enabled" : "Disabled"}
                </button>
              ))}
            </div>
            <div className={styles.modelHint}>{modelConfig.locked_base_enabled ? "ON — new shoots will generate a locked character reference." : "OFF — shoots skip base step and go straight to generation."}</div>
          </div>
          <div className={styles.modelSection}>
            <div className={styles.modelLabel}>Base-lock Rollout — {rolloutInput}%</div>
            <div className={styles.rolloutRow}>
              <input type="range" min={0} max={100} step={5} value={rolloutInput}
                className={styles.rolloutSlider} onChange={e => setRolloutInput(e.target.value)} />
              <input type="number" min={0} max={100} value={rolloutInput}
                className={styles.rolloutNumber} onChange={e => setRolloutInput(e.target.value)} />
              <button type="button" className={styles.saveBtn}
                onClick={() => saveModelConfig({ locked_base_rollout_percent: Number(rolloutInput) })}
                disabled={modelSaving}>{modelSaving ? "Saving…" : "Save"}</button>
            </div>
          </div>
          <div className={styles.modelSection}>
            <div className={styles.modelLabel}>Prompt-Only Mode</div>
            <div className={styles.modelPills}>
              {([false, true] as const).map(val => (
                <button key={String(val)} type="button"
                  className={`${styles.modelPill} ${modelConfig.prompt_only_mode === val ? styles.modelPillActive : ""}`}
                  onClick={() => saveModelConfig({ prompt_only_mode: val })} disabled={modelSaving}>
                  {val ? "Enabled" : "Disabled"}
                </button>
              ))}
            </div>
            <div className={styles.modelHint}>{modelConfig.prompt_only_mode ? "ON — prompts are generated and saved but fal.ai calls are skipped. Use Template Lab to generate images later." : "OFF — normal generation pipeline with fal.ai."}</div>
          </div>
          <div className={styles.modelSection}>
            <div className={styles.modelLabel}>Polish Pass (Z-Image Turbo)</div>
            <div className={styles.modelPills}>
              {([false, true] as const).map(val => (
                <button key={String(val)} type="button"
                  className={`${styles.modelPill} ${modelConfig.polish_pass_enabled === val ? styles.modelPillActive : ""}`}
                  onClick={() => saveModelConfig({ polish_pass_enabled: val })} disabled={modelSaving}>
                  {val ? "Enabled" : "Disabled"}
                </button>
              ))}
            </div>
            <div className={styles.modelHint}>{modelConfig.polish_pass_enabled ? "ON — each generated image gets a second quality-refinement pass (denoise 0.18). Adds ~3s per slot." : "OFF — images are used directly from fal.ai with no post-processing."}</div>
          </div>
        </div>
        {modelMsg && <span className={styles.saveMsg}>{modelMsg}</span>}
      </div>

      {/* ---- Shoots by date ---- */}
      <div className={styles.card}>
        <div className={styles.shootsHeader}>
          <h2 className={styles.cardTitle}>Shoots</h2>
          <div className={styles.filterTabs}>
            {["ALL", "QUEUED", "PROCESSING", "COMPLETE", "FAILED"].map(f => (
              <button key={f} type="button"
                className={`${styles.filterTab} ${shootFilter === f ? styles.filterTabActive : ""}`}
                onClick={() => setShootFilter(f)}>
                {f === "ALL" ? `All (${data.shoots.length})` : STATUS_LABELS[f] ?? f}
              </button>
            ))}
          </div>
        </div>

        {shootGroups.length === 0 && <div className={styles.empty}>No shoots found.</div>}

        {shootGroups.map(group => (
          <div key={group.label} className={styles.dateGroup}>
            <div className={styles.dateGroupLabel}>
              {group.label}
              <span className={styles.dateGroupCount}>{group.items.length}</span>
            </div>
            {group.items.map(s => {
              const badgeClass = styles[STATUS_CLASS[s.status] ?? "badge"] ?? styles.badge;
              const imageTotal = s.imageCounts.total || s.package_size || 0;
              const imageDone = s.imageCounts.done;
              return (
                <div key={s.id} className={styles.shootItem}>
                  <div className={styles.shootLeft}>
                    <span className={styles.shootEmail}>{s.owner_email}</span>
                    <div className={styles.shootMeta}>
                      <span className={badgeClass}>{STATUS_LABELS[s.status] ?? s.status}</span>
                      {s.mode && <span className={styles.modePill}>{s.mode}</span>}
                      {s.currency && <span className={styles.currencyPill}>{s.currency}</span>}
                    </div>
                  </div>
                  <div className={styles.shootRight}>
                    {imageTotal > 0 && (
                      <div className={styles.imageProgress}>
                        <div className={styles.imageProgressBar}>
                          <div
                            className={styles.imageProgressFill}
                            style={{ width: `${Math.round((imageDone / imageTotal) * 100)}%` }}
                          />
                        </div>
                        <span className={styles.imageProgressLabel}>{imageDone}/{imageTotal}</span>
                      </div>
                    )}
                    <span className={styles.shootTime}>{timeAgo(s.created_at)}</span>
                    <span className={styles.shootId}>{s.id.slice(0, 8)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* ---- Users ---- */}
      <div className={styles.card}>
        <div className={styles.shootsHeader}>
          <h2 className={styles.cardTitle}>Users ({filteredUsers.length})</h2>
          <input
            className={styles.searchInput}
            placeholder="Search email or name…"
            value={userSearch}
            onChange={e => setUserSearch(e.target.value)}
          />
        </div>
        <table className={styles.table}>
          <thead><tr><th>Email</th><th>Name</th><th>Currency</th><th>Joined</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {filteredUsers.map(u => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td className={styles.mono}>{u.display_name ?? "—"}</td>
                <td>{u.currency ?? "NGN"}</td>
                <td>{new Date(u.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</td>
                <td><span className={u.banned ? styles.bannedBadge : styles.activeBadge}>{u.banned ? "Banned" : "Active"}</span></td>
                <td><button className={styles.banBtn} onClick={() => toggleBan(u.id, u.banned)}>{u.banned ? "Unban" : "Ban"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---- Coupons ---- */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Coupon Codes</h2>
        <div className={styles.couponForm}>
          <input className={styles.priceInput} style={{ width: 110 }} placeholder="CODE" value={couponCode} onChange={e => setCouponCode(e.target.value.toUpperCase())} maxLength={20} />
          <input className={styles.priceInput} style={{ width: 180 }} placeholder="Description" value={couponDesc} onChange={e => setCouponDesc(e.target.value)} />
          <select className={`${styles.priceInput} ${styles.selectInput}`} value={couponType} onChange={e => setCouponType(e.target.value as "percent" | "fixed")}>
            <option value="percent">% off platform fee</option>
            <option value="fixed">₦ off platform fee</option>
          </select>
          <input className={styles.priceInput} style={{ width: 70 }} type="number" placeholder={couponType === "percent" ? "%" : "₦"} value={couponValue} onChange={e => setCouponValue(e.target.value)} min={1} max={couponType === "percent" ? 100 : undefined} />
          <input className={styles.priceInput} style={{ width: 80 }} type="number" placeholder="Max uses" value={couponMaxUses} onChange={e => setCouponMaxUses(e.target.value)} />
          <input className={styles.priceInput} style={{ width: 150 }} type="datetime-local" value={couponExpires} onChange={e => setCouponExpires(e.target.value)} />
          <button type="button" className={styles.saveBtn} onClick={createCoupon} disabled={couponSaving}>{couponSaving ? "Creating..." : "Create"}</button>
          {couponMsg && <span className={styles.saveMsg}>{couponMsg}</span>}
        </div>
        <table className={styles.table} style={{ marginTop: 16 }}>
          <thead><tr><th>Code</th><th>Discount</th><th>Uses</th><th>Expires</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {coupons.map(c => (
              <tr key={c.id}>
                <td className={styles.mono}>{c.code}</td>
                <td>{c.discount_type === "percent" ? `${c.discount_value}% off fee` : `₦${c.discount_value.toLocaleString()} off fee`}</td>
                <td>{c.use_count}{c.max_uses ? ` / ${c.max_uses}` : ""}</td>
                <td>{c.expires_at ? new Date(c.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}</td>
                <td><span className={c.is_active ? styles.activeBadge : styles.bannedBadge}>{c.is_active ? "Active" : "Off"}</span></td>
                <td style={{ display: "flex", gap: 6 }}>
                  <button className={styles.banBtn} onClick={() => toggleCoupon(c.id, c.is_active)}>{c.is_active ? "Disable" : "Enable"}</button>
                  <button className={styles.banBtn} onClick={() => deleteCoupon(c.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---- Pending migrations ---- */}
      <MigrationsCard />

      {/* ---- Shoot Package Pricing ---- */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Shoot Package Pricing</h2>
        <p style={{ fontSize: "0.8rem", color: "#7aafb4", margin: "0 0 16px" }}>
          Platform fee deducted from each template sale. Set explicit prices for each package size.
        </p>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.78rem", color: "#4e7076" }}>
            1 image (₦)
            <input
              className={styles.priceInput}
              type="number" min={100} step={100}
              value={price1Input}
              onChange={e => setPrice1Input(e.target.value)}
              style={{ width: 120 }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.78rem", color: "#4e7076" }}>
            5 images (₦)
            <input
              className={styles.priceInput}
              type="number" min={500} step={100}
              value={price5Input}
              onChange={e => setPrice5Input(e.target.value)}
              style={{ width: 120 }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.78rem", color: "#4e7076" }}>
            10 images (₦)
            <input
              className={styles.priceInput}
              type="number" min={1000} step={500}
              value={platformFeeInput}
              onChange={e => setPlatformFeeInput(e.target.value)}
              style={{ width: 120 }}
            />
          </label>
          <button
            type="button"
            className={styles.saveBtn}
            disabled={modelSaving}
            onClick={() => saveModelConfig({
              platform_fee_ngn: Number(platformFeeInput),
              platform_price_1_ngn: Number(price1Input),
              platform_price_5_ngn: Number(price5Input),
            })}
          >
            {modelSaving ? "Saving…" : "Save prices"}
          </button>
          {modelMsg && <span className={styles.saveMsg}>{modelMsg}</span>}
        </div>
      </div>

      {/* ---- Creators ---- */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Creators</h2>
        <table className={styles.table}>
          <thead><tr><th>Name</th><th>Bank</th><th>Subaccount</th><th>Templates</th><th>Joined</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {adminCreators.map(c => (
              <tr key={c.id}>
                <td>{c.display_name}</td>
                <td>{c.bank_name ?? "—"}{c.account_name ? ` · ${c.account_name}` : ""}</td>
                <td className={styles.mono}>{c.paystack_subaccount_code ? c.paystack_subaccount_code.slice(0, 18) + "…" : "Not set"}</td>
                <td>{c.templateCount}</td>
                <td>{new Date(c.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</td>
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
