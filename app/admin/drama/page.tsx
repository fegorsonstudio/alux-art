"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import styles from "../../d/drama/drama.module.css";
import DramaShell from "../../d/drama/DramaShell";

/**
 * The drama desk: the owner previews an episode, edits its caption, approves
 * it, and schedules it for Instagram; watches the vote; checks cast photos and
 * brand slots. Nothing posts without Approve and then Schedule.
 */

type Opt = { word: string; label: string };
type Written = {
  n: number; title: string; options: Opt[];
  made: { id: string; status: string; decided: string | null; postedAt: string | null; caption: string } | null;
  queue: { status: string; at: string; error: string | null } | null;
  votes: { word: string; voter: string; at: string }[];
  art: { slide: number; captionAt: string; source: string; url: string | null }[];
};
type Story = {
  slug: string; title: string; status: string; igAccount: string; minVotes: number;
  cast: { key: string; name: string; tier: string }[];
  written: Written[];
  claims: { id: string; role: string; name: string; status: string; price: number; at: string; photo: string | null; portrait: string | null; renders: number; error: string | null }[];
  placements: { id: string; episode: number; slot: string; brand: string; contact: string; note: string | null; status: string; price: number; at: string; picture: string | null }[];
};

const lagos = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

async function call(body: Record<string, unknown>) {
  const r = await fetch("/api/admin/drama", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j;
}

export default function DramaDesk() {
  const [stories, setStories] = useState<Story[] | null>(null);
  const [error, setError] = useState("");
  const [slug, setSlug] = useState("the-silent-partner");
  const load = useCallback(async () => {
    const r = await fetch("/api/admin/drama", { cache: "no-store" });
    if (r.status === 403) { setError("This page is for the studio's admin account."); return; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setError(j.error ?? "Could not load."); return; }
    setStories(j.stories);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const story = stories?.find((s) => s.slug === slug) ?? stories?.[0];

  return (
    <DramaShell dock={[
      { href: "#top", label: "Stories", icon: "stories" },
      { href: "#episodes", label: "Episodes", icon: "home" },
      { href: "#cast", label: "Cast", icon: "cast" },
      { href: "#brands", label: "Brands", icon: "brands" },
    ]}>
      <div className={styles.eyebrow} style={{ marginTop: 8 }}>Admin · drama desk</div>
      <h1 className={styles.heroTitle} style={{ fontSize: "clamp(30px, 6vw, 44px)" }}>Alux Micro Drama</h1>
      {error && <p className={styles.error}>{error}</p>}
      {!stories && !error && <p className={styles.p}>Loading…</p>}
      {stories && (
        <>
          <div className={styles.chips} style={{ marginTop: 6 }}>
            {stories.map((s) => (
              <button key={s.slug} type="button" onClick={() => setSlug(s.slug)} className={`${styles.chip} ${s.slug === story?.slug ? styles.chipLive : ""}`} style={{ cursor: "pointer", font: "inherit", fontSize: 12 }}>
                {s.title}{s.status === "live" ? " · live" : ""}
              </button>
            ))}
          </div>
          {story && <StoryDesk key={story.slug} story={story} reload={load} />}
        </>
      )}
    </DramaShell>
  );
}

function StoryDesk({ story, reload }: { story: Story; reload: () => Promise<void> }) {
  return (
    <>
      <p className={styles.p}>
        Plays on <a href={`https://www.instagram.com/${story.igAccount}/`} target="_blank" rel="noopener noreferrer">@{story.igAccount}</a> ·{" "}
        most votes by 4 p.m. the day after posting wins (at least {story.minVotes}) · <Link href={`/d/drama/${story.slug}`} target="_blank">open the story page</Link>
      </p>
      <section className={styles.section} id="episodes">
        <div className={styles.sectionHead}><h2 className={styles.sectionTitle}>Episodes</h2></div>
        <div style={{ display: "grid", gap: 14 }}>
          {story.written.map((w) => <EpisodeDesk key={w.n} story={story} w={w} reload={reload} />)}
        </div>
      </section>

      <section className={styles.section} id="cast">
        <div className={styles.sectionHead}><h2 className={styles.sectionTitle}>Cast members</h2><span className={styles.sectionNote}>{story.claims.length} so far</span></div>
        {story.claims.length === 0 ? <p className={styles.p}>Nobody has joined this story yet.</p> : (
          <div className={styles.grid}>
            {story.claims.map((c) => (
              <article key={c.id} className={styles.role}>
                {c.portrait || c.photo
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={(c.portrait || c.photo)!} alt="" style={{ width: "100%", aspectRatio: c.portrait ? "4 / 5" : "1", objectFit: "cover", borderRadius: 12 }} />
                  : <div className={styles.avatar}>?</div>}
                <p className={styles.roleName}>{c.name}</p>
                <p className={styles.roleJob}>as {story.cast.find((x) => x.key === c.role)?.name ?? c.role} · {c.price ? naira(c.price) : "free"} · {CAST_STEP[c.status] ?? c.status.replace("_", " ")}{c.renders ? ` · ${c.renders} model runs` : ""}</p>
                {c.error && c.status !== "sheet_ready" && c.status !== "accepted" && <p className={styles.sectionNote}>Last problem: {c.error}</p>}
                {/* Nothing to approve: the character is made by itself. Approve marks a failed one finished by hand; Reject removes someone. */}
                <Decide kind="cast" id={c.id} status={c.status} reload={reload} live={["sheet_ready", "failed", "submitted", "photos_needed", "making", "accepted"]} approve={c.status === "failed"} />
              </article>
            ))}
          </div>
        )}
      </section>

      <section className={styles.section} id="brands">
        <div className={styles.sectionHead}><h2 className={styles.sectionTitle}>Brand slots</h2><span className={styles.sectionNote}>{story.placements.length} so far</span></div>
        {story.placements.length === 0 ? <p className={styles.p}>No brand has reserved a slot in this story yet.</p> : (
          <div className={styles.grid}>
            {story.placements.map((p) => (
              <article key={p.id} className={styles.role}>
                {p.picture
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={p.picture} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "contain", borderRadius: 12, background: "#fff" }} />
                  : null}
                <p className={styles.roleName}>{p.brand}</p>
                <p className={styles.roleJob}>Episode {p.episode} · {p.slot} · {p.price ? naira(p.price) : "free"} · {p.status.replace("_", " ")}</p>
                {p.contact && <p className={styles.roleLook}>{p.contact}</p>}
                {p.note && <p className={styles.roleLook}>“{p.note}”</p>}
                <Decide kind="placement" id={p.id} status={p.status} reload={reload} live={["paid"]} />
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

const CAST_STEP: Record<string, string> = {
  pending_payment: "not paid yet", submitted: "checking photos", photos_needed: "asked for a new photo", making: "character being made",
  sheet_ready: "waiting for them to say “this is me”", accepted: "accepted", approved: "finished by hand", failed: "FAILED — needs your hands",
};

function Decide({ kind, id, status, reload, live, approve = true }: { kind: "cast" | "placement"; id: string; status: string; reload: () => Promise<void>; live: string[]; approve?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  if (!live.includes(status)) return null;
  const go = async (decision: "approve" | "reject") => {
    setBusy(true); setMsg("");
    try { const r = await call({ action: kind, id, decision }); if (r.note) setMsg(r.note); await reload(); }
    catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div className={styles.roleFoot}>
      {approve && <button type="button" className={`${styles.btn} ${styles.primary} ${styles.small}`} disabled={busy} onClick={() => go("approve")}>{kind === "cast" ? "Finished by hand" : "Approve"}</button>}
      <button type="button" className={`${styles.btn} ${styles.quiet} ${styles.small}`} disabled={busy} onClick={() => go("reject")}>Reject</button>
      {msg && <span className={styles.sectionNote}>{msg}</span>}
    </div>
  );
}

/**
 * One picture per slide: an Unreal render (or any image). A slide with a
 * picture is drawn over it; one without stays designed. Press Preview again to
 * see the change, and Approve again to freeze it.
 */
function Pictures({ story, w, reload }: { story: Story; w: Written; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const send = async (method: "POST" | "PATCH" | "DELETE", slide: number, extra: { file?: File; captionAt?: string } = {}) => {
    setBusy(slide); setMsg("");
    try {
      let r: Response;
      if (method === "POST") {
        const fd = new FormData();
        fd.append("slug", story.slug); fd.append("n", String(w.n)); fd.append("slide", String(slide));
        fd.append("captionAt", extra.captionAt ?? "bottom"); fd.append("file", extra.file!);
        r = await fetch("/api/admin/drama/art", { method, body: fd });
      } else {
        r = await fetch("/api/admin/drama/art", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: story.slug, n: w.n, slide, captionAt: extra.captionAt }) });
      }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setMsg(w.made?.status === "ready" ? "Saved. Preview again, then Approve again to use it." : "Saved. Preview again to see it.");
      await reload();
    } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(null); }
  };
  return (
    <div style={{ margin: "6px 0 16px" }}>
      <div className={styles.fieldLabel} style={{ marginBottom: 8 }}>Pictures · {w.art.length} of 8 · slides without one stay designed</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8 }}>
        {Array.from({ length: 8 }, (_, i) => i + 1).map((slide) => {
          const a = w.art.find((x) => x.slide === slide);
          return (
            <div key={slide} style={{ display: "grid", gap: 4 }}>
              <label className={styles.drop} style={{ minHeight: 0, aspectRatio: "4 / 5", padding: 0, overflow: "hidden", fontSize: 12 }}>
                {a?.url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={a.url} alt={`Slide ${slide} picture`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <span>{busy === slide ? "…" : `+ ${slide}`}</span>}
                <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={busy !== null}
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void send("POST", slide, { file: f, captionAt: a?.captionAt ?? "bottom" }); }} />
              </label>
              {a && (
                <div style={{ display: "flex", gap: 4 }}>
                  <button type="button" className={styles.chip} style={{ cursor: "pointer", font: "inherit", fontSize: 11, padding: "3px 7px" }} disabled={busy !== null}
                    onClick={() => send("PATCH", slide, { captionAt: a.captionAt === "top" ? "bottom" : "top" })}>Words {a.captionAt === "top" ? "↑" : "↓"}</button>
                  <button type="button" className={styles.chip} style={{ cursor: "pointer", font: "inherit", fontSize: 11, padding: "3px 7px" }} disabled={busy !== null}
                    onClick={() => send("DELETE", slide)}>✕</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {msg && <p className={styles.sectionNote} style={{ marginTop: 8 }}>{msg}</p>}
    </div>
  );
}

function EpisodeDesk({ story, w, reload }: { story: Story; w: Written; reload: () => Promise<void> }) {
  const [slides, setSlides] = useState<string[] | null>(null);
  const [caption, setCaption] = useState(w.made?.caption ?? "");
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const status = w.made?.status ?? "not approved";
  const posted = status === "posted" || status === "closed";
  const queued = w.queue && (w.queue.status === "queued" || w.queue.status === "publishing");

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(action); setMsg("");
    try {
      const r = await call({ action, slug: story.slug, n: w.n, ...extra });
      if (action === "preview") { setSlides(r.slides); if (!caption) setCaption(r.caption); }
      if (action === "approve") setMsg("Approved. Pick a time and schedule it.");
      if (action === "schedule") setMsg(`Scheduled: ${r.slides} slides for ${lagos(r.at)}.`);
      if (action === "unschedule") setMsg("Taken back. It will not post.");
      if (action !== "preview") await reload();
    } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(""); }
  };

  const counts = w.options.map((o) => ({ ...o, n: w.votes.filter((v) => v.word === o.word).length }));
  const state = posted
    ? (w.made?.decided ? `Posted · decided: ${w.made.decided}` : `Posted ${w.made?.postedAt ? lagos(w.made.postedAt) : ""} · voting open`)
    : queued ? `Scheduled for ${lagos(w.queue!.at)}`
    : w.queue?.status === "failed" ? `The publisher gave up: ${w.queue.error ?? "unknown error"}`
    : status === "ready" ? "Approved — not scheduled yet" : "Not approved yet";

  return (
    <div className={styles.panel}>
      <div className={styles.eyebrow}>Episode {w.n} · {state}</div>
      <h3 className={styles.h2} style={{ marginTop: 6 }}>{w.title}</h3>
      {posted && (
        <div className={styles.chips}>
          {counts.map((c) => <span key={c.word} className={`${styles.chip} ${w.made?.decided === c.word ? styles.chipLive : ""}`}>{c.word}: {c.n}</span>)}
        </div>
      )}
      {posted && w.votes.length > 0 && (
        <p className={styles.sectionNote}>Votes: {w.votes.map((v) => `${v.word} (${v.voter.replace(/^ig:/, "ig ")})`).join(", ")}</p>
      )}
      {!posted && <Pictures story={story} w={w} reload={reload} />}
      {!posted && (
        <>
          <div className={styles.actions} style={{ marginBottom: 14 }}>
            <button type="button" className={`${styles.btn} ${styles.quiet}`} disabled={!!busy} onClick={() => act("preview")}>{busy === "preview" ? "Drawing…" : slides ? "Preview again" : "Preview"}</button>
          </div>
          {slides && (
            <>
              <div className={styles.row} style={{ gridAutoColumns: "min(72vw, 300px)" }}>
                {slides.map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={src} alt={`Slide ${i + 1}`} style={{ width: "100%", aspectRatio: "4 / 5", height: "auto", borderRadius: 10, scrollSnapAlign: "start" }} />
                ))}
              </div>
              <label className={styles.field} style={{ marginTop: 6 }}>
                <span className={styles.fieldLabel}>Caption</span>
                <textarea className={styles.input} rows={12} value={caption} onChange={(e) => setCaption(e.target.value)} disabled={status === "ready" && !!queued} />
              </label>
              <div className={styles.actions} style={{ marginTop: 12 }}>
                <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={!!busy || !!queued} onClick={() => act("approve", { caption })}>
                  {busy === "approve" ? "Approving…" : status === "ready" ? "Approve again with this caption" : "Approve"}
                </button>
              </div>
            </>
          )}
          {status === "ready" && (
            <div className={styles.actions} style={{ marginTop: 14, alignItems: "center" }}>
              <input type="datetime-local" className={styles.input} style={{ maxWidth: 260 }} value={when} onChange={(e) => setWhen(e.target.value)} aria-label="Post time, Lagos" />
              {!queued
                ? <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={!!busy || !when} onClick={() => act("schedule", { when })}>{busy === "schedule" ? "Scheduling…" : "Schedule (Lagos time)"}</button>
                : <button type="button" className={`${styles.btn} ${styles.quiet}`} disabled={!!busy} onClick={() => act("unschedule")}>Take it back</button>}
            </div>
          )}
        </>
      )}
      {msg && <p className={styles.notice} role="status">{msg}</p>}
    </div>
  );
}
