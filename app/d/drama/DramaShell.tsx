"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import styles from "./drama.module.css";

/**
 * The frame both game pages share: the wordmark, the light/dark switch
 * (localStorage studio-theme, as on every App-look page; dark by default
 * here, a cinema shelf) and the floating dock.
 */
export default function DramaShell({ children, dock }: { children: ReactNode; dock: { href: string; label: string; icon: keyof typeof ICONS }[] }) {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("studio-theme");
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch { /* private mode */ }
  }, []);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try { localStorage.setItem("studio-theme", next); } catch { /* private mode */ }
  };

  return (
    <div className={styles.app} data-theme={theme} id="top">
      <div className={styles.wrap}>
        <header className={styles.top}>
          <Link href="/d/drama" className={styles.mark}>Alux <span>Micro Drama</span></Link>
          <button type="button" className={styles.iconBtn} onClick={toggle} aria-label={theme === "dark" ? "Switch to light" : "Switch to dark"}>
            {theme === "dark" ? ICONS.sun : ICONS.moon}
          </button>
        </header>
        {children}
      </div>
      <nav className={styles.dock} aria-label="Sections">
        {dock.map((d) => (
          <a key={d.href} href={d.href} className={styles.dockItem}>
            {ICONS[d.icon]}
            <span>{d.label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}

const svg = (path: ReactNode) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>
);
export const ICONS = {
  home: svg(<><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9.5h13V10" /></>),
  stories: svg(<><rect x="3.5" y="4" width="7" height="16" rx="1.5" /><rect x="13.5" y="4" width="7" height="16" rx="1.5" /></>),
  join: svg(<><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c1.2-3.6 4-5.5 7-5.5s5.8 1.9 7 5.5" /></>),
  brands: svg(<><path d="M4 9.5 12 4l8 5.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" /><path d="M9 20v-6h6v6" /></>),
  cast: svg(<><circle cx="9" cy="9" r="3" /><circle cx="17" cy="10" r="2.4" /><path d="M3.5 19c.9-3 3-4.6 5.5-4.6s4.6 1.6 5.5 4.6" /><path d="M15 15.2c2.6-.3 4.6 1.2 5.5 3.8" /></>),
  sun: svg(<><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" /></>),
  moon: svg(<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />),
};
