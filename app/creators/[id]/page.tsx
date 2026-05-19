"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import styles from "./creator.module.css";

interface CreatorProfile {
  id: string;
  displayName: string;
  bio?: string;
  avatarUrl: string | null;
  instagramUrl?: string;
  websiteUrl?: string;
  createdAt: string;
  templates: Array<{
    id: string;
    title: string;
    category: string;
    priceNgn: number;
    purchaseCount: number;
    coverUrl: string | null;
    createdAt: string;
  }>;
}

export default function CreatorPage() {
  const { id } = useParams<{ id: string }>();
  const [creator, setCreator] = useState<CreatorProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/creators/${id}`)
      .then(r => r.json())
      .then(d => { if (d.creator) setCreator(d.creator); })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className={styles.loadingPage}>
        <Link href="/marketplace" className={styles.back}>← Marketplace</Link>
      </div>
    );
  }

  if (!creator) {
    return (
      <div className={styles.loadingPage}>
        <Link href="/marketplace" className={styles.back}>← Marketplace</Link>
        <p className={styles.notFound}>Creator not found.</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <Link href="/marketplace" className={styles.back}>← Marketplace</Link>
        <Link href="/" className={styles.navBrand}>Alux Art</Link>
      </header>

      <section className={styles.hero}>
        {creator.avatarUrl
          ? <img src={creator.avatarUrl} alt={creator.displayName} className={styles.avatar} />
          : <div className={styles.avatarFallback}>{creator.displayName[0]}</div>
        }
        <h1 className={styles.name}>{creator.displayName}</h1>
        {creator.bio && <p className={styles.bio}>{creator.bio}</p>}
        <div className={styles.links}>
          {creator.instagramUrl && (
            <a href={creator.instagramUrl} target="_blank" rel="noopener noreferrer" className={styles.socialLink}>Instagram</a>
          )}
          {creator.websiteUrl && (
            <a href={creator.websiteUrl} target="_blank" rel="noopener noreferrer" className={styles.socialLink}>Website</a>
          )}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{creator.templates.length} style{creator.templates.length !== 1 ? "s" : ""}</h2>
        {creator.templates.length === 0 ? (
          <p className={styles.empty}>No published styles yet.</p>
        ) : (
          <div className={styles.grid}>
            {creator.templates.map(t => (
              <Link key={t.id} href={`/marketplace/${t.id}`} className={styles.card}>
                <div className={styles.cardImg}>
                  {t.coverUrl
                    ? <img src={t.coverUrl} alt={t.title} className={styles.cardCover} />
                    : <div className={styles.cardPlaceholder} />
                  }
                  <span className={styles.categoryBadge}>{t.category}</span>
                </div>
                <div className={styles.cardBody}>
                  <h3 className={styles.cardTitle}>{t.title}</h3>
                  <div className={styles.cardFooter}>
                    <span className={styles.price}>₦{t.priceNgn.toLocaleString()}</span>
                    <span className={styles.sales}>{t.purchaseCount} sales</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
