"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import styles from "./landing.module.css";

interface FeaturedTemplate {
  id: string;
  title: string;
  coverUrl: string | null;
  category: string;
}

export default function RotatingStyles({ templates }: { templates: FeaturedTemplate[] }) {
  const [offset, setOffset] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
    if (templates.length <= 3) return;
    const t = setInterval(() => setOffset(o => (o + 1) % templates.length), 4000);
    return () => clearInterval(t);
  }, [templates.length]);

  if (templates.length === 0) {
    return (
      <div className={styles.looksGrid}>
        <div className={styles.lookCardPlaceholder}><div className={styles.lookPlaceholder} /><div className={styles.lookMetaPlaceholder} /></div>
        <div className={styles.lookCardPlaceholder}><div className={styles.lookPlaceholder} /><div className={styles.lookMetaPlaceholder} /></div>
        <div className={styles.lookCardPlaceholder}><div className={styles.lookPlaceholder} /><div className={styles.lookMetaPlaceholder} /></div>
      </div>
    );
  }

  const shown = templates.length <= 3
    ? templates
    : [0, 1, 2].map(i => templates[(offset + i) % templates.length]);

  return (
    <div className={`${styles.looksGrid} ${visible ? styles.looksGridVisible : ""}`}>
      {shown.map((t, i) => (
        <Link key={`${t.id}-${offset}-${i}`} href={`/marketplace/${t.id}`} className={styles.lookCard}>
          {t.coverUrl
            ? <img src={t.coverUrl} alt={t.title} className={styles.lookImg} />
            : <div className={styles.lookPlaceholder} />
          }
          <div className={styles.lookMeta}>
            <span className={styles.lookTitle}>{t.title}</span>
            <span className={styles.lookCategory}>{t.category}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
