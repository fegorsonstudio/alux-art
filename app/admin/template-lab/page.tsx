"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import styles from "../admin.module.css";
import labStyles from "./lab.module.css";
import ImagePreview from "@/components/ImagePreview";

interface SlotRow {
  id: string;
  slot: number;
  prompt: string | null;
  provider: string | null;
  status: string;
}

interface RefRow {
  id: string;
  purpose: string;
  tag: string | null;
  signedUrl: string | null;
}

interface LabShoot {
  id: string;
  created_at: string;
  mode: string;
  aspect_ratio: string;
  package_size: number;
  shoot_images: SlotRow[];
  refs: RefRow[];
}

interface SlotGenState {
  loading: boolean;
  error: string;
  resultUrl: string | null;
}

export default function TemplateLabPage() {
  const [shoots, setShoots] = useState<LabShoot[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [selectedShootId, setSelectedShootId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [genStates, setGenStates] = useState<Record<string, SlotGenState>>({});
  const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null);

  const copyPrompt = (id: string, prompt: string) => {
    navigator.clipboard.writeText(prompt).then(() => {
      setCopiedPromptId(id);
      setTimeout(() => setCopiedPromptId(prev => prev === id ? null : prev), 1500);
    });
  };

  useEffect(() => {
    fetch("/api/admin/template-lab/shoots")
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Error loading shoots");
        return d;
      })
      .then(d => setShoots(d.shoots ?? []))
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  const selectedShoot = shoots.find(s => s.id === selectedShootId) ?? null;
  const promptSlots = selectedShoot?.shoot_images.filter(s => s.provider === "prompt-only" || s.provider === "nano-banana") ?? [];

  const generate = async (slotId: string) => {
    if (!templateId.trim()) { alert("Enter a template ID first"); return; }
    setGenStates(prev => ({ ...prev, [slotId]: { loading: true, error: "", resultUrl: null } }));
    try {
      const res = await fetch("/api/admin/template-lab/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shoot_image_id: slotId, template_id: templateId.trim() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Generation failed");
      setGenStates(prev => ({ ...prev, [slotId]: { loading: false, error: "", resultUrl: d.signedUrl } }));
      // Mark slot as nano-banana in local state
      setShoots(prev => prev.map(sh => sh.id === selectedShootId
        ? { ...sh, shoot_images: sh.shoot_images.map(img => img.id === slotId ? { ...img, provider: "nano-banana" } : img) }
        : sh));
    } catch (e) {
      setGenStates(prev => ({ ...prev, [slotId]: { loading: false, error: e instanceof Error ? e.message : "Error", resultUrl: null } }));
    }
  };

  if (loading) return <div className={styles.loading}>Loading Template Lab…</div>;
  if (err) return <div className={styles.loading}>{err}</div>;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/admin" className={styles.back}>← Admin</Link>
        <h1 className={styles.title}>Template Lab</h1>
      </header>

      <div className={labStyles.layout}>
        {/* Left — shoot list */}
        <div className={styles.card} style={{ margin: 0 }}>
          <p className={styles.cardTitle}>Prompt-Only Shoots ({shoots.length})</p>
          {shoots.length === 0 && (
            <p className={labStyles.emptyHint}>No prompt-only shoots yet. Enable Prompt-Only Mode in the admin panel and run a shoot.</p>
          )}
          {shoots.map(shoot => (
            <button
              key={shoot.id}
              type="button"
              className={`${labStyles.shootRow} ${selectedShootId === shoot.id ? labStyles.shootRowActive : ""}`}
              onClick={() => setSelectedShootId(shoot.id)}
            >
              <span className={labStyles.shootId}>{shoot.id.slice(0, 8)}…</span>
              <span className={labStyles.shootMeta}>{shoot.mode} · {shoot.aspect_ratio} · {shoot.package_size} imgs</span>
              <span className={labStyles.shootDate}>{new Date(shoot.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
            </button>
          ))}
        </div>

        {/* Right — slot details */}
        <div>
          {!selectedShoot && (
            <div className={styles.card} style={{ margin: 0 }}>
              <p className={labStyles.emptyHint}>Select a shoot on the left to view prompts.</p>
            </div>
          )}

          {selectedShoot && (
            <div className={styles.card} style={{ margin: 0 }}>
              <p className={styles.cardTitle}>Shoot {selectedShoot.id.slice(0, 8)} — {promptSlots.length} slots</p>

              {/* Template ID input */}
              <div className={labStyles.templateRow}>
                <label className={labStyles.templateLabel}>Target template ID</label>
                <input
                  className={labStyles.templateInput}
                  placeholder="paste template UUID here"
                  value={templateId}
                  onChange={e => setTemplateId(e.target.value.trim())}
                />
                <Link href="/creator-dashboard" className={labStyles.dashLink} target="_blank">Open Creator Dashboard →</Link>
              </div>

              {/* Reference images */}
              {selectedShoot.refs.length > 0 && (
                <div className={labStyles.refsSection}>
                  <p className={labStyles.refsLabel}>Reference images ({selectedShoot.refs.length})</p>
                  <div className={labStyles.refsRow}>
                    {selectedShoot.refs.map(ref => (
                      <div key={ref.id} className={labStyles.refThumb}>
                        {ref.signedUrl && <ImagePreview src={ref.signedUrl} alt={ref.tag ?? ref.purpose} className={labStyles.refImg} preferredWidth={120} />}
                        {ref.tag && <span className={labStyles.refTag}>{ref.tag}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Slot cards */}
              <div className={labStyles.slotsGrid}>
                {promptSlots.map(slot => {
                  const gs = genStates[slot.id];
                  const isDone = slot.provider === "nano-banana" || !!gs?.resultUrl;
                  return (
                    <div key={slot.id} className={labStyles.slotCard}>
                      <div className={labStyles.slotHeader}>
                        <span className={labStyles.slotNum}>Slot {slot.slot}</span>
                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {slot.prompt && (
                            <button
                              type="button"
                              title="Copy full prompt"
                              aria-label={`Copy prompt for slot ${slot.slot}`}
                              onClick={() => copyPrompt(slot.id, slot.prompt!)}
                              style={{ background: "none", border: "1px solid rgba(127,127,127,0.35)", borderRadius: 5, padding: "1px 7px", cursor: "pointer", fontSize: "0.72rem", color: "inherit" }}
                            >
                              {copiedPromptId === slot.id ? "Copied!" : "📋 Copy"}
                            </button>
                          )}
                          <span className={`${labStyles.slotBadge} ${isDone ? labStyles.slotBadgeDone : ""}`}>
                            {isDone ? "Generated" : "Prompt Only"}
                          </span>
                        </span>
                      </div>

                      {slot.prompt ? (
                        <p className={labStyles.promptText}>{slot.prompt.slice(0, 300)}{slot.prompt.length > 300 ? "…" : ""}</p>
                      ) : (
                        <p className={labStyles.promptMissing}>No prompt saved</p>
                      )}

                      {gs?.resultUrl && (
                        <ImagePreview src={gs.resultUrl} alt={`Slot ${slot.slot}`} className={labStyles.resultImg} preferredWidth={400} />
                      )}

                      {gs?.error && <p className={labStyles.slotErr}>{gs.error}</p>}

                      {!isDone && (
                        <button
                          type="button"
                          className={styles.saveBtn}
                          style={{ marginTop: 8, width: "100%" }}
                          onClick={() => generate(slot.id)}
                          disabled={gs?.loading || !templateId.trim() || !slot.prompt}
                        >
                          {gs?.loading ? "Generating…" : "Generate with nano-banana"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
