"use client";

import { useEffect, useRef, useState } from "react";
import type { AppDictionary } from "@/lib/dictionaries";
import styles from "./upload.module.css";

type Strings = AppDictionary["chatUpload"];
type Item = { file: File; state: "waiting" | "sending" | "done" | "error"; pct: number; error?: string };

const fill = (s: string, v: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k) => (k in v ? String(v[k]) : `{${k}}`));
const mb = (b: number) => `${(b / 1048576).toFixed(1)} MB`;

/** One file to /api/up/<token>, with progress — a 20 MB original on a phone takes a while. */
function send(token: string, file: File, last: boolean, onPct: (p: number) => void): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/up/${token}`);
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-last", last ? "1" : "0");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onPct(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      try { resolve(JSON.parse(xhr.responseText)); } catch { resolve({ ok: false, error: xhr.status === 413 ? "tooBig" : "failed" }); }
    };
    xhr.onerror = () => resolve({ ok: false, error: "failed" });
    xhr.send(file);
  });
}

export default function UploadForm(props: {
  token: string;
  channel: "instagram" | "whatsapp";
  status: "open" | "expired" | "closed";
  backUrl: string | null;
  strings: Strings;
  themeLabels: { light: string; dark: string };
  maxPhotos: number;
  maxMb: number;
  dir: "ltr" | "rtl";
}) {
  const t = props.strings;
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [received, setReceived] = useState(0);
  const [at, setAt] = useState<{ n: number; total: number } | null>(null);
  const [stopped, setStopped] = useState<string | null>(props.status === "open" ? null : props.status);
  const input = useRef<HTMLInputElement>(null);

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

  const pick = (list: FileList | null) => {
    if (!list) return;
    const chosen = Array.from(list).slice(0, props.maxPhotos).map((file): Item =>
      file.size > props.maxMb * 1048576
        ? { file, state: "error", pct: 0, error: fill(t.tooBig, { name: file.name, mb: props.maxMb }) }
        : { file, state: "waiting", pct: 0 });
    setItems(chosen);
    setReceived(0);
  };

  const patch = (i: number, p: Partial<Item>) =>
    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...p } : it)));

  const upload = async () => {
    const todo = items.map((it, i) => ({ it, i })).filter(({ it }) => it.state === "waiting");
    if (!todo.length) return;
    setBusy(true);
    let got = 0;
    // One at a time: each photo joins the order in turn, and the last one tells
    // the chat the total, so the customer gets one message, not five.
    for (let n = 0; n < todo.length; n++) {
      const { it, i } = todo[n];
      setAt({ n: n + 1, total: todo.length });
      patch(i, { state: "sending", pct: 0 });
      const r = await send(props.token, it.file, n === todo.length - 1, (pct) => patch(i, { pct }));
      if (r.ok) {
        got++;
        patch(i, { state: "done", pct: 100 });
        continue;
      }
      const code = r.error ?? "failed";
      if (code === "expired" || code === "closed" || code === "full" || code === "limit") {
        patch(i, { state: "error", error: code === "limit" ? t.full : t[code as "expired" | "closed" | "full"] });
        setStopped(code === "limit" ? "full" : code);
        break;
      }
      patch(i, {
        state: "error",
        error: fill(code === "tooBig" ? t.tooBig : code === "notImage" ? t.notImage : t.failed, { name: it.file.name, mb: props.maxMb }),
      });
    }
    setReceived(got);
    setAt(null);
    setBusy(false);
  };

  const waiting = items.filter((it) => it.state === "waiting").length;
  const finished = !busy && received > 0 && waiting === 0;

  return (
    <div className={styles.app} data-theme={theme} dir={props.dir}>
      <header className={styles.bar}>
        <div className={styles.brand}>
          <img className={styles.logo} src="/logo.png" alt="" width={32} height={32} />
          <span>Alux Art</span>
        </div>
        <button type="button" className={styles.quiet} onClick={toggleTheme} aria-pressed={theme === "dark"}>
          {theme === "dark" ? props.themeLabels.light : props.themeLabels.dark}
        </button>
      </header>

      <main className={styles.main}>
        <section className={styles.panel}>
          <h1 className={styles.title}>{t.title}</h1>

          {stopped && !items.length ? (
            <p className={`${styles.msg} ${styles.error}`}>{stopped === "expired" ? t.expired : stopped === "full" ? t.full : t.closed}</p>
          ) : (
            <>
              <p className={styles.intro}>{props.channel === "whatsapp" ? t.introWhatsApp : t.introInstagram}</p>

              {!finished && (
                <label className={`${styles.zone} ${busy ? styles.zoneBusy : ""}`}>
                  <input
                    ref={input}
                    type="file"
                    // Plain image/* on purpose: an iPhone then hands over a
                    // full-resolution JPEG. Naming .heic here makes it send the
                    // HEIC original, which the server's image library cannot open.
                    accept="image/*"
                    multiple
                    disabled={busy || !!stopped}
                    onChange={(e) => pick(e.target.files)}
                  />
                  <span className={styles.zoneTitle}>{t.choose}</span>
                  <span className={styles.zoneHint}>{fill(t.hint, { max: props.maxPhotos, mb: props.maxMb })}</span>
                </label>
              )}

              {items.length > 0 && (
                <ul className={styles.list}>
                  {items.map((it, i) => (
                    <li key={i} className={styles.row}>
                      <div className={styles.rowTop}>
                        <span className={styles.name}>{it.file.name}</span>
                        <span className={styles.size}>{mb(it.file.size)}</span>
                        <span className={`${styles.chip} ${styles[`chip_${it.state}`]}`} aria-hidden="true">
                          {it.state === "done" ? "✓" : it.state === "error" ? "!" : it.state === "sending" ? `${it.pct}%` : ""}
                        </span>
                      </div>
                      {it.state === "sending" && (
                        <div className={styles.track}><div className={styles.fillBar} style={{ width: `${it.pct}%` }} /></div>
                      )}
                      {it.error && <p className={styles.rowError}>{it.error}</p>}
                    </li>
                  ))}
                </ul>
              )}

              {busy && at && (
                <p className={`${styles.msg} ${styles.info}`} aria-live="polite">
                  {fill(t.uploading, { n: at.n, total: at.total })}
                </p>
              )}

              {!busy && waiting > 0 && !stopped && (
                <button type="button" className={styles.primary} onClick={upload}>
                  {t.uploadButton} · {fill(t.selected, { count: waiting })}
                </button>
              )}

              {finished && (
                <div className={styles.doneBox} aria-live="polite">
                  <p className={`${styles.msg} ${styles.ok}`}>{fill(t.done, { count: received })} {t.backToChat}</p>
                  {props.backUrl && <a className={styles.primary} href={props.backUrl}>{t.openChat}</a>}
                </div>
              )}

              <p className={styles.privacy}>{t.privacy}</p>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
