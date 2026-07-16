"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { TEMPLATE_CATEGORIES } from "@/lib/types";
import { useCurrency } from "@/lib/useCurrency";
import { useT } from "@/lib/useLocale";
import type { AppDictionary } from "@/lib/dictionaries";
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
  isStory: boolean;
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
  // Deep-link support: /marketplace?category=call_to_bar lands pre-filtered (used for
  // ManyChat / social campaigns that send people straight to one category).
  const [category, setCategory] = useState(() => {
    if (typeof window === "undefined") return "all";
    const c = new URLSearchParams(window.location.search).get("category");
    return c && c.trim() ? c : "all";
  });
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [navOpen, setNavOpen] = useState(false);
  const { currency, toggle: toggleCurrency, format: formatPrice } = useCurrency();
  const t = useT("marketplace");
  const tc = useT("common");
  const tCatRaw = useT("categories");
  // Category values arrive as free strings from the API — fall back to the raw value.
  const tCat = (value: string) => tCatRaw(value as keyof AppDictionary["categories"]);

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
    if (cat === "story") {
      p.set("isStory", "true");
    } else {
      p.set("isStory", "false");
      if (cat !== "all") p.set("category", cat);
    }
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
          <Link href="/studio" className={styles.navLink} onClick={() => setNavOpen(false)}>{tc("studio")}</Link>
          {isCreator
            ? <Link href="/creator-dashboard" className={`${styles.navCta} ${styles.navCtaDash}`} onClick={() => setNavOpen(false)}>{tc("dashboard")}</Link>
            : <Link href="/become-creator" className={styles.navCta} onClick={() => setNavOpen(false)}>{tc("becomeCreator")}</Link>
          }
          <button className={styles.currencyToggle} onClick={toggleCurrency} type="button">
            {currency === "NGN" ? "₦ NGN" : "$ USD"}
          </button>
          <button className={styles.themeToggle} onClick={toggleTheme} type="button" aria-pressed={theme === "dark"}>
            {theme === "dark" ? tc("light") : tc("dark")}
          </button>
        </div>
      </header>

      <section className={styles.hero}>
        <p className={styles.heroEyebrow}>{t("heroEyebrow")}</p>
        <h1 className={styles.heroTitle}>{t("heroTitle")}</h1>
        <p className={styles.heroSub}>{t("heroSub")}</p>
        <div className={styles.searchRow}>
          <input
            className={styles.searchInput}
            placeholder={t("searchPlaceholder")}
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && applySearch()}
          />
          <button className={styles.searchBtn} onClick={applySearch} type="button">{t("search")}</button>
        </div>
      </section>

      <div className={styles.pillsTrack}>
        <button
          type="button"
          className={`${styles.pill} ${category === "all" ? styles.pillActive : ""}`}
          onClick={() => setCategory("all")}
        >{t("all")}</button>
        {/* Stories pill — visually distinct, always first */}
        <button
          type="button"
          className={`${styles.pill} ${styles.pillStory} ${category === "story" ? styles.pillActive : ""}`}
          onClick={() => setCategory("story")}
        >{tCat("story")}</button>
        {TEMPLATE_CATEGORIES.filter(c => c.value !== "story").map(c => (
          <button
            key={c.value}
            type="button"
            className={`${styles.pill} ${category === c.value ? styles.pillActive : ""}`}
            onClick={() => setCategory(c.value)}
          >{tCat(c.value)}</button>
        ))}
      </div>

      <section className={styles.section}>
        {loading ? (
          <div className={styles.empty}>{t("loadingStyles")}</div>
        ) : templates.length === 0 ? (
          <div className={styles.empty}>{t("noStyles")}</div>
        ) : (
          <div className={styles.grid}>
            {templates.map(tpl => (
              <Link key={tpl.id} href={`/marketplace/${tpl.id}`} className={`${styles.card} ${tpl.isStory ? styles.cardStory : ""}`}>
                <div className={styles.cardImg}>
                  {tpl.coverUrl
                    ? <ImagePreview src={tpl.coverUrl} alt={tpl.title} className={styles.cardCover} />
                    : <div className={styles.cardPlaceholder}><span className={styles.placeholderText}>{t("noPreview")}</span></div>
                  }
                  <span className={styles.categoryBadge}>{tCat(tpl.category)}</span>
                  {tpl.isStory && <span className={styles.storyBadge}>{t("storyBadge")}</span>}
                </div>
                <div className={styles.cardBody}>
                  <h3 className={styles.cardTitle}>{tpl.title}</h3>
                  {tpl.creator && (
                    <div className={styles.cardCreator}>
                      {tpl.creator.avatarUrl
                        ? <ImagePreview src={tpl.creator.avatarUrl} alt={tpl.creator.displayName} className={styles.creatorAvatar} preferredWidth={80} />
                        : <div className={styles.creatorAvatarFallback}>{tpl.creator.displayName[0]}</div>
                      }
                      <span className={styles.creatorName}>{tpl.creator.displayName}</span>
                    </div>
                  )}
                  <StarDisplay rating={tpl.avgRating} count={tpl.ratingCount} />
                  <div className={styles.cardFooter}>
                    <span className={styles.price}>{formatPrice(tpl.priceNgn)}</span>
                    {tpl.purchaseCount > 0
                      ? <span className={styles.salesCount}>{tpl.purchaseCount === 1 ? t("saleOne", { n: 1 }) : t("saleMany", { n: tpl.purchaseCount })}</span>
                      : <span className={styles.newBadge}>{t("newBadge")}</span>
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
              {loadingMore ? tc("loading") : t("loadMore")}
            </button>
          </div>
        )}
      </section>

      <section className={styles.creatorBanner}>
        <div className={styles.bannerInner}>
          <div>
            <h2 className={styles.bannerTitle}>{t("photographerTitle")}</h2>
            <p className={styles.bannerSub}>{t("photographerSub")}</p>
          </div>
          <Link href="/become-creator" className={styles.bannerBtn}>{tc("becomeCreator")}</Link>
        </div>
      </section>
    </div>
  );
}
