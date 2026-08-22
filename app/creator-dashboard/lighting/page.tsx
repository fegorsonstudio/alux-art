"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "../../workspace.module.css";

/**
 * The lighting workbench.
 *
 * Purpose: check that every look's saved thumbnail is really what its prompt
 * produces, and add or repair looks by hand.
 *
 * It deliberately generates nothing. Testing happens in Google Flow: copy the
 * prompt, download the exact "before" the thumbnail was made from, run the two
 * there, and compare against the "after" shown here. That keeps verification
 * free, which matters when the archive is 346 looks deep.
 *
 * Every write goes through /api/creator-dashboard/lighting-looks one look at a
 * time. This page never holds or returns the whole archive — the template
 * editor's whole-archive save is the code path that has destroyed looks twice.
 */

const FRAMINGS = [
  { id: "full", label: "Full body" },
  { id: "medium", label: "Waist up" },
  { id: "head", label: "Close-up" },
] as const;

type Look = {
  id: string;
  name: string;
  description: string;
  framing: string | null;
  imagePath: string | null;
  imageBucket: string;
  beforeImagePath: string | null;
  beforeImageBucket: string;
};

type Group = {
  id: string;
  label: string;
  beforeImages: Record<string, string>;
  beforeImagePath: string | null;
  beforeImageBucket: string;
  options: Look[];
};

type TemplateRow = { id: string; title: string; looks: number };

const mediaUrl = (bucket: string, path: string) =>
  `/api/media?b=${encodeURIComponent(bucket)}&p=${encodeURIComponent(path)}`;

/**
 * Which "before" this look is compared against.
 *
 * Its own if it has one, otherwise the section's source for its shot size,
 * falling back to the waist-up one. Same resolution order the buyer's crossfade
 * uses, so what is checked here is what the buyer is shown.
 */
function beforeFor(group: Group, look: Look): { url: string; own: boolean } | null {
  if (look.beforeImagePath) {
    return { url: mediaUrl(look.beforeImageBucket, look.beforeImagePath), own: true };
  }
  const byFraming = look.framing ? group.beforeImages?.[look.framing] : undefined;
  const path = byFraming ?? group.beforeImages?.medium ?? group.beforeImagePath;
  return path ? { url: mediaUrl(group.beforeImageBucket, path), own: false } : null;
}

export default function LightingWorkbench() {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; description: string; framing: string }>({ name: "", description: "", framing: "" });
  const [adding, setAdding] = useState<string | null>(null);
  const [newLook, setNewLook] = useState({ name: "", description: "", framing: "medium", imagePath: "", beforeImagePath: "" });

  const flash = useCallback((msg: string) => { setNote(msg); setError(null); window.setTimeout(() => setNote(null), 4000); }, []);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/creator-dashboard/lighting-looks", { cache: "no-store" });
      if (!res.ok) { setError("Could not load your templates."); setLoading(false); return; }
      const data = await res.json();
      setTemplates(data.templates ?? []);
      if (data.templates?.length) setTemplateId(data.templates[0].id);
      setLoading(false);
    })();
  }, []);

  const load = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    const res = await fetch(`/api/creator-dashboard/lighting-looks?templateId=${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!res.ok) { setError("Could not load that template."); setLoading(false); return; }
    const data = await res.json();
    setGroups(data.groups ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(templateId); }, [templateId, load]);

  const upload = useCallback(async (file: File): Promise<string | null> => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("bucket", "template-images");
    const res = await fetch("/api/upload/file", { method: "POST", body: fd });
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Upload failed."); return null; }
    return (await res.json()).storagePath as string;
  }, []);

  /** One field, one look. The archive stays on the server. */
  const patch = useCallback(async (groupId: string, optionId: string, body: Record<string, unknown>) => {
    setBusy(optionId);
    setError(null);
    const res = await fetch("/api/creator-dashboard/lighting-looks", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ templateId, groupId, optionId, ...body }),
    });
    setBusy(null);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error ?? "Could not save."); return false; }
    await load(templateId);
    flash("Saved.");
    return true;
  }, [templateId, load, flash]);

  const copyPrompt = useCallback(async (look: Look) => {
    try {
      await navigator.clipboard.writeText(look.description);
      flash(`Prompt copied — ${look.description.length} characters. Paste it into Flow.`);
    } catch {
      setError("Could not reach the clipboard. Select the prompt text and copy it by hand.");
    }
  }, [flash]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map(g => ({ ...g, options: g.options.filter(o => o.name.toLowerCase().includes(q)) }))
      .filter(g => g.options.length > 0);
  }, [groups, search]);

  const total = groups.reduce((n, g) => n + g.options.length, 0);

  return (
    <div className={styles.app}>
      <nav className={styles.nav}>
        <div className={styles.navBrand}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Alux Art" className={styles.navLogo} />
          Alux Art
        </div>
        <div className={styles.navRight}>
          <Link href="/creator-dashboard" className={styles.adminLink}>← Back to dashboard</Link>
        </div>
      </nav>

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "18px 16px 60px", display: "grid", gap: 14 }}>
        <div className={styles.panel}>
          <p className={styles.panelTitle}>Lighting workbench</p>
          <p className={styles.helperText}>
            Copy a look&apos;s prompt, download the exact photo its thumbnail was made from, and run
            the two in Google Flow. If what Flow gives back does not match the &quot;after&quot; here,
            the thumbnail is lying to buyers — replace it, or fix the prompt. Nothing on this page
            generates anything, so checking costs nothing.
          </p>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
            <select
              value={templateId}
              onChange={e => { setTemplateId(e.target.value); setOpenGroup(null); }}
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(127,127,127,0.35)", background: "transparent", color: "inherit", maxWidth: "100%" }}
            >
              {templates.map(t => <option key={t.id} value={t.id}>{t.title} ({t.looks} looks)</option>)}
            </select>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search looks by name or number…"
              style={{ flex: "1 1 240px", padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(127,127,127,0.35)", background: "transparent", color: "inherit" }}
            />
            <span className={styles.helperText} style={{ margin: 0 }}>{total} looks</span>
          </div>

          {note && <p className={styles.helperText} style={{ color: "#2f7d6b", margin: "6px 0 0", fontWeight: 700 }}>{note}</p>}
          {error && <p className={styles.helperText} style={{ color: "#c0392b", margin: "6px 0 0", fontWeight: 700 }}>{error}</p>}
        </div>

        {loading && <div className={styles.panel}><p className={styles.helperText}>Loading…</p></div>}

        {!loading && visible.map(group => {
          const open = openGroup === group.id || !!search.trim();
          return (
            <div key={group.id} className={styles.panel}>
              <div className={styles.panelTitleRow}>
                <p className={styles.panelTitle}>{group.label}</p>
                <button className={styles.clearLibBtn} onClick={() => setOpenGroup(open && !search.trim() ? null : group.id)}>
                  {open ? "Close" : `Open (${group.options.length})`}
                </button>
              </div>

              {open && (
                <div style={{ display: "grid", gap: 14 }}>
                  <div>
                    <button className={styles.clearLibBtn} onClick={() => setAdding(adding === group.id ? null : group.id)}>
                      {adding === group.id ? "Cancel" : "+ Add a new look to this section"}
                    </button>
                  </div>

                  {adding === group.id && (
                    <div style={{ border: "1px dashed rgba(127,127,127,0.45)", borderRadius: 10, padding: 12, display: "grid", gap: 8 }}>
                      <p className={styles.helperText} style={{ margin: 0 }}>
                        The prompt must come from the studio gem — paste it here exactly as the gem returned it.
                      </p>
                      <input
                        type="text" placeholder="Name shown to buyers (max 40 characters)" maxLength={40}
                        value={newLook.name} onChange={e => setNewLook(v => ({ ...v, name: e.target.value }))}
                        style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(127,127,127,0.35)", background: "transparent", color: "inherit" }}
                      />
                      <select
                        value={newLook.framing} onChange={e => setNewLook(v => ({ ...v, framing: e.target.value }))}
                        style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(127,127,127,0.35)", background: "transparent", color: "inherit" }}
                      >
                        {FRAMINGS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                      </select>
                      <textarea
                        placeholder="Paste the prompt from the gem…" rows={6}
                        value={newLook.description} onChange={e => setNewLook(v => ({ ...v, description: e.target.value }))}
                        style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(127,127,127,0.35)", background: "transparent", color: "inherit", fontFamily: "inherit", resize: "vertical" }}
                      />
                      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                        {([["beforeImagePath", "Before photo"], ["imagePath", "After thumbnail"]] as const).map(([key, label]) => (
                          <label key={key} style={{ display: "grid", gap: 4, cursor: "pointer", fontSize: "0.74rem" }}>
                            <span style={{ fontWeight: 700 }}>{label}</span>
                            <span style={{ opacity: 0.7 }}>{newLook[key] ? "✓ uploaded — tap to replace" : "Tap to upload"}</span>
                            <input type="file" accept="image/*" style={{ display: "none" }}
                              onChange={async e => {
                                const f = e.target.files?.[0]; e.target.value = "";
                                if (!f) return;
                                const path = await upload(f);
                                if (path) setNewLook(v => ({ ...v, [key]: path }));
                              }} />
                          </label>
                        ))}
                      </div>
                      <button
                        className={styles.payBtn}
                        style={{ padding: "10px", fontSize: "0.9rem" }}
                        disabled={busy === "new"}
                        onClick={async () => {
                          setBusy("new"); setError(null);
                          const res = await fetch("/api/creator-dashboard/lighting-looks", {
                            method: "POST",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({ templateId, groupId: group.id, ...newLook }),
                          });
                          setBusy(null);
                          const data = await res.json().catch(() => ({}));
                          if (!res.ok) { setError(data.error ?? "Could not add the look."); return; }
                          setNewLook({ name: "", description: "", framing: "medium", imagePath: "", beforeImagePath: "" });
                          setAdding(null);
                          await load(templateId);
                          flash(`Added. The section now has ${data.looks} looks in total across the template.`);
                        }}
                      >
                        {busy === "new" ? "Saving…" : "Add this look"}
                      </button>
                    </div>
                  )}

                  {group.options.map(look => {
                    const before = beforeFor(group, look);
                    const isEditing = editing === look.id;
                    return (
                      <div key={look.id} style={{ border: "1px solid rgba(127,127,127,0.25)", borderRadius: 10, padding: 12, display: "grid", gap: 10 }}>
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                          {/* Before and after at a size where a mismatch is actually visible. */}
                          {([["Before", before?.url ?? null], ["After (saved)", look.imagePath ? mediaUrl(look.imageBucket, look.imagePath) : null]] as const).map(([label, url]) => (
                            <div key={label} style={{ display: "grid", gap: 4, justifyItems: "center", width: 150 }}>
                              {url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={url} alt={label} loading="lazy" style={{ width: 150, height: 188, objectFit: "cover", borderRadius: 8 }} />
                              ) : (
                                <span style={{ width: 150, height: 188, borderRadius: 8, background: "rgba(127,127,127,0.15)", display: "grid", placeItems: "center", fontSize: "0.7rem" }}>none</span>
                              )}
                              <span style={{ fontSize: "0.7rem", opacity: 0.75 }}>
                                {label}{label === "Before" && before && !before.own ? " (section's)" : ""}
                              </span>
                            </div>
                          ))}

                          <div style={{ flex: "1 1 260px", display: "grid", gap: 8, minWidth: 240 }}>
                            <div>
                              <p style={{ margin: 0, fontWeight: 800, fontSize: "0.95rem" }}>{look.name}</p>
                              <p className={styles.helperText} style={{ margin: "2px 0 0" }}>
                                {FRAMINGS.find(f => f.id === look.framing)?.label ?? "No shot size set"} · {look.description.length} characters
                              </p>
                            </div>

                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button className={styles.clearLibBtn} onClick={() => void copyPrompt(look)}>Copy prompt</button>
                              {before && (
                                <a className={styles.clearLibBtn} href={before.url} download style={{ textDecoration: "none" }}>
                                  Download before
                                </a>
                              )}
                              <button
                                className={styles.clearLibBtn}
                                onClick={() => {
                                  setEditing(isEditing ? null : look.id);
                                  setDraft({ name: look.name, description: look.description, framing: look.framing ?? "medium" });
                                }}
                              >
                                {isEditing ? "Close" : "Edit"}
                              </button>
                            </div>

                            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                              {([["imagePath", "Replace after"], ["beforeImagePath", "Set this look's own before"]] as const).map(([key, label]) => (
                                <label key={key} style={{ fontSize: "0.72rem", cursor: "pointer", textDecoration: "underline", opacity: busy === look.id ? 0.5 : 0.85 }}>
                                  {label}
                                  <input type="file" accept="image/*" style={{ display: "none" }} disabled={busy === look.id}
                                    onChange={async e => {
                                      const f = e.target.files?.[0]; e.target.value = "";
                                      if (!f) return;
                                      setBusy(look.id);
                                      const path = await upload(f);
                                      setBusy(null);
                                      if (path) await patch(group.id, look.id, { [key]: path });
                                    }} />
                                </label>
                              ))}
                              {look.beforeImagePath && (
                                <button
                                  className={styles.clearLibBtn}
                                  onClick={() => void patch(group.id, look.id, { beforeImagePath: null })}
                                >
                                  Use the section&apos;s before instead
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {isEditing && (
                          <div style={{ display: "grid", gap: 8, borderTop: "1px solid rgba(127,127,127,0.2)", paddingTop: 10 }}>
                            <input
                              type="text" value={draft.name} maxLength={40}
                              onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(127,127,127,0.35)", background: "transparent", color: "inherit" }}
                            />
                            <select
                              value={draft.framing} onChange={e => setDraft(d => ({ ...d, framing: e.target.value }))}
                              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(127,127,127,0.35)", background: "transparent", color: "inherit" }}
                            >
                              {FRAMINGS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                            </select>
                            <textarea
                              rows={10} value={draft.description}
                              onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
                              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(127,127,127,0.35)", background: "transparent", color: "inherit", fontFamily: "inherit", resize: "vertical", lineHeight: 1.5 }}
                            />
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button
                                className={styles.clearLibBtn}
                                disabled={busy === look.id}
                                onClick={async () => {
                                  const ok = await patch(group.id, look.id, {
                                    name: draft.name, description: draft.description, framing: draft.framing,
                                  });
                                  if (ok) setEditing(null);
                                }}
                              >
                                {busy === look.id ? "Saving…" : "Save changes"}
                              </button>
                              <button
                                className={styles.clearLibBtn}
                                style={{ color: "#c0392b", borderColor: "rgba(192,57,43,0.4)" }}
                                disabled={busy === look.id}
                                onClick={async () => {
                                  if (!window.confirm(`Delete "${look.name}"? Buyers will no longer see it.`)) return;
                                  setBusy(look.id); setError(null);
                                  const res = await fetch("/api/creator-dashboard/lighting-looks", {
                                    method: "DELETE",
                                    headers: { "content-type": "application/json" },
                                    body: JSON.stringify({ templateId, groupId: group.id, optionId: look.id }),
                                  });
                                  setBusy(null);
                                  const data = await res.json().catch(() => ({}));
                                  if (!res.ok) { setError(data.error ?? "Could not delete."); return; }
                                  setEditing(null);
                                  await load(templateId);
                                  flash(`Deleted. ${data.looks} looks left in this template.`);
                                }}
                              >
                                Delete this look
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {!loading && templates.length === 0 && (
          <div className={styles.panel}><p className={styles.helperText}>None of your templates have a lighting section yet.</p></div>
        )}
      </div>
    </div>
  );
}
