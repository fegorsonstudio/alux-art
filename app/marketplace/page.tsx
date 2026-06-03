"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { TEMPLATE_CATEGORIES } from "@/lib/types";
import { useCurrency } from "@/lib/useCurrency";
import styles from "./marketplace.module.css";
import ImagePreview from "@/components/ImagePreview";

interface TemplateCard {
  id: string;
  title: string;
  category: string;
  priceNgn: number;
  purchaseCount: number;
  avgRating: number | null;
  ratingCount: number;
  coverUrl: string | null;
  creator: { id: string; displayName: string; avatarUrl: string | null } | null;
  createdAt: string;
}

function StarDisplay({ rating, count }: { rating: number | null; count: number }) {
  if (!rating) return null;
  const full = Math.floor(rating);
  const hasHalf = rating - full >= 0.5;
  const empty = 5 - full - (hasHalf ? 1 : 0);
  return (
    <div className={styles.starRow}>
      {Array.from({ length: full }, (_, i) => <span key={`f${i}`} className={styles.starFull}>★</span>)}
      {hasHalf && <span className={styles.starHalf}>★</span>}
      {Array.from({ length: empty }, (_, i) => <span key={`e${i}`} className={styles.starEmpty}>★</span>)}
      <span className={styles.ratingNum}>{rating.toFixed(1)}</span>
      {count > 0 && <span className={styles.ratingCount}>({count})</span>}
    </div>
  );
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
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [navOpen, setNavOpen] = useState(false);
  const { currency, toggle: toggleCurrency, format: formatPrice } = useCurrency();

  useEffect(() => {
    const stored = localStorage.getItem("studio-theme");
    if (stored === "dark" || stored === "light") setTheme(stored);
  }, []);

  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem("studio-theme", next);
      return next;
    });
  };

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
    <div className={styles.page} data-theme={theme}>
      <header className={styles.nav}>
        <Link href="/" className={styles.navBrand}>Alux Art</Link>
        <button
          className={styles.hamburger}
          onClick={() => setNavOpen(o => !o)}
          aria-label="Toggle navigation"
          aria-expanded={navOpen}
          type="button"
        >
          {navOpen ? "✕" : "☰"}
        </button>
        <div className={navOpen ? `${styles.navRight} ${styles.navRightOpen}` : styles.navRight}>
          <Link href="/studio" className={styles.navLink} onClick={() => setNavOpen(false)}>Studio</Link>
          {isCreator
            ? <Link href="/creator-dashboard" className={`${styles.navCta} ${styles.navCtaDash}`} onClick={() => setNavOpen(false)}>Dashboard</Link>
            : <Link href="/become-creator" className={styles.navCta} onClick={() => setNavOpen(false)}>Become a Creator</Link>
          }
          <button className={styles.currencyToggle} onClick={toggleCurrency} type="button">
            {currency === "NGN" ? "₦ NGN" : "$ USD"}
          </button>
          <button className={styles.themeToggle} onClick={toggleTheme} type="button" aria-pressed={theme === "dark"}>
            {theme === "dark" ? "Light" : "Dark"}
          </button>
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
                    ? <ImagePreview src={t.coverUrl} alt={t.title} className={styles.cardCover} />
                    : <div className={styles.cardPlaceholder}><span className={styles.placeholderText}>No preview</span></div>
                  }
                  <span className={styles.categoryBadge}>{t.category}</span>
                </div>
                <div className={styles.cardBody}>
                  <h3 className={styles.cardTitle}>{t.title}</h3>
                  {t.creator && (
                    <div className={styles.cardCreator}>
                      {t.creator.avatarUrl
                        ? <ImagePreview src={t.creator.avatarUrl} alt={t.creator.displayName} className={styles.creatorAvatar} preferredWidth={80} />
                        : <div className={styles.creatorAvatarFallback}>{t.creator.displayName[0]}</div>
                      }
                      <span className={styles.creatorName}>{t.creator.displayName}</span>
                    </div>
                  )}
                  <StarDisplay rating={t.avgRating} count={t.ratingCount} />
                  <div className={styles.cardFooter}>
                    <span className={styles.price}>{formatPrice(t.priceNgn)}</span>
                    {t.purchaseCount > 0
                      ? <span className={styles.salesCount}>{t.purchaseCount} sale{t.purchaseCount !== 1 ? "s" : ""}</span>
                      : <span className={styles.newBadge}>New</span>
                    }
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
