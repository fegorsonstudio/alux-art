"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useCurrency } from "@/lib/useCurrency";
import StoryCard from "@/components/StoryCard";
import styles from "./stories.module.css";

interface StoryTemplate {
  id: string;
  title: string;
  description?: string | null;
  storyType?: string | null;
  coverUrl?: string | null;
  priceNgn: number;
  price1Ngn?: number | null;
  packageSize: number;
  sceneCount?: number;
  creator: { id: string; displayName: string; avatarUrl?: string | null } | null;
  createdAt: string;
}

const STORY_TYPE_FILTERS = [
  { value: "", label: "All" },
  { value: "solo", label: "Solo" },
  { value: "duo", label: "Duo" },
  { value: "group", label: "Group" },
];

export default function StoriesPage() {
  const [stories, setStories] = useState<StoryTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const { format: formatPrice } = useCurrency();

  const loadStories = useCallback(async (cursor?: string, append = false) => {
    const params = new URLSearchParams({ isStory: "true", limit: "24" });
    if (typeFilter) params.set("storyType", typeFilter);
    if (cursor) params.set("cursor", cursor);

    const res = await fetch(`/api/marketplace?${params}`);
    if (!res.ok) return;
    const data = await res.json();
    const items: StoryTemplate[] = (data.templates ?? []).map((t: Record<string, unknown>) => ({
      id: t.id,
      title: t.title,
      description: t.description ?? null,
      storyType: t.storyType ?? null,
      coverUrl: t.coverUrl ?? null,
      priceNgn: t.priceNgn,
      price1Ngn: t.price1Ngn ?? null,
      packageSize: t.packageSize ?? 5,
      sceneCount: t.sceneCount ?? undefined,
      creator: t.creator ?? null,
      createdAt: t.createdAt,
    }));
    setStories(prev => append ? [...prev, ...items] : items);
    setNextCursor(data.nextCursor ?? null);
  }, [typeFilter]);

  useEffect(() => {
    setLoading(true);
    loadStories().finally(() => setLoading(false));
  }, [loadStories]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    await loadStories(nextCursor, true);
    setLoadingMore(false);
  };

  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <Link href="/" className={styles.navLogo}>Alux Art</Link>
        <div className={styles.navLinks}>
          <Link href="/marketplace" className={styles.navLink}>Marketplace</Link>
          <Link href="/stories" className={`${styles.navLink} ${styles.navLinkActive}`}>Stories</Link>
        </div>
      </nav>

      <header className={styles.hero}>
        <p className={styles.heroEyebrow}>Photo Stories</p>
        <h1 className={styles.heroTitle}>Live the Story</h1>
        <p className={styles.heroSub}>
          Step inside a narrative. Each story places you across multiple scenes — not just one portrait, but a full arc.
        </p>
      </header>

      <div className={styles.filters}>
        {STORY_TYPE_FILTERS.map(f => (
          <button
            key={f.value}
            type="button"
            className={`${styles.filterPill} ${typeFilter === f.value ? styles.filterPillActive : ""}`}
            onClick={() => setTypeFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={styles.loadingState}>Loading stories...</div>
      ) : stories.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No stories published yet.</p>
          <p className={styles.emptyHint}>Check back soon — creators are building them now.</p>
        </div>
      ) : (
        <div className={styles.section}>
        <div className={styles.grid}>
          {stories.map(s => (
            <StoryCard
              key={s.id}
              id={s.id}
              title={s.title}
              description={s.description}
              storyType={s.storyType}
              coverUrl={s.coverUrl}
              priceNgn={s.priceNgn}
              price1Ngn={s.price1Ngn}
              packageSize={s.packageSize}
              sceneCount={s.sceneCount}
              creator={s.creator}
              formatPrice={formatPrice}
            />
          ))}
        </div>
        </div>
      )}

      {nextCursor && (
        <div className={styles.loadMoreWrap}>
          <button type="button" className={styles.loadMoreBtn} onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading..." : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
