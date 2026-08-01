"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Soul ID — train the buyer's likeness once, reuse it on every boudoir shoot.
 *
 * The flow the panel walks through, and why it has the shape it does:
 *
 *   choose photos → four reference sheets render (~3 min) → THE BUYER LOOKS AT
 *   THEM AND CONFIRMS → training (~4 min) → ready, forever.
 *
 * The confirmation step is the whole reason this is a panel and not a background
 * job. A sheet that does not look like them trains a LoRA that does not look like
 * them, and every image generated afterwards inherits that face. Asking once is
 * cheaper than finding out later.
 */

interface SoulId {
  id: string;
  label: string;
  status: string;
  trainingImageCount: number;
  failureReason?: string | null;
  sheets?: Array<{ id: string; label: string; url: string }>;
}

interface Props {
  /** Ids of the identity photos currently selected in the studio. */
  identityImageIds: string[];
  styles: Record<string, string>;
}

const BUSY = new Set(["SHEETS_GENERATING", "TRAINING"]);

export default function SoulIdPanel({ identityImageIds, styles }: Props) {
  const [list, setList] = useState<SoulId[]>([]);
  const [active, setActive] = useState<SoulId | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadList = useCallback(async () => {
    const res = await fetch("/api/soul-id");
    if (!res.ok) return;
    const data = await res.json();
    setList(data.soulIds ?? []);
    const busy = (data.soulIds ?? []).find((s: SoulId) => BUSY.has(s.status) || s.status === "SHEETS_REVIEW");
    if (busy && !active) setActive(busy);
  }, [active]);

  useEffect(() => { loadList(); }, [loadList]);

  // Poll while anything is in flight. The detail endpoint also nudges fal for a
  // finished training job, so the person watching is what drives it to completion.
  useEffect(() => {
    if (!active || !BUSY.has(active.status)) return;
    timer.current = setTimeout(async () => {
      const res = await fetch(`/api/soul-id/${active.id}`);
      if (res.ok) setActive(await res.json());
    }, 6000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [active]);

  // Once it lands in review we need the signed sheet URLs, which the list does
  // not carry.
  useEffect(() => {
    if (active?.status === "SHEETS_REVIEW" && !active.sheets) {
      fetch(`/api/soul-id/${active.id}`).then(r => r.ok && r.json()).then(d => d && setActive(d));
    }
  }, [active]);

  const create = async () => {
    setError(""); setWorking(true);
    try {
      const res = await fetch("/api/soul-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identityImageIds }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Could not start."); return; }
      setActive({ id: data.id, label: "My Soul ID", status: "SHEETS_GENERATING", trainingImageCount: 0 });
    } finally { setWorking(false); }
  };

  const decide = async (approved: boolean) => {
    if (!active) return;
    setError(""); setWorking(true);
    try {
      const res = await fetch(`/api/soul-id/${active.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Could not continue."); return; }
      setActive({ ...active, status: data.status, sheets: undefined });
      if (!approved) { setActive(null); loadList(); }
    } finally { setWorking(false); }
  };

  const ready = list.find(s => s.status === "READY");

  return (
    <div className={styles.saveToggle} style={{ display: "block", marginTop: 14 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", textAlign: "left", width: "100%" }}
      >
        <strong>Soul ID</strong>
        <span style={{ opacity: 0.7 }}>
          {ready ? " — ready, used on your boudoir shoots" : " — train your likeness once, reuse it forever"}
        </span>
        <span style={{ float: "right", opacity: 0.6 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ marginTop: 10, fontSize: "0.86rem", lineHeight: 1.5 }}>
          {ready && !active && (
            <p style={{ opacity: 0.85 }}>
              Trained on {ready.trainingImageCount} images. Your boudoir shoots use it automatically —
              the same face in every photo, instead of a new interpretation each time.
            </p>
          )}

          {!active && !ready && (
            <>
              <p style={{ opacity: 0.85 }}>
                We build a set of reference sheets from your photos, you check they look like you,
                then we train them into a private model. Takes about seven minutes, once.
              </p>
              <button
                type="button"
                onClick={create}
                disabled={working || identityImageIds.length < 3}
                style={{ marginTop: 8, padding: "8px 14px", borderRadius: 8, cursor: "pointer" }}
              >
                {working ? "Starting…" : "Build my Soul ID"}
              </button>
              {identityImageIds.length < 3 && (
                <p style={{ opacity: 0.7, marginTop: 6 }}>
                  Select at least 3 identity photos above. More angles and expressions make a stronger likeness.
                </p>
              )}
            </>
          )}

          {active?.status === "SHEETS_GENERATING" && (
            <p style={{ opacity: 0.85 }}>Building your reference sheets… about three minutes. You can leave this open.</p>
          )}

          {active?.status === "SHEETS_REVIEW" && (
            <>
              <p style={{ opacity: 0.9 }}><strong>Does this look like you?</strong></p>
              <p style={{ opacity: 0.75, marginBottom: 8 }}>
                Everything we generate afterwards is built from these, so it is worth a proper look.
              </p>
              <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6 }}>
                {(active.sheets ?? []).map(s => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={s.id} src={s.url} alt={s.label} title={s.label}
                    style={{ height: 150, borderRadius: 6, flex: "0 0 auto" }} />
                ))}
                {!active.sheets && <span style={{ opacity: 0.7 }}>Loading sheets…</span>}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button type="button" onClick={() => decide(true)} disabled={working}
                  style={{ padding: "8px 14px", borderRadius: 8, cursor: "pointer" }}>
                  {working ? "…" : "Yes, that's me"}
                </button>
                <button type="button" onClick={() => decide(false)} disabled={working}
                  style={{ padding: "8px 14px", borderRadius: 8, cursor: "pointer", opacity: 0.75 }}>
                  No, start over
                </button>
              </div>
            </>
          )}

          {active?.status === "TRAINING" && (
            <p style={{ opacity: 0.85 }}>
              Training on {active.trainingImageCount || "your"} images… about four minutes. It only happens once.
            </p>
          )}

          {active?.status === "READY" && (
            <p style={{ opacity: 0.9 }}>
              Done. Your boudoir shoots will use this from now on.
            </p>
          )}

          {active?.status === "FAILED" && (
            <p style={{ opacity: 0.9 }}>
              That didn&apos;t finish{active.failureReason ? `: ${active.failureReason}` : "."} Nothing was charged for the training.
            </p>
          )}

          {error && <p style={{ marginTop: 8, opacity: 0.9 }}>{error}</p>}
        </div>
      )}
    </div>
  );
}
