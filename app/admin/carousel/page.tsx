"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import cs from "./carousel.module.css";

/**
 * Carousel Studio — the planned Instagram carousels, on the website.
 *
 * Replaces the laptop app in tools/carousel. Each post waits for its before
 * and after photographs (and, for a Photo Wahala episode, two story pictures
 * made in Google Flow); then Preview → Approve → Schedule, and the server posts
 * it on time. Every rule lives in /api/admin/carousel; this page only shows
 * where a post stands and what to do next.
 */

type Card = { eyebrow: string; headline: string; body: string };
type CastMember = { name: string; real: boolean; note?: string; prompt?: string };
type Scene = { after: number; attach: string[]; prompt: string };

type ListPost = {
  local_id: string; batch: string; title: string; account: string;
  scheduled_for: string | null; status: string; slide_count: number;
  gif_cleared: boolean; has_photos: boolean; gif_made: boolean; giphy_url: string | null;
  publish_status: string | null; publish_error: string | null; published_at: string | null;
};

type Post = {
  id: string; batch: string; title: string; account: string;
  product: string | null; trigger: string | null; photosHint: string | null;
  cards: Card[]; caption: string; buttonText: string;
  storyboard: { story: number; cast: CastMember[]; scenes: Scene[]; flow: string } | null;
  sceneImages: (string | null)[]; before: string | null; after: string | null;
  gifLines: string[]; gifCleared: boolean; scheduledFor: string | null;
  status: string; slideCount: number; approvedAt: string | null; version: string;
};

type Detail = {
  post: Post;
  publish: { status: string; error: string | null; publishedAt: string | null } | null;
  gif: { url: string; bytes: number; seconds: number; giphyUrl: string | null } | null;
  accounts: string[];
};

/** What the owner edits; compared with the last save to know what is unsaved. */
type Form = { title: string; account: string; cards: Card[]; caption: string; buttonText: string; when: string; gifLines: string };

type Tone = "ok" | "bad" | "info";

// ---- time: everything the owner sees and types is Lagos time ----------------

/** Lagos is UTC+1 all year, with no daylight saving. */
const LAGOS_MS = 60 * 60 * 1000;
const toInput = (iso: string | null) =>
  iso ? new Date(new Date(iso).getTime() + LAGOS_MS).toISOString().slice(0, 16) : "";
const dayLabel = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short" }) : "No date";
const timeLabel = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit" }) : "";

/** The next Monday in Lagos, as the date box wants it. */
function nextMonday(): string {
  const d = new Date(Date.now() + LAGOS_MS);
  d.setUTCDate(d.getUTCDate() + (((8 - d.getUTCDay()) % 7) || 7));
  return d.toISOString().slice(0, 10);
}

// ---- where a post stands ------------------------------------------------------

type StateKey = "needs" | "draft" | "approved" | "scheduled" | "posted" | "failed";

function stateOf(status: string, publish: string | null | undefined): { key: StateKey; label: string } {
  if (publish === "published") return { key: "posted", label: "Posted" };
  if (publish === "publishing") return { key: "scheduled", label: "Posting now" };
  if (status === "scheduled" && publish === "failed") return { key: "failed", label: "Didn't post" };
  if (status === "needs_photos") return { key: "needs", label: "Needs photos" };
  if (status === "needs_pictures") return { key: "needs", label: "Needs pictures" };
  if (status === "approved") return { key: "approved", label: "Approved" };
  if (status === "scheduled") return { key: "scheduled", label: "Scheduled" };
  return { key: "draft", label: "Draft" };
}

const PILL: Record<StateKey, string> = {
  needs: cs.pill_needs, draft: cs.pill_draft, approved: cs.pill_approved,
  scheduled: cs.pill_scheduled, posted: cs.pill_posted, failed: cs.pill_failed,
};

const FILTERS: { key: string; label: string; test: (k: StateKey) => boolean }[] = [
  { key: "todo", label: "To do", test: (k) => k === "needs" || k === "draft" || k === "failed" },
  { key: "approved", label: "Approved", test: (k) => k === "approved" },
  { key: "scheduled", label: "Scheduled", test: (k) => k === "scheduled" },
  { key: "posted", label: "Posted", test: (k) => k === "posted" },
  { key: "all", label: "All", test: () => true },
];

// ---- talking to the server ------------------------------------------------------

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || `Something went wrong (${r.status}).`);
  return j as T;
}
const send = (method: string, body?: unknown): RequestInit => ({
  method, headers: { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

const formOf = (p: Post): Form => ({
  title: p.title, account: p.account,
  cards: (p.cards ?? []).map((c) => ({ eyebrow: c.eyebrow ?? "", headline: c.headline ?? "", body: c.body ?? "" })),
  caption: p.caption ?? "", buttonText: p.buttonText ?? "", when: toInput(p.scheduledFor),
  gifLines: (p.gifLines ?? []).join("\n"),
});
const linesOf = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);

// ---- a box to drop a picture on ----------------------------------------------------

function Drop({ label, hint, url, busy, disabled, onFile }: {
  label: string; hint: string; url: string | null; busy: boolean; disabled?: boolean;
  onFile: (f: File | undefined) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const pick = () => { if (!disabled && !busy) input.current?.click(); };
  return (
    <div
      role="button" tabIndex={disabled ? -1 : 0} aria-label={`${label}: ${url ? "click to replace" : hint}`}
      className={[cs.drop, url ? cs.dropHas : "", over ? cs.dropOver : "", busy ? cs.dropBusy : ""].join(" ")}
      onClick={pick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } }}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) onFile(e.dataTransfer.files?.[0]); }}
    >
      <span className={cs.dropLabel}>{label}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt={label} /> : <span>{hint}</span>}
      {busy ? <span>Uploading…</span> : url && !disabled ? <span className={cs.hintSmall}>Click or drop to replace</span> : null}
      <input
        ref={input} type="file" accept="image/*" hidden
        onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }}
      />
    </div>
  );
}

// ---- the page ------------------------------------------------------------------

export default function CarouselStudioPage() {
  const [list, setList] = useState<ListPost[] | null>(null);
  const [listErr, setListErr] = useState("");
  const [experiment, setExperiment] = useState({ total: 0, loaded: 0 });
  const [filter, setFilter] = useState("todo");

  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [saved, setSaved] = useState<Form | null>(null);
  const [preview, setPreview] = useState<{ slides: string[]; version: string; tooMany: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<{ text: string; tone: Tone } | null>(null);

  const [startMonday, setStartMonday] = useState(nextMonday);
  const [removeArmed, setRemoveArmed] = useState(false);
  const [batchMsg, setBatchMsg] = useState<{ text: string; tone: Tone } | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  // Light or dark, remembered under the same key as /studio and /marketplace
  // so the choice follows the owner from page to page (DESIGN.md).
  const [theme, setTheme] = useState<"light" | "dark">("light");

  /** The post the page is showing; answers that arrive for another one are dropped. */
  const showing = useRef<string | null>(null);
  /** The post's own scrolling column on a wide screen. */
  const editorRef = useRef<HTMLElement>(null);

  const dirty = Boolean(form && saved && JSON.stringify(form) !== JSON.stringify(saved));
  const say = (text: string, tone: Tone = "ok") => setMsg({ text, tone });

  const loadList = useCallback(async () => {
    try {
      const d = await call<{ posts: ListPost[]; experiment: { total: number; loaded: number } }>("/api/admin/carousel");
      setList(d.posts);
      setExperiment(d.experiment);
      setListErr("");
    } catch (e) {
      setListErr((e as Error).message);
    }
  }, []);
  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    const stored = localStorage.getItem("studio-theme");
    if (stored === "dark" || stored === "light") setTheme(stored);
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem("studio-theme", next);
      return next;
    });
  };

  // Closing the tab with unsaved words should ask first, like leaving a post does.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const leaveOk = () => !dirty || window.confirm("This post has changes you haven't saved. Leave it without saving?");

  const open = async (id: string) => {
    if (id === selected || !leaveOk()) return;
    showing.current = id;
    setSelected(id);
    setDetail(null); setForm(null); setSaved(null); setPreview(null); setMsg(null);
    try {
      const d = await call<Detail>(`/api/admin/carousel/${id}`);
      if (showing.current !== id) return;
      setDetail(d);
      const f = formOf(d.post);
      setForm(f); setSaved(f);
      editorRef.current?.scrollTo({ top: 0 });
      if (window.matchMedia("(max-width: 900px)").matches) window.scrollTo({ top: 0 });
    } catch (e) {
      if (showing.current === id) say((e as Error).message, "bad");
    }
  };

  const close = () => {
    if (!leaveOk()) return;
    showing.current = null;
    setSelected(null); setDetail(null); setForm(null); setSaved(null); setPreview(null); setMsg(null);
  };

  const id = detail?.post.id ?? null;
  const st = detail ? stateOf(detail.post.status, detail.publish?.status) : null;
  const locked = st?.key === "posted" || detail?.publish?.status === "publishing";

  const editCard = (i: number, k: keyof Card, v: string) =>
    setForm((f) => f && { ...f, cards: f.cards.map((c, j) => (j === i ? { ...c, [k]: v } : c)) });

  // ---- actions ----

  const save = async (): Promise<Post | null> => {
    if (!form || !id) return null;
    setBusy("save");
    try {
      const r = await call<{ post: Post; withdrawn: boolean }>(`/api/admin/carousel/${id}`, send("PATCH", {
        title: form.title, account: form.account, cards: form.cards, caption: form.caption,
        buttonText: form.buttonText, scheduledFor: form.when || null, gifLines: linesOf(form.gifLines),
      }));
      if (showing.current !== id) return null;
      setDetail((d) => d && {
        ...d, post: r.post,
        publish: r.withdrawn && d.publish ? { ...d.publish, status: "cancelled" } : d.publish,
      });
      const f = formOf(r.post);
      setForm(f); setSaved(f);
      say(r.withdrawn
        ? "Saved. It was scheduled, so it has been taken off the schedule. Approve it again, then schedule it."
        : "Saved.");
      loadList();
      return r.post;
    } catch (e) {
      say((e as Error).message, "bad");
      return null;
    } finally {
      setBusy(null);
    }
  };

  const showPreview = async () => {
    if (!id) return;
    if (dirty && !(await save())) return;
    setBusy("preview");
    say("Drawing the slides…", "info");
    try {
      const r = await call<{ slides: string[]; count: number; tooMany: boolean; version: string }>(
        `/api/admin/carousel/${id}/preview`, { method: "POST" });
      if (showing.current !== id) return;
      setPreview({ slides: r.slides, version: r.version, tooMany: r.tooMany });
      say(r.tooMany
        ? `${r.count} slides. Instagram takes at most 10, so remove a card.`
        : `${r.count} slides. Read every one, then press Approve.`, r.tooMany ? "bad" : "ok");
    } catch (e) {
      say((e as Error).message, "bad");
    } finally {
      setBusy(null);
    }
  };

  const approve = async () => {
    if (!id || !preview) return;
    setBusy("approve");
    try {
      await call(`/api/admin/carousel/${id}/approve`, send("POST", { version: preview.version }));
      setDetail((d) => d && { ...d, post: { ...d.post, status: "approved" } });
      say("Approved. Check the date and time, then press Schedule.");
      loadList();
    } catch (e) {
      say((e as Error).message, "bad");
    } finally {
      setBusy(null);
    }
  };

  const schedule = async () => {
    if (!id || !detail) return;
    setBusy("schedule");
    say("Sending it to the publisher…", "info");
    try {
      await call(`/api/admin/carousel/${id}/schedule`, { method: "POST" });
      setDetail((d) => d && {
        ...d, post: { ...d.post, status: "scheduled" },
        publish: { status: "queued", error: null, publishedAt: null },
      });
      say(`Scheduled for ${dayLabel(detail.post.scheduledFor)} at ${timeLabel(detail.post.scheduledFor)}. It posts on its own — nothing else to do.`);
      loadList();
    } catch (e) {
      say((e as Error).message, "bad");
    } finally {
      setBusy(null);
    }
  };

  const unschedule = async () => {
    if (!id) return;
    setBusy("unschedule");
    try {
      await call(`/api/admin/carousel/${id}/schedule`, { method: "DELETE" });
      setDetail((d) => d && {
        ...d, post: { ...d.post, status: "approved" },
        publish: d.publish ? { ...d.publish, status: "cancelled" } : null,
      });
      say("Taken off the schedule. It is still approved: schedule it again when you're ready.");
      loadList();
    } catch (e) {
      say((e as Error).message, "bad");
    } finally {
      setBusy(null);
    }
  };

  const upload = async (slot: string, file: File | undefined) => {
    if (!file || !id) return;
    const forPost = id;
    setUploading((u) => ({ ...u, [slot]: true }));
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("slot", slot);
      const r = await call<{ url: string; status: string; version: string; withdrawn: boolean }>(
        `/api/admin/carousel/${forPost}/upload`, { method: "POST", body: fd });
      if (showing.current !== forPost) return;
      setDetail((d) => {
        if (!d || d.post.id !== forPost) return d;
        const post = { ...d.post, status: r.status, version: r.version };
        if (slot === "before") post.before = r.url;
        else if (slot === "after") post.after = r.url;
        else {
          const imgs = [...post.sceneImages];
          imgs[Number(slot.split("-")[1])] = r.url;
          post.sceneImages = imgs;
        }
        return { ...d, post, publish: r.withdrawn && d.publish ? { ...d.publish, status: "cancelled" } : d.publish };
      });
      setPreview(null);
      say(r.withdrawn
        ? "Picture added. The post was scheduled, so it has been taken off the schedule: preview and approve it again."
        : "Picture added. Press Preview to see it in place.");
      loadList();
    } catch (e) {
      say((e as Error).message, "bad");
    } finally {
      setUploading((u) => ({ ...u, [slot]: false }));
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      say(`Prompt copied (${text.length} characters). Paste it into Google Flow.`);
    } catch {
      say("Couldn't copy automatically. Select the prompt text and copy it by hand.", "bad");
    }
  };

  // ---- the story GIF ----

  const makeGif = async () => {
    if (!id || !form) return;
    const lines = linesOf(form.gifLines);
    setBusy("gif");
    say("Making the GIF on the server…", "info");
    try {
      const r = await call<{ gif: NonNullable<Detail["gif"]> }>(`/api/admin/carousel/${id}/gif`, send("POST", { action: "make", lines }));
      if (showing.current !== id) return;
      setDetail((d) => d && { ...d, gif: r.gif, post: { ...d.post, gifLines: lines } });
      // The lines it was made from are saved with it.
      setForm((f) => f && { ...f, gifLines: lines.join("\n") });
      setSaved((s) => s && { ...s, gifLines: lines.join("\n") });
      say("GIF ready. Watch it before you upload: GIPHY is public.");
      loadList();
    } catch (e) {
      say((e as Error).message, "bad");
    } finally {
      setBusy(null);
    }
  };

  const setCleared = async (cleared: boolean) => {
    if (!id) return;
    setDetail((d) => d && { ...d, post: { ...d.post, gifCleared: cleared } });
    try {
      await call(`/api/admin/carousel/${id}/gif`, send("POST", { action: "clear", cleared }));
      loadList();
    } catch (e) {
      setDetail((d) => d && { ...d, post: { ...d.post, gifCleared: !cleared } });
      say((e as Error).message, "bad");
    }
  };

  const publishGif = async () => {
    if (!id || !detail) return;
    if (!detail.post.gifCleared) return say("Tick the box first: everyone in these photos must have agreed to a public GIF.", "bad");
    setBusy("giphy");
    say("Uploading to GIPHY…", "info");
    try {
      const r = await call<{ giphyUrl: string | null; already: boolean }>(`/api/admin/carousel/${id}/gif`, send("POST", { action: "publish", cleared: true }));
      setDetail((d) => d && d.gif ? { ...d, gif: { ...d.gif, giphyUrl: r.giphyUrl } } : d);
      say(r.already ? "This GIF was already on GIPHY, so nothing was uploaded twice." : "On GIPHY. It can take up to a day to show in search.");
      loadList();
    } catch (e) {
      say((e as Error).message, "bad");
    } finally {
      setBusy(null);
    }
  };

  // ---- batch tools ----

  const runBatch = async (label: string, pick: (p: ListPost) => boolean, body: object) => {
    const rows = (list ?? []).filter(pick);
    if (!rows.length) return setBatchMsg({ text: `Nothing to do: no post needs this right now.`, tone: "info" });
    setBatchBusy(true);
    let done = 0;
    for (const p of rows) {
      setBatchMsg({ text: `${label}: ${done + 1} of ${rows.length} — ${p.title}`, tone: "info" });
      try {
        await call(`/api/admin/carousel/${p.local_id}/gif`, send("POST", body));
        done++;
      } catch (e) {
        setBatchMsg({ text: `Stopped at "${p.title}": ${(e as Error).message} ${done} done before it.`, tone: "bad" });
        setBatchBusy(false);
        loadList();
        return;
      }
    }
    setBatchMsg({ text: `${label}: all ${done} done.`, tone: "ok" });
    setBatchBusy(false);
    loadList();
  };

  const loadExperiment = async () => {
    setBatchBusy(true);
    try {
      const r = await call<{ loaded: number; unscheduled: number; live: string[] }>("/api/admin/carousel", send("POST", { action: "load-experiment", startMonday }));
      setBatchMsg({
        text: `${r.loaded} episodes are in the list, starting ${dayLabel(`${startMonday}T12:00:00Z`)}.` +
          (r.unscheduled ? ` ${r.unscheduled} that were already scheduled moved date, so they were taken off the schedule: schedule them again.` : ""),
        tone: "ok",
      });
      loadList();
    } catch (e) {
      setBatchMsg({ text: (e as Error).message, tone: "bad" });
    } finally {
      setBatchBusy(false);
    }
  };

  // Two clicks, not one: this hides 44 posts and withdraws any already scheduled.
  const removeExperiment = async () => {
    if (!removeArmed) {
      setRemoveArmed(true);
      setTimeout(() => setRemoveArmed(false), 5000);
      return;
    }
    setRemoveArmed(false);
    setBatchBusy(true);
    try {
      const r = await call<{ removed: number; cancelled: number; live: string[] }>("/api/admin/carousel", send("POST", { action: "remove-experiment" }));
      let text = r.removed ? `Removed ${r.removed} episodes from the list.` : "The experiment wasn't in the list.";
      if (r.cancelled) text += ` ${r.cancelled} were scheduled and will not post now.`;
      if (r.live.length) {
        text += ` ${r.live.length} are already on Instagram and have to be deleted there by hand: ` +
          r.live.map((x) => x.replace("plan-", "").toUpperCase()).join(", ") + ".";
      }
      setBatchMsg({ text, tone: r.live.length ? "bad" : "ok" });
      if (selected && list?.find((p) => p.local_id === selected)?.batch === "microdrama") close();
      loadList();
    } catch (e) {
      setBatchMsg({ text: (e as Error).message, tone: "bad" });
    } finally {
      setBatchBusy(false);
    }
  };

  // ---- derived ----

  const states = useMemo(() => new Map((list ?? []).map((p) => [p.local_id, stateOf(p.status, p.publish_status)])), [list]);
  const shown = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter) ?? FILTERS[0];
    return (list ?? []).filter((p) => f.test(states.get(p.local_id)!.key));
  }, [list, filter, states]);
  const countFor = (key: string) => {
    const f = FILTERS.find((x) => x.key === key)!;
    return (list ?? []).filter((p) => f.test(states.get(p.local_id)!.key)).length;
  };

  const now = Date.now();
  const previewCurrent = Boolean(preview && detail && preview.version === detail.post.version);
  const datePassed = Boolean(detail?.post.scheduledFor && new Date(detail.post.scheduledFor).getTime() < now);

  // ---- render ----

  const topBar = (
    <nav className={cs.nav}>
      <div className={cs.navBrand}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Alux Art" className={cs.navLogo} />
        Carousel Studio
      </div>
      <div className={cs.navRight}>
        <Link href="/admin" className={cs.navBtn}>Admin</Link>
        <button type="button" className={`${cs.navBtn} ${cs.themeToggle}`} onClick={toggleTheme} aria-pressed={theme === "dark"}>
          {theme === "dark" ? "Light" : "Dark"}
        </button>
      </div>
    </nav>
  );

  if (listErr && !list) {
    return (
      <div className={cs.app} data-theme={theme}>
        {topBar}
        <div className={cs.empty}>
          {listErr === "Forbidden"
            ? <>This page is for the studio&apos;s admin. <Link className={cs.link} href="/login?next=/admin/carousel">Log in with the admin account</Link>.</>
            : listErr}
        </div>
      </div>
    );
  }

  return (
    <div className={cs.app} data-theme={theme}>
      {topBar}

      <div className={cs.main}>
        {/* ---- the list, and the batch tools ---- */}
        <aside className={`${cs.side} ${selected ? cs.hideNarrow : ""}`}>
          <section className={cs.panel} aria-label="Posts">
            <div className={cs.chips} role="tablist">
              {FILTERS.map((f) => (
                <button
                  key={f.key} type="button" role="tab" aria-selected={filter === f.key}
                  className={`${cs.chip} ${filter === f.key ? cs.chipOn : ""}`}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label} {list ? countFor(f.key) : ""}
                </button>
              ))}
            </div>
            <p className={cs.hintSmall}>Times are Lagos time. Slide 1 is always a photograph.</p>
            {!list && <p className={cs.hint}>Loading…</p>}
            {list && list.length === 0 && <p className={cs.hint}>No posts yet. The plan has not been loaded onto the server.</p>}
            {list && list.length > 0 && shown.length === 0 && <p className={cs.hint}>Nothing here.</p>}
            <div className={cs.list}>
              {shown.map((p) => {
                const s = states.get(p.local_id)!;
                const past = p.scheduled_for && new Date(p.scheduled_for).getTime() < now && s.key !== "posted";
                return (
                  <button
                    key={p.local_id} type="button"
                    className={`${cs.row} ${p.local_id === selected ? cs.rowOn : ""}`}
                    onClick={() => open(p.local_id)}
                  >
                    <span className={`${cs.when} ${past ? cs.whenPast : ""}`}>
                      {dayLabel(p.scheduled_for)}<br />{timeLabel(p.scheduled_for)}
                    </span>
                    <span className={cs.rowTitle}>{p.title}</span>
                    <span className={cs.rowMeta}>
                      <span className={`${cs.pill} ${PILL[s.key]}`}>{s.label}</span>
                      {past && <span className={`${cs.pill} ${cs.pill_needs}`}>Date passed</span>}
                      <span className={`${cs.gifMark} ${p.giphy_url ? cs.gifMarkOn : ""}`}>
                        {p.giphy_url ? "GIF on GIPHY" : p.gif_made ? "GIF made" : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className={cs.panel} aria-label="Photo Wahala experiment">
            <h2 className={cs.panelTitle}>Photo Wahala experiment</h2>
            <p className={cs.hint}>
              {experiment.loaded
                ? `${experiment.loaded} episodes are in the list, posting at 1pm so they never clash with the main posts at 7pm.`
                : "One story a week, posting at 1pm. Pick the Monday it starts, then load it."}
              {" "}One button takes it all out again, including any episode already scheduled.
            </p>
            <div className={cs.btns} style={{ marginTop: 10 }}>
              <input
                type="date" className={cs.input} style={{ maxWidth: 170 }} aria-label="Start Monday"
                value={startMonday} onChange={(e) => setStartMonday(e.target.value)}
              />
              <button type="button" className={`${cs.btn} ${cs.btnGhost}`} disabled={batchBusy} onClick={loadExperiment}>
                {experiment.loaded ? "Move start date" : "Load the experiment"}
              </button>
              {experiment.loaded > 0 && (
                <button type="button" className={`${cs.btn} ${cs.btnDanger}`} disabled={batchBusy} onClick={removeExperiment}>
                  {removeArmed ? `Click again to remove all ${experiment.loaded}` : "Remove the experiment"}
                </button>
              )}
            </div>
          </section>

          <section className={cs.panel} aria-label="Story GIFs">
            <h2 className={cs.panelTitle}>Story GIFs for every post</h2>
            <p className={cs.hint}>
              Makes a GIF for every post that has its photos and no GIF yet. Uploading sends only the ones
              whose box is ticked, and stops at the first thing GIPHY refuses.
            </p>
            <div className={cs.btns} style={{ marginTop: 10 }}>
              <button type="button" className={`${cs.btn} ${cs.btnGhost}`} disabled={batchBusy}
                onClick={() => runBatch("Making GIFs", (p) => p.has_photos && !p.gif_made, { action: "make" })}>
                Make GIFs for all
              </button>
              <button type="button" className={`${cs.btn} ${cs.btnGhost}`} disabled={batchBusy}
                onClick={() => runBatch("Uploading GIFs", (p) => p.gif_made && p.gif_cleared && !p.giphy_url, { action: "publish", cleared: true })}>
                Upload ticked GIFs
              </button>
            </div>
          </section>
          {batchMsg && (
            <p className={`${cs.msg} ${batchMsg.tone === "bad" ? cs.msgBad : batchMsg.tone === "ok" ? cs.msgOk : cs.msgInfo}`} role="status">
              {batchMsg.text}
            </p>
          )}
        </aside>

        {/* ---- one post ---- */}
        <section ref={editorRef} aria-label="Post" className={`${cs.editor} ${selected ? "" : cs.hideNarrow}`}>
          {!selected && (
            <section className={cs.panel}>
              <h2 className={cs.panelTitle}>How a post goes out</h2>
              <p className={cs.hint}>
                Pick a post. Add its before and after photos (an episode also needs its two story pictures from
                Google Flow), press Preview and read every slide, then Approve and Schedule. The server posts it
                at its time, whether or not anyone is online.
              </p>
            </section>
          )}

          {selected && !detail && (
            <section className={cs.panel}>
              <button type="button" className={cs.back} onClick={close}>← All posts</button>
              <p className={cs.hint}>{msg?.tone === "bad" ? msg.text : "Opening…"}</p>
            </section>
          )}

          {detail && form && st && (
            <>
              <section className={cs.panel}>
                <button type="button" className={cs.back} onClick={close}>← All posts</button>
                <div className={cs.editorHead}>
                  <input
                    className={cs.titleInput} aria-label="Post name (only you see this)" value={form.title} disabled={locked}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                  <span className={`${cs.pill} ${PILL[st.key]}`}>{st.label}</span>
                </div>
                {st.key === "posted" && (
                  <p className={cs.hintSmall}>
                    Posted on Instagram {detail.publish?.publishedAt ? `on ${dayLabel(detail.publish.publishedAt)} at ${timeLabel(detail.publish.publishedAt)}` : ""}.
                    Nothing here can change it now.
                  </p>
                )}
                {st.key === "failed" && (
                  <p className={`${cs.msg} ${cs.msgBad}`} style={{ marginTop: 8 }}>
                    It didn&apos;t post: {detail.publish?.error ?? "no reason given"}. Check Instagram first. Then give it a new
                    time, save, and schedule it again.
                  </p>
                )}
                {detail.post.photosHint && (
                  <p className={cs.hintSmall}><strong>Photos to use:</strong> {detail.post.photosHint}</p>
                )}
              </section>

              <section className={cs.panel}>
                <h2 className={cs.panelTitle}>Photos</h2>
                <div className={cs.drops}>
                  <Drop label="Before" hint="The phone photo. It becomes slide 1." url={detail.post.before}
                    busy={!!uploading.before} disabled={locked} onFile={(f) => upload("before", f)} />
                  <Drop label="After" hint="The finished photo. Slide 2, the payoff." url={detail.post.after}
                    busy={!!uploading.after} disabled={locked} onFile={(f) => upload("after", f)} />
                </div>
              </section>

              {detail.post.storyboard && (
                <section className={cs.panel}>
                  <h2 className={cs.panelTitle}>Story pictures, made in Google Flow</h2>
                  <p className={cs.hint}>{detail.post.storyboard.flow}. Two per episode, each going in after its card.</p>
                  <div className={cs.cast} style={{ marginTop: 10 }}>
                    {detail.post.storyboard.cast.map((c) => (
                      <div key={c.name} className={cs.castItem}>
                        <span><span className={cs.castName}>{c.name}</span>
                          {c.real ? " is a real person." : " is invented. Make this face once in Flow, then attach it to every scene they're in."}</span>
                        {c.real && c.note && <span className={cs.hintSmall}>{c.note}</span>}
                        {!c.real && c.prompt && (
                          <div className={cs.btns}>
                            <button type="button" className={`${cs.btn} ${cs.btnGhost} ${cs.btnSmall}`} onClick={() => copy(c.prompt!)}>
                              Copy portrait prompt
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className={cs.scenes} style={{ marginTop: 12 }}>
                    {detail.post.storyboard.scenes.map((s, i) => (
                      <div key={i} className={`${cs.scene} ${cs.cardItem}`}>
                        <span className={cs.cardNum}>PICTURE {i + 1} · GOES AFTER CARD {s.after}</span>
                        <span className={cs.hintSmall}>After: <em>{form.cards[s.after - 1]?.headline ?? ""}</em></span>
                        <span className={cs.hintSmall}>Attach in Flow: <strong>{s.attach.length ? s.attach.join(", ") : "nobody, no recurring face"}</strong></span>
                        <pre className={cs.prompt}>{s.prompt}</pre>
                        <div className={cs.btns}>
                          <button type="button" className={`${cs.btn} ${cs.btnGhost} ${cs.btnSmall}`} onClick={() => copy(s.prompt)}>Copy prompt</button>
                        </div>
                        <Drop label={`Picture ${i + 1}`} hint="Drop the picture from Flow here, or click" url={detail.post.sceneImages[i] ?? null}
                          busy={!!uploading[`scene-${i}`]} disabled={locked} onFile={(f) => upload(`scene-${i}`, f)} />
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className={cs.panel}>
                <h2 className={cs.panelTitle}>The cards</h2>
                <div className={cs.cardList}>
                  {form.cards.map((c, i) => (
                    <div key={i} className={cs.cardItem}>
                      <div className={cs.cardHead}>
                        <span className={cs.cardNum}>
                          CARD {i + 1}{i === 0 ? " · ON THE COVER, WITH THE PHOTOS" : i === form.cards.length - 1 ? " · THE BUTTON GOES HERE" : ""}
                        </span>
                        {!locked && (
                          <button type="button" className={`${cs.btn} ${cs.btnDanger} ${cs.btnSmall}`}
                            onClick={() => setForm({ ...form, cards: form.cards.filter((_c, j) => j !== i) })}>
                            Remove
                          </button>
                        )}
                      </div>
                      <input className={cs.input} placeholder="Small heading above (optional)" aria-label={`Card ${i + 1} small heading`}
                        value={c.eyebrow} disabled={locked} onChange={(e) => editCard(i, "eyebrow", e.target.value)} />
                      <textarea className={`${cs.textarea} ${cs.headline}`} placeholder="Headline" aria-label={`Card ${i + 1} headline`}
                        rows={Math.min(4, Math.max(2, Math.ceil(c.headline.length / 38)))}
                        value={c.headline} disabled={locked} onChange={(e) => editCard(i, "headline", e.target.value)} />
                      <textarea className={cs.textarea} placeholder="Body (optional)" aria-label={`Card ${i + 1} body`}
                        value={c.body} disabled={locked} onChange={(e) => editCard(i, "body", e.target.value)} />
                    </div>
                  ))}
                </div>
                {!locked && (
                  <div className={cs.btns} style={{ marginTop: 10 }}>
                    <button type="button" className={`${cs.btn} ${cs.btnGhost} ${cs.btnSmall}`}
                      onClick={() => setForm({ ...form, cards: [...form.cards, { eyebrow: "", headline: "", body: "" }] })}>
                      + Add a card
                    </button>
                  </div>
                )}
              </section>

              <section className={cs.panel}>
                <div className={cs.fields}>
                  <label className={cs.field}>
                    <span className={cs.label}>Post at (Lagos time)</span>
                    <input type="datetime-local" className={cs.input} value={form.when} disabled={locked}
                      onChange={(e) => setForm({ ...form, when: e.target.value })} />
                  </label>
                  <label className={cs.field}>
                    <span className={cs.label}>Account</span>
                    <select className={cs.select} value={form.account} disabled={locked}
                      onChange={(e) => setForm({ ...form, account: e.target.value })}>
                      {detail.accounts.map((a) => <option key={a} value={a}>@{a}</option>)}
                    </select>
                  </label>
                  <label className={cs.field}>
                    <span className={cs.label}>Button on the last card</span>
                    <input className={cs.input} value={form.buttonText} disabled={locked}
                      onChange={(e) => setForm({ ...form, buttonText: e.target.value })} />
                  </label>
                </div>
                {datePassed && st.key !== "posted" && (
                  <p className={`${cs.hintSmall} ${cs.warnText}`}>This date has passed. Give it a new one before scheduling.</p>
                )}
                <label className={cs.field} style={{ marginTop: 12 }}>
                  <span className={cs.label}>Caption</span>
                  <textarea className={cs.textarea} style={{ minHeight: 160 }} value={form.caption} disabled={locked}
                    onChange={(e) => setForm({ ...form, caption: e.target.value })} />
                  <span className={`${cs.counter} ${form.caption.length > 2200 ? cs.counterOver : ""}`}>
                    {form.caption.length.toLocaleString()} / 2,200
                  </span>
                </label>
              </section>

              {!locked && (
                <div className={cs.actions}>
                  <div className={cs.btns}>
                    <button type="button" className={`${cs.btn} ${cs.btnGhost}`} disabled={!dirty || !!busy} onClick={save}>
                      {busy === "save" ? "Saving…" : dirty ? "Save" : "Saved"}
                    </button>
                    <button type="button" className={`${cs.btn} ${cs.btnGhost}`} disabled={!!busy} onClick={showPreview}>
                      {busy === "preview" ? "Drawing…" : dirty ? "Save & preview" : "Preview"}
                    </button>
                    {(st.key === "draft" || st.key === "needs") && (
                      <button type="button" className={cs.btn}
                        disabled={!!busy || dirty || st.key === "needs" || !previewCurrent || !!preview?.tooMany}
                        title={st.key === "needs" ? "Add the photos first" : !previewCurrent ? "Preview it first" : undefined}
                        onClick={approve}>
                        {busy === "approve" ? "Approving…" : "Approve"}
                      </button>
                    )}
                    {(st.key === "approved" || st.key === "failed") && (
                      <button type="button" className={cs.btn} disabled={!!busy || dirty || datePassed} onClick={schedule}
                        title={datePassed ? "Give it a new date first" : undefined}>
                        {busy === "schedule" ? "Scheduling…" : st.key === "failed" ? "Schedule again" : "Schedule"}
                      </button>
                    )}
                    {st.key === "scheduled" && (
                      <button type="button" className={`${cs.btn} ${cs.btnDanger}`} disabled={!!busy} onClick={unschedule}>
                        {busy === "unschedule" ? "Taking it off…" : "Unschedule"}
                      </button>
                    )}
                  </div>
                  {msg && (
                    <p className={`${cs.msg} ${msg.tone === "bad" ? cs.msgBad : msg.tone === "ok" ? cs.msgOk : cs.msgInfo}`} role="status">
                      {msg.text}
                    </p>
                  )}
                </div>
              )}
              {locked && msg && (
                <p className={`${cs.msg} ${msg.tone === "bad" ? cs.msgBad : cs.msgInfo}`} role="status">{msg.text}</p>
              )}

              {preview && (
                <section className={cs.panel}>
                  <h2 className={cs.panelTitle}>
                    Preview{previewCurrent ? "" : " — out of date, press Preview again"}
                  </h2>
                  <div className={cs.slides}>
                    {preview.slides.map((src, i) => (
                      <figure key={i}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt={`Slide ${i + 1}`} />
                        <figcaption>Slide {i + 1}</figcaption>
                      </figure>
                    ))}
                  </div>
                </section>
              )}

              <section className={cs.panel}>
                <h2 className={cs.panelTitle}>Story GIF, for Instagram comments</h2>
                <p className={cs.hint}>
                  One short line each, three or four words: a GIF in a comment is tiny. The before photo shows until
                  the last line, when the after appears. Your web address is added at the end.
                </p>
                <textarea className={cs.textarea} style={{ marginTop: 10, minHeight: 110 }} aria-label="GIF lines, one per line"
                  value={form.gifLines} onChange={(e) => setForm({ ...form, gifLines: e.target.value })} />
                <label className={cs.tick} style={{ marginTop: 10 }}>
                  <input type="checkbox" checked={detail.post.gifCleared} onChange={(e) => setCleared(e.target.checked)} />
                  Everyone in these photos agreed to a public GIF. GIPHY is public: anyone can find, download and reuse it.
                </label>
                <div className={cs.btns} style={{ marginTop: 10 }}>
                  <button type="button" className={`${cs.btn} ${cs.btnGhost}`} disabled={!!busy || !detail.post.before || !detail.post.after}
                    title={!detail.post.before || !detail.post.after ? "Add the photos first" : undefined} onClick={makeGif}>
                    {busy === "gif" ? "Making…" : detail.gif ? "Make it again" : "Make GIF"}
                  </button>
                  <button type="button" className={`${cs.btn} ${cs.btnGhost}`}
                    disabled={!!busy || !detail.gif || !!detail.gif.giphyUrl} onClick={publishGif}>
                    {busy === "giphy" ? "Uploading…" : detail.gif?.giphyUrl ? "On GIPHY" : "Upload to GIPHY"}
                  </button>
                </div>
                {detail.gif && (
                  <div className={cs.gifOut} style={{ marginTop: 12 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={detail.gif.url} alt="Story GIF" />
                    <p className={cs.hintSmall}>
                      {Number(detail.gif.seconds).toFixed(1)} seconds · {Math.round(detail.gif.bytes / 1024)} KB
                      {detail.gif.giphyUrl && <> · <a className={cs.link} href={detail.gif.giphyUrl} target="_blank" rel="noopener noreferrer">on GIPHY</a></>}
                    </p>
                  </div>
                )}
              </section>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
