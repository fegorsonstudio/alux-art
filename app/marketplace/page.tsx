"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { TEMPLATE_CATEGORIES } from "@/lib/types";
import styles from "./marketplace.module.css";

interface TemplateCard {
  id: string;
  title: string;
  category: string;
  priceNgn: number;
  purchaseCount: number;
  coverUrl: string | null;
  creator: { id: string; displayName: string; avatarUrl: string | null } | null;
  createdAt: string;
}

export default function MarketplacePage() {
  const [templates, setTemplates] = useState<TemplateCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isCreator, setIsCreator] = useState(false);

  const load = useCallback(async (cat: string, q: string, cursor?: string) => {
    if (!cursor) setLoading(true); else setLoadingMore(true);
    const p = new URLSearchParams({ limit: "24" });
    if (cat !== "all") p.set("category", cat);
    if (q) p.set("q", q);
    if (cursor) p.set("cursor", cursor);
    const res = await fetch(`/api/marketplace?${p}`);
    if (res.ok) {
      const d = await res.json();
      setTemplates(prev => cursor ? [...prev, ...d.templates] : d.templates);
      setNextCursor(d.nextCursor ?? null);
    }
    setLoading(false);
    setLoadingMore(false);
  }, []);

  useEffect(() => {
    load(category, search);
  }, [category, search, load]);

  useEffect(() => {
    fetch("/api/user/creator-status")
      .then(r => r.ok ? r.json() : { isCreator: false })
      .then(d => setIsCreator(d.isCreator));
  }, []);

  const applySearch = () => setSearch(searchInput);

  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <Link href="/" className={styles.navBrand}>Alux Art</Link>
        <div className={styles.navRight}>
          <Link href="/" className={styles.navLink}>Studio</Link>
          {isCreator
            ? <Link href="/creator-dashboard" className={styles.navCta}>Creator Dashboard</Link>
            : <Link href="/become-creator" className={styles.navCta}>Become a Creator</Link>
          }
        </div>
      </header>

      <section className={styles.hero}>
        <p className={styles.heroEyebrow}>Template Marketplace</p>
        <h1 className={styles.heroTitle}>Discover your perfect look</h1>
        <p className={styles.heroSub}>Buy a shoot style from Nigeria&apos;s best photographers. Your photos, their vision.</p>
        <div className={styles.searchRow}>
          <input
            className={styles.searchInput}
            placeholder="Search styles..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && applySearch()}
          />
          <button className={styles.searchBtn} onClick={applySearch} type="button">Search</button>
        </div>
      </section>

      <div className={styles.pillsTrack}>
        <button
          type="button"
          className={`${styles.pill} ${category === "all" ? styles.pillActive : ""}`}
          onClick={() => setCategory("all")}
        >All</button>
        {TEMPLATE_CATEGORIES.map(c => (
          <button
            key={c.value}
            type="button"
            className={`${styles.pill} ${category === c.value ? styles.pillActive : ""}`}
            onClick={() => setCategory(c.value)}
          >{c.label}</button>
        ))}
      </div>

      <section className={styles.section}>
        {loading ? (
          <div className={styles.empty}>Loading styles...</div>
        ) : templates.length === 0 ? (
          <div className={styles.empty}>No styles found. Try a different category or search.</div>
        ) : (
          <div className={styles.grid}>
            {templates.map(t => (
              <Link key={t.id} href={`/marketplace/${t.id}`} className={styles.card}>
                <div className={styles.cardImg}>
                  {t.coverUrl
                    ? <img src={t.coverUrl} alt={t.title} className={styles.cardCover} />
                    : <div className={styles.cardPlaceholder}><span className={styles.placeholderText}>No preview</span></div>
                  }
                  <span className={styles.categoryBadge}>{t.category}</span>
                </div>
                <div className={styles.cardBody}>
                  <h3 className={styles.cardTitle}>{t.title}</h3>
                  {t.creator && (
                    <div className={styles.cardCreator}>
                      {t.creator.avatarUrl
                        ? <img src={t.creator.avatarUrl} alt={t.creator.displayName} className={styles.creatorAvatar} />
                        : <div className={styles.creatorAvatarFallback}>{t.creator.displayName[0]}</div>
                      }
                      <span className={styles.creatorName}>{t.creator.displayName}</span>
                    </div>
                  )}
                  <div className={styles.cardFooter}>
                    <span className={styles.price}>₦{t.priceNgn.toLocaleString()}</span>
                    <span className={styles.salesCount}>{t.purchaseCount} sales</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {nextCursor && (
          <div className={styles.loadMoreRow}>
            <button
              type="button"
              className={styles.loadMoreBtn}
              onClick={() => load(category, search, nextCursor)}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading..." : "Load more"}
            </button>
          </div>
        )}
      </section>

      <section className={styles.creatorBanner}>
        <div className={styles.bannerInner}>
          <div>
            <h2 className={styles.bannerTitle}>Are you a photographer?</h2>
            <p className={styles.bannerSub}>List your shoot styles and earn on every booking.</p>
          </div>
          <Link href="/become-creator" className={styles.bannerBtn}>Become a Creator</Link>
        </div>
      </section>
    </div>
  );
}
