"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import styles from "./admin.module.css";

// A template a brand has paid to make free for everyone.
interface AdminTemplate {
  id: string;
  title: string;
  status: string;
  price_ngn: number;
  creator_display_name?: string | null;
  is_sponsored: boolean;
  sponsor_name: string | null;
  sponsor_package_size: number | null;
  sponsor_total_limit: number | null;
  sponsor_used_count: number;
  sponsor_expires_at: string | null;
}

// An admin comp: N free images credited to an email address. Keyed by email so it
// can be issued before that person has ever signed up.
interface FreeGrant {
  id: string;
  email: string;
  images_granted: number;
  images_used: number;
  images_remaining: number;
  bookings_count: number;
  note: string | null;
  granted_by: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

// Money owed to a creator for free bookings — no gateway split runs on those,
// so Alux Art settles them by hand.
interface OwedCreator {
  creator_id: string;
  creator_name: string | null;
  owed_ngn: number;
  bookings: number;
}

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
  email: string | null;
  bank_name: string | null;
  account_name: string | null;
  paystack_subaccount_code: string | null;
  is_active: boolean;
  status: string | null;
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
  revenue: {
    today: number; month: number; total: number; totalSales: number;
    directToday?: number; directMonth?: number; directTotal?: number; directCount?: number;
    combinedToday?: number; combinedMonth?: number; combinedTotal?: number;
  };
  marketplace: { totalCreators: number; publishedTemplates: number };
  funnel?: {
    checkoutsStarted: number; paid: number; abandonedAtPayment: number;
    shootsCompleted: number; shootsFailed: number; regenEligible: number;
  };
  topTemplates?: Array<{ id: string; title: string; category: string; sales: number }>;
}

type AdminTab = "overview" | "shoots" | "people" | "marketplace" | "settings";
const ADMIN_TABS: Array<{ id: AdminTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "shoots", label: "Shoots" },
  { id: "people", label: "People" },
  { id: "marketplace", label: "Marketplace" },
  { id: "settings", label: "Settings" },
];

interface ShootDebug {
  shoot_id: string;
  owner_email: string;
  status: string;
  mode: string;
  identity_profile: string;
  shoot_brief: { prompts?: Array<{ prompt_index: number; fully_consolidated_prompt?: string }> } | null;
  slots: Array<{ slot: number; kind: string; status: string; prompt: string | null }>;
}

interface ErrorGroup {
  type: string;
  message: string;
  source: string | null;
  count: number;
  last_seen: string;
  first_seen: string;
  pages: string[] | null;
  resolved?: boolean;
}

interface ModelConfig {
  vision_model: "gemini" | "claude";
  generation_model: "nano-banana" | "seedream";
  locked_base_rollout_percent: number;
  locked_base_enabled: boolean;
  platform_fee_ngn: number;
  price_1_ngn: number;
  price_5_ngn: number;
  price_10_ngn: number;
  price_1_usd: number;
  price_5_usd: number;
  price_10_usd: number;
  prompt_only_mode: boolean;
  admin_prompt_only_mode: boolean;
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
  const diffDays = Math.floor((today.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  // Start of current week (Monday)
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  // Start of last week
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(weekStart.getDate() - 7);
  if (d >= weekStart) return "This week";
  if (d >= lastWeekStart) return "Last week";
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
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
  {
    id: "024",
    name: "error_logs table",
    sql: `CREATE TABLE IF NOT EXISTS error_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type         TEXT NOT NULL DEFAULT 'js_error',
  message      TEXT NOT NULL,
  source       TEXT,
  line_number  INTEGER,
  page_path    TEXT,
  http_status  INTEGER,
  user_agent   TEXT,
  resolved     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS error_logs_created_idx ON error_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS error_logs_resolved_idx ON error_logs (resolved);`,
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
        These must be applied to your VPS PostgreSQL database. Copy the SQL and run it on the VPS:
        <br />
        <code style={{ fontSize: "0.72rem", color: "#4e7076", background: "rgba(0,0,0,0.2)", padding: "2px 6px", borderRadius: 4 }}>
          node --env-file=/home/aluxart/app/.env.local /home/aluxart/app/scripts/migrate-vps.mjs
        </code>
      </p>
      <pre style={{
        background: "rgba(0,0,0,0.06)", borderRadius: 8, padding: "12px 14px",
        fontSize: "0.75rem", overflowX: "auto", margin: "0 0 12px",
        fontFamily: "monospace", lineHeight: 1.7,
      }}>{MIGRATION_SQL}</pre>
      <button className={styles.banBtn} onClick={copy} style={{ marginRight: 8 }}>
        {copied ? "Copied!" : "Copy SQL"}
      </button>
    </div>
  );
}


function ErrorsPanel() {
  const [errors, setErrors] = useState<ErrorGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<"unresolved" | "all" | "resolved">("unresolved");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [resolving, setResolving] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const copyForClaude = () => {
    if (errors.length === 0) return;
    const lines = [
      `Fix these errors from the Alux Art admin error log (${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}):`,
      "",
      ...errors.map((g, i) => {
        const badge = g.type === "api_error" ? "API" : "JS";
        const pages = g.pages?.slice(0, 3).join(", ") ?? "";
        const parts = [
          `${i + 1}. [${badge}] ${g.count}× — last seen ${timeAgo(g.last_seen)}`,
          `   Message: ${g.message}`,
        ];
        if (g.source) parts.push(`   Source: ${g.source}`);
        if (pages)    parts.push(`   Pages: ${pages}`);
        return parts.join("\n");
      }),
    ];
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/errors?filter=${filter}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d) return;
        setErrors(d.errors ?? []);
        setTotal(d.total_unresolved ?? 0);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filter, refreshKey]);

  const resolve = async (group: ErrorGroup) => {
    const key = `${group.type}:${group.message}:${group.source ?? ""}`;
    setResolving(key);
    try {
      await fetch("/api/admin/errors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: group.type, message: group.message, source: group.source }),
      });
      setRefreshKey(k => k + 1);
    } finally {
      setResolving(null);
    }
  };

  return (
    <div className={styles.card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <h2 className={styles.cardTitle} style={{ margin: 0 }}>
          Error Log
          {total > 0 && (
            <span style={{ marginLeft: 8, background: "rgba(255,70,70,0.15)", color: "#ff6b6b", fontSize: "0.72rem", fontWeight: 700, padding: "2px 8px", borderRadius: 12 }}>
              {total} unresolved
            </span>
          )}
        </h2>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <div className={styles.filterTabs}>
            {(["unresolved", "all", "resolved"] as const).map(f => (
              <button key={f} className={`${styles.filterTab} ${filter === f ? styles.filterTabActive : ""}`}
                onClick={() => setFilter(f)}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <button className={styles.banBtn} onClick={() => setRefreshKey(k => k + 1)} disabled={loading} style={{ marginLeft: 4 }}>
            {loading ? "…" : "↺"}
          </button>
          {errors.length > 0 && (
            <button className={styles.banBtn} onClick={copyForClaude}
              style={{ borderColor: copied ? "rgba(68,204,136,0.4)" : undefined, color: copied ? "#44cc88" : undefined }}>
              {copied ? "Copied!" : "Copy for Claude"}
            </button>
          )}
        </div>
      </div>
      {loading && errors.length === 0 ? (
        <p className={styles.empty}>Loading…</p>
      ) : errors.length === 0 ? (
        <p className={styles.empty}>
          {filter === "unresolved" ? "No unresolved errors — all clear." : "No errors found."}
        </p>
      ) : (
        <div>
          {errors.map((group) => {
            const key = `${group.type}:${group.message}:${group.source ?? ""}`;
            return (
              <div key={key} className={styles.errorRow}>
                <div className={styles.errorLeft}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span className={group.type === "api_error" ? styles.errorBadgeApi : styles.errorBadgeJs}>
                      {group.type === "api_error" ? "API" : "JS"}
                    </span>
                    <span className={styles.errorCount}>{group.count}×</span>
                    <span className={styles.errorTime}>{timeAgo(group.last_seen)}</span>
                    {group.resolved && <span style={{ fontSize: "0.65rem", color: "#44cc88" }}>resolved</span>}
                  </div>
                  <p className={styles.errorMessage}>{group.message}</p>
                  {group.source && <p className={styles.errorSource}>{group.source}</p>}
                  {group.pages && group.pages.length > 0 && (
                    <p className={styles.errorPages}>{group.pages.slice(0, 3).join(" · ")}</p>
                  )}
                </div>
                {filter !== "resolved" && (
                  <button className={styles.banBtn} style={{ flexShrink: 0, alignSelf: "flex-start" }}
                    onClick={() => resolve(group)} disabled={resolving === key}>
                    {resolving === key ? "…" : "Resolve"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  const [data, setData] = useState<AdminData | null>(null);
  const [err, setErr] = useState("");

  const [copiedSlotPrompt, setCopiedSlotPrompt] = useState<string | null>(null);
  const [modelConfig, setModelConfig] = useState<ModelConfig>({
    vision_model: "gemini", generation_model: "nano-banana",
    locked_base_rollout_percent: 100, locked_base_enabled: false,
    platform_fee_ngn: 15000,
    price_1_ngn: 1500, price_5_ngn: 7500, price_10_ngn: 15000,
    price_1_usd: 1, price_5_usd: 5, price_10_usd: 10,
    prompt_only_mode: false, admin_prompt_only_mode: false, polish_pass_enabled: false,
  });
  const [rolloutInput, setRolloutInput] = useState("100");
  const [platformFeeInput, setPlatformFeeInput] = useState("15000");
  const [price1NgnInput, setPrice1NgnInput] = useState("1500");
  const [price5NgnInput, setPrice5NgnInput] = useState("7500");
  const [price10NgnInput, setPrice10NgnInput] = useState("15000");
  const [price1UsdInput, setPrice1UsdInput] = useState("1");
  const [price5UsdInput, setPrice5UsdInput] = useState("5");
  const [price10UsdInput, setPrice10UsdInput] = useState("10");
  const [modelSaving, setModelSaving] = useState(false);
  const [modelMsg, setModelMsg] = useState("");

  const [expandedShootId, setExpandedShootId] = useState<string | null>(null);
  const [shootDebug, setShootDebug] = useState<Record<string, ShootDebug | "loading" | "error">>({});
  const [restartingId, setRestartingId] = useState<string | null>(null);
  const [restartMsg, setRestartMsg] = useState<Record<string, string>>({});

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [couponCode, setCouponCode] = useState("");
  const [couponDesc, setCouponDesc] = useState("");
  const [couponType, setCouponType] = useState<"percent" | "fixed">("percent");
  const [couponValue, setCouponValue] = useState("");
  const [couponMaxUses, setCouponMaxUses] = useState("");
  const [couponExpires, setCouponExpires] = useState("");
  const [couponSaving, setCouponSaving] = useState(false);
  const [couponMsg, setCouponMsg] = useState("");

  // Free generations: admin comps N images to an email address.
  const [grants, setGrants] = useState<FreeGrant[]>([]);
  const [grantEmail, setGrantEmail] = useState("");
  const [grantImages, setGrantImages] = useState("5");
  const [grantNote, setGrantNote] = useState("");
  const [grantExpires, setGrantExpires] = useState("");
  const [grantSaving, setGrantSaving] = useState(false);
  const [grantMsg, setGrantMsg] = useState("");

  // What the platform owes creators for free bookings (no gateway split happens).
  const [owed, setOwed] = useState<OwedCreator[]>([]);
  const [settling, setSettling] = useState<string | null>(null);

  // Sponsored templates: a brand funds a template so buyers book it free.
  const [adminTemplates, setAdminTemplates] = useState<AdminTemplate[]>([]);
  const [sponsorTemplateId, setSponsorTemplateId] = useState("");
  const [sponsorName, setSponsorName] = useState("");
  const [sponsorPkg, setSponsorPkg] = useState("5");
  const [sponsorLimit, setSponsorLimit] = useState("");
  const [sponsorExpires, setSponsorExpires] = useState("");
  const [sponsorSaving, setSponsorSaving] = useState(false);
  const [sponsorMsg, setSponsorMsg] = useState("");

  const [adminCreators, setAdminCreators] = useState<AdminCreator[]>([]);
  const [shootFilter, setShootFilter] = useState("ALL");
  const [userSearch, setUserSearch] = useState("");
  const [tab, setTab] = useState<AdminTab>("overview");

  useEffect(() => {
    fetch("/api/admin/overview")
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? "Error"); return d; })
      .then(d => { setData(d); })
      .catch(e => setErr(e.message));

    fetch("/api/admin/config")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setModelConfig(d);
          setRolloutInput(String(d.locked_base_rollout_percent ?? 100));
          setPlatformFeeInput(String(d.platform_fee_ngn ?? 15000));
          setPrice1NgnInput(String(d.price_1_ngn ?? 1500));
          setPrice5NgnInput(String(d.price_5_ngn ?? 7500));
          setPrice10NgnInput(String(d.price_10_ngn ?? 15000));
          setPrice1UsdInput(String(d.price_1_usd ?? 1));
          setPrice5UsdInput(String(d.price_5_usd ?? 5));
          setPrice10UsdInput(String(d.price_10_usd ?? 10));
        }
      })
      .catch(() => {});

    fetch("/api/admin/coupons")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.coupons) setCoupons(d.coupons); })
      .catch(() => {});

    fetch("/api/admin/free-grants")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.grants) setGrants(d.grants); })
      .catch(() => {});

    fetch("/api/admin/free-bookings")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.owed) setOwed(d.owed); })
      .catch(() => {});

    fetch("/api/admin/templates")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.templates) setAdminTemplates(d.templates); })
      .catch(() => {});

    fetch("/api/admin/creators")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.creators) setAdminCreators(d.creators); })
      .catch(() => {});
  }, []);

  const restartShoot = async (shootId: string) => {
    setRestartingId(shootId);
    setRestartMsg(prev => ({ ...prev, [shootId]: "" }));
    try {
      const res = await fetch(`/api/shoots/${shootId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution: "4K" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Error");
      setRestartMsg(prev => ({ ...prev, [shootId]: `Started — status: ${d.status ?? "processing"}` }));
      setTimeout(() => {
        fetch("/api/admin/overview")
          .then(r => r.json())
          .then(d => setData(d))
          .catch(() => {});
      }, 2500);
    } catch (e) {
      setRestartMsg(prev => ({ ...prev, [shootId]: e instanceof Error ? e.message : "Error" }));
    } finally {
      setRestartingId(null);
    }
  };

  const loadShootDebug = async (id: string) => {
    if (expandedShootId === id) { setExpandedShootId(null); return; }
    setExpandedShootId(id);
    if (shootDebug[id]) return;
    setShootDebug(prev => ({ ...prev, [id]: "loading" }));
    try {
      const res = await fetch(`/api/admin/shoots/${id}/debug`);
      if (!res.ok) throw new Error("Failed");
      const d: ShootDebug = await res.json();
      setShootDebug(prev => ({ ...prev, [id]: d }));
    } catch {
      setShootDebug(prev => ({ ...prev, [id]: "error" }));
    }
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

  const createGrant = async () => {
    if (!grantEmail.trim()) { setGrantMsg("Email is required"); return; }
    setGrantSaving(true); setGrantMsg("");
    try {
      const res = await fetch("/api/admin/free-grants", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: grantEmail.trim(),
          images: Number(grantImages),
          note: grantNote.trim() || undefined,
          expiresAt: grantExpires || undefined,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Error");
      setGrants(prev => [payload.grant, ...prev]);
      setGrantEmail(""); setGrantNote(""); setGrantExpires("");
      setGrantMsg(`Credited ${payload.grant.images_granted} images`);
    } catch (e) { setGrantMsg(e instanceof Error ? e.message : "Error"); }
    finally { setGrantSaving(false); setTimeout(() => setGrantMsg(""), 4000); }
  };

  const toggleGrant = async (id: string, isActive: boolean) => {
    try {
      const res = await fetch(`/api/admin/free-grants/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });
      if (!res.ok) return;
      setGrants(prev => prev.map(g => g.id === id ? { ...g, is_active: !isActive } : g));
    } catch { /* leave the row as-is */ }
  };

  const settleCreator = async (creatorId: string) => {
    setSettling(creatorId);
    try {
      const res = await fetch("/api/admin/free-bookings", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creatorId, settled: true }),
      });
      if (res.ok) setOwed(prev => prev.filter(o => o.creator_id !== creatorId));
    } catch { /* keep it listed so it is not forgotten */ }
    finally { setSettling(null); }
  };

  const patchTemplate = async (id: string, patch: Record<string, unknown>) => {
    const res = await fetch("/api/admin/templates", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error ?? "Error");
  };

  const startSponsorship = async () => {
    if (!sponsorTemplateId) { setSponsorMsg("Pick a template"); return; }
    if (!sponsorLimit || Number(sponsorLimit) < 1) {
      setSponsorMsg("A total booking cap is required"); return;
    }
    setSponsorSaving(true); setSponsorMsg("");
    try {
      await patchTemplate(sponsorTemplateId, {
        isSponsored: true,
        sponsorName: sponsorName.trim() || null,
        sponsorPackageSize: Number(sponsorPkg),
        sponsorTotalLimit: Number(sponsorLimit),
        sponsorExpiresAt: sponsorExpires || null,
      });
      setAdminTemplates(prev => prev.map(t => t.id === sponsorTemplateId ? {
        ...t, is_sponsored: true, sponsor_name: sponsorName.trim() || null,
        sponsor_package_size: Number(sponsorPkg), sponsor_total_limit: Number(sponsorLimit),
        sponsor_expires_at: sponsorExpires || null,
      } : t));
      setSponsorTemplateId(""); setSponsorName(""); setSponsorLimit(""); setSponsorExpires("");
      setSponsorMsg("Now free to book");
    } catch (e) { setSponsorMsg(e instanceof Error ? e.message : "Error"); }
    finally { setSponsorSaving(false); setTimeout(() => setSponsorMsg(""), 4000); }
  };

  const stopSponsorship = async (id: string) => {
    try {
      await patchTemplate(id, { isSponsored: false });
      setAdminTemplates(prev => prev.map(t => t.id === id ? { ...t, is_sponsored: false } : t));
    } catch { /* leave the row as-is */ }
  };

  const resetSponsorCount = async (id: string) => {
    try {
      await patchTemplate(id, { resetSponsorCount: true });
      setAdminTemplates(prev => prev.map(t => t.id === id ? { ...t, sponsor_used_count: 0 } : t));
    } catch { /* leave the row as-is */ }
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

  const approveCreator = async (id: string) => {
    const res = await fetch("/api/admin/creators", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "approve" }),
    });
    if (res.ok) {
      setAdminCreators(prev => prev.map(c => c.id === id ? { ...c, is_active: true, status: "approved" } : c));
    }
  };

  const declineCreator = async (id: string) => {
    if (!confirm("Decline this application? The creator will be notified.")) return;
    const res = await fetch("/api/admin/creators", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "decline" }),
    });
    if (res.ok) {
      setAdminCreators(prev => prev.map(c => c.id === id ? { ...c, is_active: false, status: "declined" } : c));
    }
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

  const { metrics, revenue, marketplace, funnel, topTemplates } = data;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.back}>← Studio</Link>
        <h1 className={styles.title}>Admin Dashboard</h1>
      </header>

      {/* ---- Tab navigation ---- */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 20px" }}>
        {ADMIN_TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: "0.85rem",
              border: tab === t.id ? "2px solid #2f8e9a" : "1px solid rgba(127,127,127,0.3)",
              background: tab === t.id ? "rgba(47,142,154,0.12)" : "transparent", color: "inherit",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (<>
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

      {/* ---- Combined revenue (marketplace + direct studio) ---- */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Total Revenue (all sources)</h2>
        <div className={styles.revenueGrid}>
          <div className={styles.revenueItem}>
            <span className={styles.revenueVal}>₦{(revenue.combinedToday ?? revenue.today).toLocaleString()}</span>
            <span className={styles.revenueLabel}>Today</span>
          </div>
          <div className={styles.revenueItem}>
            <span className={styles.revenueVal}>₦{(revenue.combinedMonth ?? revenue.month).toLocaleString()}</span>
            <span className={styles.revenueLabel}>This Month</span>
          </div>
          <div className={styles.revenueItem}>
            <span className={styles.revenueVal}>₦{(revenue.combinedTotal ?? revenue.total).toLocaleString()}</span>
            <span className={styles.revenueLabel}>All Time</span>
          </div>
        </div>
        <p style={{ fontSize: "0.76rem", color: "#7aafb4", margin: "12px 0 0" }}>
          Marketplace sales ₦{revenue.total.toLocaleString()} ({revenue.totalSales}) + Direct studio shoots ₦{(revenue.directTotal ?? 0).toLocaleString()} ({revenue.directCount ?? 0}). Naira-denominated payments.
        </p>
      </div>

      {/* ---- Conversion funnel ---- */}
      {funnel && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Where buyers stop (conversion funnel)</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {[
              { label: "Started checkout", value: funnel.checkoutsStarted, tone: "#2f8e9a" },
              { label: "Paid", value: funnel.paid, tone: "#177767" },
              { label: "Abandoned at payment", value: funnel.abandonedAtPayment, tone: "#b94a4a" },
              { label: "Shoots completed", value: funnel.shootsCompleted, tone: "#177767" },
              { label: "Shoots failed", value: funnel.shootsFailed, tone: "#b94a4a" },
              { label: "Awaiting free regeneration", value: funnel.regenEligible, tone: "#8a6000" },
            ].map(row => {
              const denom = Math.max(1, funnel.checkoutsStarted);
              const pct = Math.min(100, Math.round((row.value / denom) * 100));
              return (
                <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ flex: "0 0 160px", fontSize: "0.82rem" }}>{row.label}</span>
                  <div style={{ flex: 1, height: 18, borderRadius: 4, background: "rgba(127,127,127,0.12)", overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: row.tone, opacity: 0.7 }} />
                  </div>
                  <span style={{ flex: "0 0 44px", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{row.value}</span>
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: "0.76rem", color: "#7aafb4", margin: "12px 0 0" }}>
            &quot;Abandoned at payment&quot; = buyers who reached checkout but never paid — your biggest recoverable drop-off.
          </p>
        </div>
      )}

      {/* ---- Best-selling templates ---- */}
      {topTemplates && topTemplates.length > 0 && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Best-selling templates</h2>
          <table className={styles.table}>
            <thead><tr><th>Template</th><th>Category</th><th>Sales</th></tr></thead>
            <tbody>
              {topTemplates.map(t => (
                <tr key={t.id}>
                  <td>{t.title}</td>
                  <td className={styles.mono}>{t.category}</td>
                  <td style={{ fontWeight: 600 }}>{t.sales.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </>)}

      {tab === "settings" && (<>
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
            <div className={styles.modelHint}>{modelConfig.vision_model === "gemini" ? "Gemini 2.5 Flash analyzes identity images and builds shoot briefs." : "Claude Sonnet (identity) + Claude Opus (brief); falls back to Gemini 2.5 Flash automatically if Claude fails — shoots are never blocked."}</div>
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
            <div className={styles.modelHint}>{modelConfig.prompt_only_mode ? "ON — prompts are generated and saved but fal.ai calls are skipped. Affects every user." : "OFF — normal generation pipeline with fal.ai."}</div>
          </div>
          <div className={styles.modelSection}>
            <div className={styles.modelLabel}>Admin Prompt-Only <span style={{ background: "rgba(201,169,110,0.12)", color: "#c9a96e", fontSize: "0.6rem", padding: "1px 6px", borderRadius: 4, marginLeft: 6, letterSpacing: "0.04em" }}>ADMIN ONLY</span></div>
            <div className={styles.modelPills}>
              {([false, true] as const).map(val => (
                <button key={String(val)} type="button"
                  className={`${styles.modelPill} ${modelConfig.admin_prompt_only_mode === val ? styles.modelPillActive : ""}`}
                  onClick={() => saveModelConfig({ admin_prompt_only_mode: val })} disabled={modelSaving}>
                  {val ? "Enabled" : "Disabled"}
                </button>
              ))}
            </div>
            <div className={styles.modelHint}>{modelConfig.admin_prompt_only_mode ? "ON — your own shoots stop at the prompt stage. Copy the prompt and use it elsewhere. Other users generate normally." : "OFF — your shoots go to fal.ai like everyone else."}</div>
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

      </>)}

      {tab === "shoots" && (<>
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
              const isExpanded = expandedShootId === s.id;
              const debug = shootDebug[s.id];
              return (
                <div key={s.id}>
                  <div
                    className={styles.shootItem}
                    style={{ cursor: "pointer" }}
                    onClick={() => loadShootDebug(s.id)}
                  >
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
                      <span style={{ fontSize: "0.7rem", color: "#7aafb4" }}>{isExpanded ? "▲" : "▼"}</span>
                    </div>
                  </div>
                  {isExpanded && (
                    <div style={{ background: "rgba(0,0,0,0.04)", borderRadius: 8, padding: "14px 16px", margin: "2px 0 6px", fontSize: "0.78rem" }}>
                      {s.status !== "COMPLETE" && (
                        <div style={{ marginBottom: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                          <button
                            className={styles.banBtn}
                            style={{ background: "rgba(47,142,154,0.12)", borderColor: "rgba(47,142,154,0.4)", color: "#2f8e9a", fontWeight: 600 }}
                            onClick={(e) => { e.stopPropagation(); restartShoot(s.id); }}
                            disabled={restartingId === s.id}
                          >
                            {restartingId === s.id ? "Restarting…" : "Restart generation"}
                          </button>
                          {restartMsg[s.id] && (
                            <span style={{ fontSize: "0.74rem", color: restartMsg[s.id].startsWith("Started") ? "#177767" : "#b94a4a" }}>
                              {restartMsg[s.id]}
                            </span>
                          )}
                        </div>
                      )}
                      {debug === "loading" && <span style={{ color: "#7aafb4" }}>Loading…</span>}
                      {debug === "error" && <span style={{ color: "#b94a4a" }}>Failed to load debug data.</span>}
                      {debug && debug !== "loading" && debug !== "error" && (
                        <>
                          <details style={{ marginBottom: 12 }}>
                            <summary style={{ cursor: "pointer", color: "#2f8e9a", fontWeight: 600 }}>
                              Identity Profile
                            </summary>
                            <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: 8, fontFamily: "monospace", fontSize: "0.74rem", lineHeight: 1.5, color: "#334" }}>
                              {debug.identity_profile || "(empty)"}
                            </pre>
                          </details>
                          <div style={{ fontWeight: 600, color: "#2f8e9a", marginBottom: 8 }}>
                            Slot Prompts ({debug.slots.length})
                          </div>
                          {debug.slots.map(slot => (
                            <div key={slot.slot} style={{ marginBottom: 10, padding: "8px 10px", background: "rgba(255,255,255,0.6)", borderRadius: 6 }}>
                              <div style={{ display: "flex", gap: 8, marginBottom: 4, alignItems: "center" }}>
                                <span style={{ fontWeight: 600 }}>#{slot.slot}</span>
                                <span style={{ color: "#888", fontSize: "0.72rem" }}>{slot.kind}</span>
                                <span className={styles[STATUS_CLASS[slot.status] ?? "badge"] ?? styles.badge} style={{ fontSize: "0.68rem", padding: "1px 6px" }}>
                                  {STATUS_LABELS[slot.status] ?? slot.status}
                                </span>
                                {slot.prompt && (
                                  <button
                                    type="button"
                                    title="Copy full prompt"
                                    aria-label={`Copy prompt for slot ${slot.slot}`}
                                    onClick={() => {
                                      navigator.clipboard.writeText(slot.prompt!).then(() => {
                                        const key = `${debug.shoot_id}-${slot.slot}`;
                                        setCopiedSlotPrompt(key);
                                        setTimeout(() => setCopiedSlotPrompt(prev => prev === key ? null : prev), 1500);
                                      });
                                    }}
                                    style={{ marginLeft: "auto", background: "none", border: "1px solid rgba(127,127,127,0.35)", borderRadius: 5, padding: "1px 7px", cursor: "pointer", fontSize: "0.68rem", color: "inherit" }}
                                  >
                                    {copiedSlotPrompt === `${debug.shoot_id}-${slot.slot}` ? "Copied!" : "📋 Copy"}
                                  </button>
                                )}
                              </div>
                              {slot.prompt ? (
                                <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "monospace", fontSize: "0.72rem", lineHeight: 1.5, color: "#334", margin: 0 }}>
                                  {slot.prompt.length > 600 ? slot.prompt.slice(0, 600) + "…" : slot.prompt}
                                </pre>
                              ) : (
                                <span style={{ color: "#aaa", fontStyle: "italic" }}>No prompt recorded</span>
                              )}
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      </>)}

      {tab === "people" && (<>
      {/* ---- Free generations (admin comps) ---- */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Free generations</h2>
        <p style={{ margin: "0 0 12px", opacity: 0.7, fontSize: "0.82rem" }}>
          Credit someone free images by email. They do not need an account yet — the credit is
          picked up the first time they book with that address. Images are spent per shoot, so
          10 can become one 10-image shoot or two 5s.
        </p>
        <div className={styles.couponForm}>
          <input
            className={styles.priceInput} style={{ width: 220 }} type="email"
            placeholder="their@email.com" value={grantEmail}
            onChange={e => setGrantEmail(e.target.value)}
          />
          <select
            className={`${styles.priceInput} ${styles.selectInput}`} value={grantImages}
            onChange={e => setGrantImages(e.target.value)}
          >
            <option value="1">1 image</option>
            <option value="5">5 images</option>
            <option value="10">10 images</option>
            <option value="20">20 images</option>
          </select>
          <input
            className={styles.priceInput} style={{ width: 200 }}
            placeholder="Note (why)" value={grantNote}
            onChange={e => setGrantNote(e.target.value)} maxLength={300}
          />
          <input
            className={styles.priceInput} style={{ width: 150 }} type="date"
            title="Optional expiry" value={grantExpires}
            onChange={e => setGrantExpires(e.target.value)}
          />
          <button type="button" className={styles.saveBtn} onClick={createGrant} disabled={grantSaving}>
            {grantSaving ? "Crediting..." : "Credit"}
          </button>
          {grantMsg && <span className={styles.saveMsg}>{grantMsg}</span>}
        </div>
        {grants.length === 0 ? (
          <p className={styles.empty}>No free generations issued yet.</p>
        ) : (
          <table className={styles.table} style={{ marginTop: 16 }}>
            <thead><tr><th>Email</th><th>Used</th><th>Left</th><th>Note</th><th>Expires</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {grants.map(g => (
                <tr key={g.id}>
                  <td className={styles.mono}>{g.email}</td>
                  <td>{g.images_used} / {g.images_granted}</td>
                  <td><strong>{g.images_remaining}</strong></td>
                  <td>{g.note ?? "—"}</td>
                  <td>{g.expires_at ? new Date(g.expires_at).toLocaleDateString() : "—"}</td>
                  <td>
                    <span className={g.is_active ? styles.activeBadge : styles.bannedBadge}>
                      {g.is_active ? "Active" : "Revoked"}
                    </span>
                  </td>
                  <td>
                    <button className={styles.banBtn} onClick={() => toggleGrant(g.id, g.is_active)}>
                      {g.is_active ? "Revoke" : "Restore"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ---- Owed to creators (free bookings skip the gateway split) ---- */}
      {owed.length > 0 && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Owed to creators</h2>
          <p style={{ margin: "0 0 12px", opacity: 0.7, fontSize: "0.82rem" }}>
            Free and sponsored bookings never reach Paystack, so no automatic split happens.
            These creators still earned their share — pay them, then mark it settled.
          </p>
          <table className={styles.table}>
            <thead><tr><th>Creator</th><th>Free bookings</th><th>Owed</th><th></th></tr></thead>
            <tbody>
              {owed.map(o => (
                <tr key={o.creator_id}>
                  <td>{o.creator_name ?? "—"}</td>
                  <td>{o.bookings}</td>
                  <td><strong>₦{o.owed_ngn.toLocaleString()}</strong></td>
                  <td>
                    <button
                      className={styles.banBtn}
                      onClick={() => settleCreator(o.creator_id)}
                      disabled={settling === o.creator_id}
                    >
                      {settling === o.creator_id ? "Settling..." : "Mark settled"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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

      </>)}

      {tab === "marketplace" && (<>
      {/* ---- Sponsored templates ---- */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Sponsored templates</h2>
        <p style={{ fontSize: "0.78rem", color: "#4e7076", margin: "0 0 12px" }}>
          A sponsor pays for a template so anyone can book it free. Each person gets one free
          shoot, and the campaign stops automatically at the booking cap — that cap is what
          protects you from a runaway generation bill, so it is required.
        </p>
        <div className={styles.couponForm}>
          <select
            className={`${styles.priceInput} ${styles.selectInput}`} style={{ width: 220 }}
            value={sponsorTemplateId} onChange={e => setSponsorTemplateId(e.target.value)}
          >
            <option value="">Choose a template…</option>
            {adminTemplates.filter(t => !t.is_sponsored && t.status === "published").map(t => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
          <input
            className={styles.priceInput} style={{ width: 140 }}
            placeholder="Sponsor (e.g. Netflix)" value={sponsorName}
            onChange={e => setSponsorName(e.target.value)} maxLength={60}
          />
          <select
            className={`${styles.priceInput} ${styles.selectInput}`} value={sponsorPkg}
            onChange={e => setSponsorPkg(e.target.value)}
          >
            <option value="1">1 image free</option>
            <option value="5">5 images free</option>
            <option value="10">10 images free</option>
          </select>
          <input
            className={styles.priceInput} style={{ width: 110 }} type="number" min={1}
            placeholder="Cap (shoots)" value={sponsorLimit}
            onChange={e => setSponsorLimit(e.target.value)}
          />
          <input
            className={styles.priceInput} style={{ width: 150 }} type="date"
            title="Optional end date" value={sponsorExpires}
            onChange={e => setSponsorExpires(e.target.value)}
          />
          <button type="button" className={styles.saveBtn} onClick={startSponsorship} disabled={sponsorSaving}>
            {sponsorSaving ? "Saving..." : "Make free"}
          </button>
          {sponsorMsg && <span className={styles.saveMsg}>{sponsorMsg}</span>}
        </div>
        {adminTemplates.filter(t => t.is_sponsored).length === 0 ? (
          <p className={styles.empty}>No sponsored templates running.</p>
        ) : (
          <table className={styles.table} style={{ marginTop: 16 }}>
            <thead><tr><th>Template</th><th>Sponsor</th><th>Free</th><th>Used / cap</th><th>Ends</th><th></th></tr></thead>
            <tbody>
              {adminTemplates.filter(t => t.is_sponsored).map(t => {
                const capped = t.sponsor_total_limit != null && t.sponsor_used_count >= t.sponsor_total_limit;
                const ended = !!t.sponsor_expires_at && new Date(t.sponsor_expires_at) <= new Date();
                return (
                  <tr key={t.id}>
                    <td>{t.title}</td>
                    <td>{t.sponsor_name ?? "—"}</td>
                    <td>{t.sponsor_package_size ?? "—"} images</td>
                    <td>
                      <strong>{t.sponsor_used_count}</strong> / {t.sponsor_total_limit ?? "∞"}
                      {(capped || ended) && (
                        <span className={styles.bannedBadge} style={{ marginLeft: 6 }}>
                          {capped ? "Cap reached" : "Ended"}
                        </span>
                      )}
                    </td>
                    <td>{t.sponsor_expires_at ? new Date(t.sponsor_expires_at).toLocaleDateString() : "—"}</td>
                    <td style={{ display: "flex", gap: 6 }}>
                      <button className={styles.banBtn} onClick={() => stopSponsorship(t.id)}>Stop</button>
                      <button className={styles.banBtn} onClick={() => resetSponsorCount(t.id)}>Reset count</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ---- Coupons ---- */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Coupon Codes</h2>
        <p style={{ fontSize: "0.78rem", color: "#4e7076", margin: "0 0 12px" }}>
          Discounts come entirely from Alux Art&apos;s earnings. Creator payouts are never reduced.
        </p>
        <div className={styles.couponForm}>
          <input className={styles.priceInput} style={{ width: 110 }} placeholder="CODE" value={couponCode} onChange={e => setCouponCode(e.target.value.toUpperCase())} maxLength={20} />
          <input className={styles.priceInput} style={{ width: 180 }} placeholder="Description" value={couponDesc} onChange={e => setCouponDesc(e.target.value)} />
          <select className={`${styles.priceInput} ${styles.selectInput}`} value={couponType} onChange={e => setCouponType(e.target.value as "percent" | "fixed")}>
            <option value="percent">% off (Alux Art absorbs)</option>
            <option value="fixed">₦ off (Alux Art absorbs)</option>
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
                <td>{c.discount_type === "percent" ? `${c.discount_value}% discount` : `₦${c.discount_value.toLocaleString()} discount`}</td>
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

      </>)}

      {tab === "settings" && (<>
      {/* ---- Error log ---- */}
      <ErrorsPanel />

      {/* ---- Pending migrations ---- */}
      <MigrationsCard />

      {/* ---- Shoot Package Pricing ---- */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Pricing & Commission</h2>
        <p style={{ fontSize: "0.8rem", color: "#7aafb4", margin: "0 0 16px" }}>
          Used when customers book directly from the studio page. Each creator&apos;s template on the marketplace has its own price set by the creator.
        </p>
        <p style={{ fontSize: "0.75rem", color: "#4e7076", margin: "0 0 10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Direct Studio Prices</p>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: "10px 16px", alignItems: "center", maxWidth: 480 }}>
          <div style={{ fontSize: "0.75rem", color: "#7aafb4" }}></div>
          <div style={{ fontSize: "0.75rem", color: "#7aafb4", textAlign: "center" }}>NGN (₦)</div>
          <div style={{ fontSize: "0.75rem", color: "#7aafb4", textAlign: "center" }}>USD ($)</div>
          <div style={{ fontSize: "0.8rem", color: "#4e7076" }}>1 image</div>
          <input className={styles.priceInput} type="number" min={100} step={100} value={price1NgnInput}
            onChange={e => setPrice1NgnInput(e.target.value)} style={{ width: "100%" }} />
          <input className={styles.priceInput} type="number" min={0.5} step={0.5} value={price1UsdInput}
            onChange={e => setPrice1UsdInput(e.target.value)} style={{ width: "100%" }} />
          <div style={{ fontSize: "0.8rem", color: "#4e7076" }}>5 images</div>
          <input className={styles.priceInput} type="number" min={500} step={100} value={price5NgnInput}
            onChange={e => setPrice5NgnInput(e.target.value)} style={{ width: "100%" }} />
          <input className={styles.priceInput} type="number" min={2} step={0.5} value={price5UsdInput}
            onChange={e => setPrice5UsdInput(e.target.value)} style={{ width: "100%" }} />
          <div style={{ fontSize: "0.8rem", color: "#4e7076" }}>10 images</div>
          <input className={styles.priceInput} type="number" min={1000} step={500} value={price10NgnInput}
            onChange={e => setPrice10NgnInput(e.target.value)} style={{ width: "100%" }} />
          <input className={styles.priceInput} type="number" min={5} step={0.5} value={price10UsdInput}
            onChange={e => setPrice10UsdInput(e.target.value)} style={{ width: "100%" }} />
        </div>
        <div style={{ marginTop: 20, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" className={styles.saveBtn} disabled={modelSaving}
            onClick={() => saveModelConfig({
              price_1_ngn: Number(price1NgnInput),
              price_5_ngn: Number(price5NgnInput),
              price_10_ngn: Number(price10NgnInput),
              price_1_usd: Number(price1UsdInput),
              price_5_usd: Number(price5UsdInput),
              price_10_usd: Number(price10UsdInput),
              platform_fee_ngn: Number(platformFeeInput),
            })}>
            {modelSaving ? "Saving…" : "Save prices"}
          </button>
          {modelMsg && <span className={styles.saveMsg}>{modelMsg}</span>}
        </div>
      </div>

      </>)}

      {tab === "people" && (<>
      {/* ---- Pending Creator Applications ---- */}
      {(() => {
        const pending = adminCreators.filter(c => c.status === "pending");
        return (
          <div className={styles.card} style={{ border: `1px solid ${pending.length > 0 ? "rgba(213, 163, 60, 0.32)" : "rgba(255,255,255,0.06)"}`, background: pending.length > 0 ? "rgba(255, 248, 220, 0.6)" : undefined }}>
            <h2 className={styles.cardTitle}>
              Pending Creator Applications
              <span style={{ marginLeft: 8, background: pending.length > 0 ? "rgba(213, 163, 60, 0.2)" : "rgba(255,255,255,0.08)", color: pending.length > 0 ? "#8a6000" : "rgba(255,255,255,0.3)", fontSize: "0.72rem", fontWeight: 700, padding: "2px 8px", borderRadius: 12 }}>
                {pending.length}
              </span>
            </h2>
            <p style={{ fontSize: "0.8rem", color: pending.length > 0 ? "#7a6030" : "rgba(255,255,255,0.3)", margin: "0 0 14px" }}>
              {pending.length > 0
                ? "Review each application and approve or decline. Approved creators receive a welcome email and can log in to their dashboard."
                : "No pending applications right now."}
            </p>
            {pending.length > 0 && (
              <table className={styles.table}>
                <thead><tr><th>Name</th><th>Email</th><th>Bank</th><th>Subaccount</th><th>Applied</th><th></th></tr></thead>
                <tbody>
                  {pending.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600 }}>{c.display_name}</td>
                      <td className={styles.mono} style={{ fontSize: "0.76rem" }}>{c.email ?? "—"}</td>
                      <td>{c.bank_name ?? "—"}{c.account_name ? ` · ${c.account_name}` : ""}</td>
                      <td className={styles.mono}>{c.paystack_subaccount_code ? c.paystack_subaccount_code.slice(0, 18) + "…" : "Not set"}</td>
                      <td>{new Date(c.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</td>
                      <td style={{ display: "flex", gap: 6 }}>
                        <button className={styles.banBtn} style={{ color: "#177767", borderColor: "rgba(23, 119, 103, 0.4)" }} onClick={() => approveCreator(c.id)}>Approve</button>
                        <button className={styles.banBtn} onClick={() => declineCreator(c.id)}>Decline</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })()}

      {/* ---- Creators ---- */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Creators</h2>
        <table className={styles.table}>
          <thead><tr><th>Name</th><th>Bank</th><th>Subaccount</th><th>Templates</th><th>Joined</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {adminCreators.filter(c => c.status !== "pending").map(c => (
              <tr key={c.id}>
                <td>{c.display_name}</td>
                <td>{c.bank_name ?? "—"}{c.account_name ? ` · ${c.account_name}` : ""}</td>
                <td className={styles.mono}>{c.paystack_subaccount_code ? c.paystack_subaccount_code.slice(0, 18) + "…" : "Not set"}</td>
                <td>{c.templateCount}</td>
                <td>{new Date(c.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</td>
                <td>
                  <span className={c.is_active ? styles.activeBadge : styles.bannedBadge}>
                    {c.status === "declined" ? "Declined" : c.is_active ? "Active" : "Suspended"}
                  </span>
                </td>
                <td><button className={styles.banBtn} onClick={() => toggleCreator(c.id, c.is_active)}>{c.is_active ? "Suspend" : "Activate"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>)}
    </div>
  );
}
