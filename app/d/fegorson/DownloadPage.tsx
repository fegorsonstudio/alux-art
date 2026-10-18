"use client";

import { useEffect, useState } from "react";
import styles from "@/app/d/up/[token]/upload.module.css";
import own from "./fegorson.module.css";

/** The download page, in the App look with the person's light/dark choice (localStorage studio-theme). */
export default function DownloadPage(props: { version: string; sizeMb: number; sha256: string }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("studio-theme");
      if (saved === "dark" || saved === "light") setTheme(saved);
      else if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) setTheme("dark");
    } catch { /* private mode */ }
  }, []);
  const toggle = () => {
    const t = theme === "dark" ? "light" : "dark";
    setTheme(t);
    try { localStorage.setItem("studio-theme", t); } catch { /* private mode */ }
  };
  const wa = `https://wa.me/2349076858017?text=${encodeURIComponent("Hello, I would like to buy a Fegorson Studio licence code.")}`;

  return (
    <div className={styles.app} data-theme={theme}>
      <header className={styles.bar}>
        <div className={styles.brand}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.logo} src="/fegorson-icon.png" alt="" />
          Fegorson Studio
        </div>
        <button type="button" className={styles.quiet} onClick={toggle}>{theme === "dark" ? "Light" : "Dark"}</button>
      </header>
      <main className={styles.main}>
        <section className={styles.panel}>
          <h1 className={styles.title}>Fegorson Studio for Windows</h1>
          <p className={styles.intro}>
            Professional photo retouching on your own laptop: skin, eyes, teeth, body shaping, dodge and burn, frequency separation,
            studio backdrops and your own colour style. Your photos never leave your computer.
          </p>
          {/* A route handler (a redirect to the file), not a page: a plain link is right here. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a className={styles.primary} href="/d/fegorson/download">Download for Windows · {props.sizeMb} MB</a>
          <p className={own.meta}>Version {props.version} · Windows 10 or 11, 64-bit · one-time install</p>

          <div className={`${styles.msg} ${styles.info}`}>
            <strong>Free for 7 days.</strong> The trial starts the first time you open the app. When it ends, the app asks for a
            licence code. A code is ₦20,000, once, for life. <a className={own.link} href={wa} target="_blank" rel="noopener">Buy a code on WhatsApp</a>{" "}
            and it arrives in the chat the moment the payment clears.
          </div>

          <div className={own.steps}>
            <p className={own.stepsTitle}>Installing</p>
            <ol className={own.list}>
              <li>Download the file and open it.</li>
              <li>Windows may show “Windows protected your PC”. Click <strong>More info</strong>, then <strong>Run anyway</strong>. The app is new and not yet registered with Microsoft; that notice is about the signature, not the app.</li>
              <li>Open Fegorson Studio from the Start menu and drop in a photo.</li>
            </ol>
          </div>

          <p className={styles.privacy}>
            File check (SHA-256): <code className={own.hash}>{props.sha256}</code>
          </p>
        </section>
      </main>
    </div>
  );
}
