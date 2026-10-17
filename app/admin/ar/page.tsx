"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import cs from "../carousel/carousel.module.css";
import st from "./ar.module.css";

/**
 * AR balloon campaigns — every one sold, newest first, with the one switch
 * the owner has: Suspend / Unsuspend. Built on the carousel studio's tokens
 * (DESIGN.md App look), light and dark through the same studio-theme switch.
 */

type Campaign = {
  id: string; shootId: string; brandName: string; tagline: string;
  status: "scheduled" | "live" | "ended" | "suspended"; suspended: boolean;
  startsAt: string; endsAt: string; lat: number; lng: number; radiusM: number;
  publicUrl: string; previewUrl: string; logoUrl: string; mapsUrl: string;
  counts: { opens: number; activations: number; photos: number };
  buyerEmail: string | null; bookedAt: string; colors: [string, string];
  raceUrl: string; prizeLabel: string;
  bounty: { prizes: number; prizesLeft: number; races: number; finished: number };
};

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || `Something went wrong (${r.status}).`);
  return j as T;
}

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "short", year: "numeric" });

const PILL: Record<Campaign["status"], string> = {
  scheduled: cs.pill_scheduled, live: cs.pill_posted, ended: cs.pill_draft, suspended: cs.pill_failed,
};
const LABEL: Record<Campaign["status"], string> = {
  scheduled: "Scheduled", live: "Live", ended: "Ended", suspended: "Suspended",
};

export default function AdminArPage() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [list, setList] = useState<Campaign[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const j = await call<{ campaigns: Campaign[] }>("/api/admin/ar");
      setList(j.campaigns);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("studio-theme");
      if (stored === "dark" || stored === "light") setTheme(stored);
    } catch { /* private mode */ }
  }, []);
  const toggleTheme = () => setTheme((prev) => {
    const next = prev === "dark" ? "light" : "dark";
    try { localStorage.setItem("studio-theme", next); } catch { /* private mode */ }
    return next;
  });

  const flip = async (c: Campaign) => {
    const next = c.suspended ? "active" : "suspended";
    if (!c.suspended && !confirm(`Suspend ${c.brandName}? Its page will say the experience has ended until you unsuspend it.`)) return;
    setBusy(c.id);
    try {
      await call("/api/admin/ar", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id, status: next }) });
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const topBar = (
    <nav className={cs.nav}>
      <div className={cs.navBrand}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={cs.navLogo} src="/logo.png" alt="" />
        <span>AR campaigns</span>
      </div>
      <div className={cs.navRight}>
        <Link className={cs.navBtn} href="/admin">← Admin</Link>
        <button type="button" className={`${cs.navBtn} ${cs.themeToggle}`} onClick={toggleTheme} aria-pressed={theme === "dark"}>
          {theme === "dark" ? "Light" : "Dark"}
        </button>
      </div>
    </nav>
  );

  if (err && !list) {
    return (
      <div className={cs.app} data-theme={theme}>
        {topBar}
        <div className={st.wrap}>
          <p className={cs.hint}>
            {err === "Forbidden"
              ? <>This page is for the studio&apos;s admin. <Link className={cs.link} href="/login?next=/admin/ar">Log in with the admin account</Link>.</>
              : err}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cs.app} data-theme={theme}>
      {topBar}
      <div className={st.wrap}>
        <section className={cs.panel}>
          <p className={cs.panelTitle}>Every balloon campaign</p>
          <p className={cs.hint}>
            Live the moment payment clears. Suspend one if its logo or name should not be public; its page then says the
            experience has ended, and Unsuspend brings it back. Counts leave the buyer&apos;s own preview visits out.
          </p>
          {!list && <p className={cs.hint}>Loading…</p>}
          {list && list.length === 0 && <p className={cs.hint}>No campaigns yet.</p>}
          {list && list.length > 0 && (
            <div className={st.list}>
              {list.map((c) => (
                <div key={c.id} className={st.card}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className={st.logo} src={`${c.logoUrl}&width=160&format=webp`} alt="" />
                  <div className={st.body}>
                    <div className={st.head}>
                      <span className={st.brand}>{c.brandName}</span>
                      <span className={`${cs.pill} ${PILL[c.status]}`}>{LABEL[c.status]}</span>
                      <span className={st.swatch} style={{ background: c.colors[0] }} />
                      <span className={st.swatch} style={{ background: c.colors[1] }} />
                    </div>
                    {c.tagline && <p className={st.tagline}>{c.tagline}</p>}
                    <p className={cs.hintSmall}>
                      {c.buyerEmail ?? "unknown buyer"} · booked {day(c.bookedAt)} · runs {day(c.startsAt)} – {day(c.endsAt)} · {c.radiusM} m
                    </p>
                    <p className={cs.hintSmall}>
                      {c.counts.opens} opens · {c.counts.activations} activations · {c.counts.photos} photos
                      {c.bounty.prizes > 0 && <> · bounty: {c.bounty.prizesLeft} of {c.bounty.prizes} prizes left ({c.prizeLabel}), {c.bounty.races} hunts, {c.bounty.finished} finished</>}
                    </p>
                    <div className={cs.btns}>
                      <a className={`${cs.btn} ${cs.btnGhost} ${cs.btnSmall}`} href={c.publicUrl} target="_blank" rel="noopener noreferrer">Public link</a>
                      <a className={`${cs.btn} ${cs.btnGhost} ${cs.btnSmall}`} href={c.previewUrl} target="_blank" rel="noopener noreferrer">Preview anywhere</a>
                      <a className={`${cs.btn} ${cs.btnGhost} ${cs.btnSmall}`} href={c.mapsUrl} target="_blank" rel="noopener noreferrer">Map</a>
                      {c.bounty.prizes > 0 && <a className={`${cs.btn} ${cs.btnGhost} ${cs.btnSmall}`} href={c.raceUrl} target="_blank" rel="noopener noreferrer">Race link</a>}
                      <button type="button" className={`${cs.btn} ${c.suspended ? cs.btnGhost : cs.btnDanger} ${cs.btnSmall}`}
                        disabled={busy === c.id} onClick={() => flip(c)}>
                        {c.suspended ? "Unsuspend" : "Suspend"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
