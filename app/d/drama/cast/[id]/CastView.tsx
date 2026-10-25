"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "../../drama.module.css";
import type { CastView as View } from "@/lib/drama/character";

/** The live part of a member's page: it waits with them while the character is made, then lets them accept it. */
const WORKING = new Set(["submitted", "making"]);
const firstName = (name: string) => name.replace(/^(Mrs|Mr|Ms|Miss|Chief|Dr|Barrister)\.?\s+/, "").split(" ")[0];

async function upload(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("bucket", "identity-images");
  const up = await fetch("/api/upload/file", { method: "POST", body: fd });
  const j = await up.json().catch(() => ({}));
  if (!up.ok || !j.storagePath) throw new Error(j.error ?? "The upload did not go through.");
  return j.storagePath as string;
}

export default function CastView({ initial }: { initial: View }) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [fresh, setFresh] = useState<Record<string, { file: File; preview: string }>>({});

  const reload = useCallback(async () => {
    const r = await fetch(`/api/drama/cast/${v.id}`, { cache: "no-store" });
    if (r.ok) setV(await r.json());
  }, [v.id]);

  useEffect(() => {
    if (!WORKING.has(v.status)) return;
    const t = setInterval(() => void reload(), 6000);
    return () => clearInterval(t);
  }, [v.status, reload]);

  const act = async (body: Record<string, unknown>, label: string) => {
    setError(""); setBusy(label);
    try {
      const r = await fetch(`/api/drama/cast/${v.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Something went wrong.");
      await reload();
    } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  };

  const sendPhotos = async () => {
    const kinds = Object.keys(fresh);
    if (!kinds.length) { setError("Choose a new photo first."); return; }
    setError("");
    try {
      const photos = [];
      for (const [i, k] of kinds.entries()) {
        setBusy(`Sending photo ${i + 1} of ${kinds.length}…`);
        photos.push({ kind: k, path: await upload(fresh[k].file) });
      }
      setBusy("");
      setFresh({});
      await act({ action: "photos", photos }, "Checking…");
    } catch (e) { setError((e as Error).message); setBusy(""); }
  };

  const failed = v.photos.filter((p) => p.problems.length);
  const canRecord = ["submitted", "making", "photos_needed", "sheet_ready", "accepted", "approved", "failed"].includes(v.status);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {WORKING.has(v.status) && (
        <div className={styles.panel} role="status">
          <h2 className={styles.h2}>{v.status === "submitted" ? "Checking your photos…" : "Making your character…"}</h2>
          <p className={styles.p} style={{ margin: 0 }}>This usually takes a few minutes. You can leave this page — we’ll email you when it’s ready.</p>
        </div>
      )}

      {v.status === "photos_needed" && (
        <div className={styles.panel}>
          <h2 className={styles.h2}>{failed.length === 1 ? "One photo needs changing" : `${failed.length} photos need changing`}</h2>
          <p className={styles.p}>Your role is held. Send a new photo and we make your character straight away.</p>
          <div className={styles.photoGrid}>
            {v.photos.map((p) => {
              const pick = fresh[p.kind];
              const src = pick?.preview ?? p.url;
              return (
                <label key={p.kind} className={`${styles.drop} ${styles.photoTile}`} style={p.problems.length ? undefined : { cursor: "default", opacity: 0.7 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {src ? <img src={src} alt="" className={styles.photoImg} /> : <span className={styles.photoEmpty}>+</span>}
                  <span className={styles.photoLabel}>{p.problems.length ? (pick ? "New photo ✓" : "Tap to replace") : "This one is fine"}</span>
                  <span className={styles.photoHint}>{p.label}</span>
                  {p.problems.length > 0 && (
                    <input type="file" accept="image/*" hidden onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      if (!f.type.startsWith("image/") || f.size > 30 * 1024 * 1024) { setError("Choose a photo under 30 MB."); return; }
                      setFresh((cur) => ({ ...cur, [p.kind]: { file: f, preview: URL.createObjectURL(f) } }));
                    }} />
                  )}
                </label>
              );
            })}
          </div>
          {failed.map((p) => p.problems.map((t, i) => <p key={`${p.kind}-${i}`} className={styles.problem}>{p.label}: {t}</p>))}
          <div className={styles.castActions} style={{ marginTop: 14 }}>
            <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={!!busy} onClick={sendPhotos}>{busy || "Send the new photo"}</button>
          </div>
        </div>
      )}

      {(v.status === "sheet_ready" || v.status === "accepted" || v.status === "approved") && (
        <div className={styles.panel} style={{ display: "grid", gap: 14 }}>
          <h2 className={styles.h2}>{v.status === "sheet_ready" ? "Is this you?" : `You, as ${v.role.name}`}</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {v.portraitUrl && <img src={v.portraitUrl} alt={`${v.displayName} as ${v.role.name}`} className={styles.portrait} />}
          {v.sheetUrl && (
            <details>
              <summary className={styles.sectionNote} style={{ cursor: "pointer" }}>Your character sheet — how every picture of {v.role.name} is drawn</summary>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={v.sheetUrl} alt="Character sheet" className={styles.sheet} style={{ marginTop: 10 }} />
            </details>
          )}
          {v.status === "sheet_ready" ? (
            <div className={styles.castActions}>
              <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={!!busy} onClick={() => act({ action: "accept" }, "Saving…")}>{busy === "Saving…" ? busy : "Yes, this is me"}</button>
              {!v.redoUsed && (
                <button type="button" className={`${styles.btn} ${styles.quiet}`} disabled={!!busy} onClick={() => act({ action: "redo" }, "Starting again…")}>{busy === "Starting again…" ? busy : "Make it again"}</button>
              )}
            </div>
          ) : (
            <div className={styles.castActions}>
              {v.portraitUrl && <a className={`${styles.btn} ${styles.quiet}`} href={v.portraitUrl} download={`${v.role.name} - ${v.displayName}.jpg`}>Save your portrait</a>}
              <a className={`${styles.btn} ${styles.primary}`} href={`/d/drama/${v.story.slug}`}>Back to the story</a>
            </div>
          )}
          {v.status === "sheet_ready" && v.redoUsed && <p className={styles.sectionNote} style={{ margin: 0 }}>This is the second version, made as you asked.</p>}
          {v.status !== "sheet_ready" && (
            <p className={styles.sectionNote} style={{ margin: 0 }}>Your name is in the credits of every episode {firstName(v.role.name)} is in{v.role.enters ? `, from Episode ${v.role.enters}` : ""}.</p>
          )}
        </div>
      )}

      {canRecord && <VoiceRecorder castId={v.id} voice={v.voice} roleName={v.role.name} onChange={reload} />}

      {v.status === "failed" && (
        <div className={styles.panel}>
          <h2 className={styles.h2}>A person is finishing your character</h2>
          <p className={styles.p} style={{ margin: 0 }}>Our engine couldn’t make it from these photos, so the studio is doing it by hand. Your role is held; we’ll email you.</p>
        </div>
      )}
      {(v.status === "rejected" || v.status === "withdrawn") && (
        <div className={styles.panel}><p className={styles.p} style={{ margin: 0 }}>This role is no longer yours. If you paid, the studio will contact you about a refund.</p></div>
      )}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </div>
  );
}

/**
 * The member's own voice (owner, 2026-10-25): two clips recorded in the browser —
 * the consent line and a reading sample — sent to /api/drama/voice; the voice is
 * copied by itself once both are there, and their episodes use it. Without it,
 * the role keeps the story's designed voice.
 */
function VoiceRecorder({ castId, voice, roleName, onChange }: { castId: string; voice: View["voice"]; roleName: string; onChange: () => Promise<void> }) {
  const [rec, setRec] = useState<{ kind: "consent" | "sample"; r: MediaRecorder; chunks: Blob[]; started: number } | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [sending, setSending] = useState("");
  const [err, setErr] = useState("");
  const supported = typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => setSeconds(Math.round((Date.now() - rec.started) / 1000)), 500);
    return () => clearInterval(t);
  }, [rec]);

  const start = async (kind: "consent" | "sample") => {
    setErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: r.mimeType || "audio/webm" });
        setRec(null); setSeconds(0);
        if (blob.size < 2000) { setErr("Nothing was recorded. Check the microphone and try again."); return; }
        setSending(kind);
        try {
          const fd = new FormData();
          fd.append("castId", castId); fd.append("kind", kind);
          fd.append("file", new File([blob], `${kind}.${/mp4/.test(blob.type) ? "m4a" : /ogg/.test(blob.type) ? "ogg" : "webm"}`, { type: blob.type }));
          const res = await fetch("/api/drama/voice", { method: "POST", body: fd });
          const j = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(j.error ?? "The clip did not go through.");
          await onChange();
        } catch (e) { setErr((e as Error).message); } finally { setSending(""); }
      };
      r.start();
      setRec({ kind, r, chunks, started: Date.now() });
    } catch { setErr("We could not use the microphone. Allow it in the browser and try again."); }
  };
  const stop = () => rec?.r.stop();
  const max = (k: "consent" | "sample") => (k === "consent" ? 20 : 45);
  useEffect(() => { if (rec && seconds >= max(rec.kind)) rec.r.stop(); }, [rec, seconds]);

  const clip = (kind: "consent" | "sample", title: string, text: string, done: boolean) => (
    <div className={styles.notice} style={{ margin: 0, display: "grid", gap: 8 }}>
      <span className={styles.fieldLabel}>{title} {done ? "✓" : ""}</span>
      <p className={styles.p} style={{ margin: 0 }}>{text}</p>
      <div className={styles.castActions}>
        {rec?.kind === kind ? (
          <button type="button" className={`${styles.btn} ${styles.primary} ${styles.small}`} onClick={stop}>Stop ({seconds}s)</button>
        ) : (
          <button type="button" className={`${styles.btn} ${done ? styles.quiet : styles.primary} ${styles.small}`} disabled={!!rec || !!sending} onClick={() => start(kind)}>
            {sending === kind ? "Sending…" : done ? "Record again" : "Record"}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className={styles.panel} style={{ display: "grid", gap: 12 }}>
      <h2 className={styles.h2}>Your voice (optional)</h2>
      <p className={styles.p} style={{ margin: 0 }}>
        {voice.ready
          ? `Your voice is ready. When ${roleName} speaks in an episode's soundtrack, it is your voice.`
          : `Record two short clips and ${roleName} will speak with your voice in every episode. Skip this and we give the character a designed voice instead.`}
      </p>
      {!supported && <p className={styles.sectionNote} style={{ margin: 0 }}>Recording needs a phone or computer browser with a microphone (Chrome, Safari or Firefox).</p>}
      {supported && (
        <>
          {clip("consent", "1. Permission", `Read this aloud: “${voice.lines.consent}”`, voice.consent)}
          {clip("sample", "2. Your voice — read for 20 to 40 seconds", voice.lines.sample, voice.sample)}
        </>
      )}
      {voice.error && !voice.ready && <p className={styles.problem}>{voice.error} — record the clip again.</p>}
      {err && <p className={styles.error} role="alert">{err}</p>}
    </div>
  );
}
