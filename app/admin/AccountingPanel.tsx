"use client";

import { useEffect, useState, useCallback } from "react";
import type { AccountingSummary } from "@/lib/accounting";

/**
 * The accounting tab.
 *
 * Its own component rather than another block in app/admin/page.tsx, which is
 * already 1,587 lines: the admin page gains three lines and this file owns
 * everything else. Same shape as app/studio/WalletPanel.tsx.
 *
 * Every figure comes from the server. Nothing is recomputed here — a number
 * that is derived in the browser is a number that can disagree with the one in
 * the database, and money is the last place to allow that.
 */

type Expense = {
  id: string; incurred_on: string; category: string; vendor: string | null;
  description: string | null; amount_ngn: number;
  recurs_monthly: boolean; recurs_until: string | null;
};
type Rate = { model: string; usd_per_image: string; note: string | null };
type Invoice = { month: string; usd_actual: string; ngn_rate: string; note: string | null };

const CATEGORIES = ["hosting", "ai", "ads", "tools", "fees", "salaries", "other"];

const ngn = (n: number) => "₦" + Math.round(n || 0).toLocaleString("en-NG");
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");

export default function AccountingPanel() {
  const [data, setData] = useState<{
    summary: AccountingSummary; expenses: Expense[]; rateCard: Rate[]; invoices: Invoice[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/accounting");
      if (!res.ok) throw new Error(res.status === 403 ? "Admins only" : "Could not load");
      setData(await res.json());
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/accounting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(out.error ?? "Could not save"); return false; }
      await load();
      return true;
    } finally { setBusy(false); }
  };

  if (loading) return <p style={{ opacity: 0.7 }}>Working out the numbers…</p>;
  if (err && !data) return <p style={{ color: "#c0392b" }}>{err}</p>;
  if (!data) return null;

  const { summary: s } = data;
  const profitColour = s.profit >= 0 ? "#1e8e3e" : "#c0392b";

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {err && <p style={{ color: "#c0392b" }}>{err}</p>}

      {/* ── Needs attention ─────────────────────────────────────────────────
          Deliberately first. A dashboard that shows a confident total above a
          warning that the total is wrong has its priorities backwards. */}
      {s.attention.length > 0 && (
        <section>
          <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>Needs attention</h3>
          <div style={{ display: "grid", gap: 8 }}>
            {s.attention.map((a, i) => (
              <div key={i} style={{
                padding: 12, borderRadius: 8,
                borderLeft: `1px solid ${a.severity === "high" ? "#c0392b" : "#d68910"}`,
                background: a.severity === "high" ? "rgba(192,57,43,0.07)" : "rgba(214,137,16,0.07)",
              }}>
                <strong style={{ fontSize: ".9rem" }}>{a.title}</strong>
                <p style={{ margin: "4px 0 0", fontSize: ".82rem", opacity: 0.85 }}>{a.detail}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── The headline ────────────────────────────────────────────────── */}
      <section>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
          <Figure label="Money in" value={ngn(s.revenue.total)} />
          <Figure label="Cost of sales" value={ngn(s.cost.total)} />
          <Figure label="Expenses" value={ngn(s.expenses.total)} />
          <Figure label="Profit" value={ngn(s.profit)} colour={profitColour} />
        </div>
        <p style={{ fontSize: ".78rem", opacity: 0.7, marginTop: 8 }}>
          Money in counts only payments that actually settled through a gateway.{" "}
          <strong>{s.comped.count}</strong> bookings were given away free
          {s.comped.notional > 0 && <> (notionally {ngn(s.comped.notional)})</>} and are excluded.
        </p>
      </section>

      {/* ── Where it came from, what it cost ────────────────────────────── */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 20 }}>
        <div>
          <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>Where the money came from</h3>
          <Row label="Marketplace" value={ngn(s.revenue.marketplace)} sub={pct(s.revenue.marketplace, s.revenue.total)} />
          <Row label="Direct bookings" value={ngn(s.revenue.direct)} sub={pct(s.revenue.direct, s.revenue.total)} />
          <Row label="Retouching" value={ngn(s.revenue.retouch)} sub={pct(s.revenue.retouch, s.revenue.total)} />
        </div>
        <div>
          <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>What it cost</h3>
          <Row label="AI images (estimated)" value={ngn(s.cost.falEstimated)} />
          {s.cost.falActual !== null && (
            <Row label="AI images (invoiced)" value={ngn(s.cost.falActual)} />
          )}
          <Row label="Payment gateway fees" value={ngn(s.cost.gatewayFees)} />
          {s.cost.thirdPartyPayouts > 0 && (
            <Row label="Payouts to other creators" value={ngn(s.cost.thirdPartyPayouts)} />
          )}
        </div>
      </section>

      {/* ── Month by month ─────────────────────────────────────────────── */}
      <section>
        <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>Month by month</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".85rem" }}>
            <thead>
              <tr style={{ textAlign: "left", opacity: 0.7 }}>
                <th style={th}>Month</th><th style={thR}>In</th><th style={thR}>AI</th>
                <th style={thR}>Fees</th><th style={thR}>Expenses</th>
                <th style={thR}>Profit</th><th style={thR}>Images</th>
              </tr>
            </thead>
            <tbody>
              {s.months.map(m => (
                <tr key={m.month} style={{ borderTop: "1px solid rgba(127,127,127,.2)" }}>
                  <td style={td}>{m.month}</td>
                  <td style={tdR}>{ngn(m.revenue)}</td>
                  <td style={tdR}>{ngn(m.falEstimated)}</td>
                  <td style={tdR}>{ngn(m.gatewayFees)}</td>
                  <td style={tdR}>{ngn(m.expenses)}</td>
                  <td style={{ ...tdR, color: m.profit >= 0 ? "#1e8e3e" : "#c0392b", fontWeight: 600 }}>
                    {ngn(m.profit)}
                  </td>
                  <td style={tdR}>{m.images}</td>
                </tr>
              ))}
              {s.months.length === 0 && (
                <tr><td style={td} colSpan={7}>Nothing yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Expenses ───────────────────────────────────────────────────── */}
      <ExpenseSection expenses={data.expenses} busy={busy} onAdd={post}
        byCategory={s.expenses.byCategory} />

      {/* ── AI cost settings ───────────────────────────────────────────── */}
      <RateSection rateCard={data.rateCard} invoices={data.invoices} busy={busy} onSave={post} />
    </div>
  );
}

/* ── small presentational pieces ─────────────────────────────────────────── */

const th: React.CSSProperties = { padding: "6px 8px", fontWeight: 600 };
const thR: React.CSSProperties = { ...th, textAlign: "right" };
const td: React.CSSProperties = { padding: "6px 8px" };
const tdR: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };

function Figure({ label, value, colour }: { label: string; value: string; colour?: string }) {
  return (
    <div style={{ padding: 14, borderRadius: 10, background: "rgba(127,127,127,0.08)" }}>
      <div style={{ fontSize: ".75rem", opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: "1.3rem", fontWeight: 700, color: colour, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "5px 0",
                  borderTop: "1px solid rgba(127,127,127,.15)", fontSize: ".88rem" }}>
      <span>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>
        {value}{sub && <span style={{ opacity: 0.55, marginLeft: 6 }}>{sub}</span>}
      </span>
    </div>
  );
}

function ExpenseSection({ expenses, byCategory, busy, onAdd }: {
  expenses: Expense[];
  byCategory: Array<{ category: string; amount: number }>;
  busy: boolean;
  onAdd: (b: Record<string, unknown>) => Promise<boolean>;
}) {
  const [form, setForm] = useState({
    incurredOn: new Date().toISOString().slice(0, 10),
    category: "hosting", vendor: "", description: "", amountNgn: "",
    recursMonthly: false,
  });

  const submit = async () => {
    const amount = Number(form.amountNgn);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const ok = await onAdd({ kind: "expense", ...form, amountNgn: amount });
    if (ok) setForm({ ...form, vendor: "", description: "", amountNgn: "" });
  };

  return (
    <section>
      <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>What we spend</h3>

      {byCategory.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {byCategory.map(c => (
            <span key={c.category} style={{ padding: "3px 9px", borderRadius: 99,
              background: "rgba(127,127,127,0.12)", fontSize: ".78rem" }}>
              {c.category} {ngn(c.amount)}
            </span>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <input type="date" value={form.incurredOn} style={input}
          onChange={e => setForm({ ...form, incurredOn: e.target.value })} />
        <select value={form.category} style={input}
          onChange={e => setForm({ ...form, category: e.target.value })}>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input placeholder="Who (Hetzner, Meta…)" value={form.vendor} style={input}
          onChange={e => setForm({ ...form, vendor: e.target.value })} />
        <input placeholder="What for" value={form.description} style={{ ...input, minWidth: 160 }}
          onChange={e => setForm({ ...form, description: e.target.value })} />
        <input placeholder="₦ amount" inputMode="numeric" value={form.amountNgn} style={{ ...input, width: 110 }}
          onChange={e => setForm({ ...form, amountNgn: e.target.value.replace(/[^\d]/g, "") })} />
        <label style={{ fontSize: ".82rem", display: "flex", alignItems: "center", gap: 5 }}>
          <input type="checkbox" checked={form.recursMonthly}
            onChange={e => setForm({ ...form, recursMonthly: e.target.checked })} />
          every month
        </label>
        <button onClick={submit} disabled={busy} style={btn}>Add</button>
      </div>
      <p style={{ fontSize: ".76rem", opacity: 0.65, margin: "0 0 10px" }}>
        Tick <em>every month</em> for things like the VPS. It is entered once and counted in every
        month from that date, so a month you forget cannot quietly turn into profit.
      </p>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".85rem" }}>
          <tbody>
            {expenses.map(e => (
              <tr key={e.id} style={{ borderTop: "1px solid rgba(127,127,127,.2)" }}>
                <td style={td}>{String(e.incurred_on).slice(0, 10)}</td>
                <td style={td}>{e.category}</td>
                <td style={td}>{e.vendor ?? ""}{e.description ? ` — ${e.description}` : ""}</td>
                <td style={td}>{e.recurs_monthly ? "monthly" : ""}</td>
                <td style={tdR}>{ngn(e.amount_ngn)}</td>
              </tr>
            ))}
            {expenses.length === 0 && (
              <tr><td style={td} colSpan={5}>Nothing recorded yet. The VPS is a good first entry.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RateSection({ rateCard, invoices, busy, onSave }: {
  rateCard: Rate[]; invoices: Invoice[]; busy: boolean;
  onSave: (b: Record<string, unknown>) => Promise<boolean>;
}) {
  const [inv, setInv] = useState({
    month: new Date().toISOString().slice(0, 7), usdActual: "", ngnRate: "",
  });

  return (
    <section>
      <h3 style={{ margin: "0 0 4px", fontSize: "1rem" }}>What the AI costs</h3>
      <p style={{ fontSize: ".78rem", opacity: 0.7, margin: "0 0 10px" }}>
        fal has no billing API, so cost is worked out from the model recorded on every image.
        Enter the real invoice each month and the estimate is checked against it.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <input type="month" value={inv.month} style={input}
          onChange={e => setInv({ ...inv, month: e.target.value })} />
        <input placeholder="$ on the invoice" inputMode="decimal" value={inv.usdActual} style={{ ...input, width: 130 }}
          onChange={e => setInv({ ...inv, usdActual: e.target.value })} />
        <input placeholder="₦ per $1" inputMode="decimal" value={inv.ngnRate} style={{ ...input, width: 110 }}
          onChange={e => setInv({ ...inv, ngnRate: e.target.value })} />
        <button disabled={busy} style={btn} onClick={() => onSave({
          kind: "invoice", month: inv.month,
          usdActual: Number(inv.usdActual), ngnRate: Number(inv.ngnRate),
        })}>Save invoice</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 20 }}>
        <div>
          <strong style={{ fontSize: ".85rem" }}>Price per image</strong>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".82rem", marginTop: 4 }}>
            <tbody>
              {rateCard.map(r => (
                <tr key={r.model} style={{ borderTop: "1px solid rgba(127,127,127,.15)" }}>
                  <td style={td}>{r.model}</td>
                  <td style={tdR}>${Number(r.usd_per_image).toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <strong style={{ fontSize: ".85rem" }}>Invoices entered</strong>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".82rem", marginTop: 4 }}>
            <tbody>
              {invoices.map(i => (
                <tr key={String(i.month)} style={{ borderTop: "1px solid rgba(127,127,127,.15)" }}>
                  <td style={td}>{String(i.month).slice(0, 7)}</td>
                  <td style={tdR}>${Number(i.usd_actual).toFixed(2)}</td>
                  <td style={tdR}>@{Number(i.ngn_rate).toFixed(0)}</td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr><td style={td} colSpan={3}>None yet — AI cost shows as ₦0 until one is entered.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

const input: React.CSSProperties = {
  padding: "6px 9px", borderRadius: 7, border: "1px solid rgba(127,127,127,0.35)",
  background: "transparent", color: "inherit", fontSize: ".85rem",
};
const btn: React.CSSProperties = {
  padding: "6px 14px", borderRadius: 7, border: "none", cursor: "pointer",
  background: "#2f8e9a", color: "#fff", fontWeight: 600, fontSize: ".85rem",
};
