"use client";

import Link from "next/link";
import ImagePreview from "@/components/ImagePreview";
import styles from "./StoryCard.module.css";

interface StoryCardProps {
  id: string;
  title: string;
  description?: string | null;
  storyType?: string | null;
  coverUrl?: string | null;
  priceNgn: number;
  price1Ngn?: number | null;
  packageSize: number;
  sceneCount?: number;
  creator: { displayName: string; avatarUrl?: string | null } | null;
  formatPrice: (ngn: number) => string;
}

const TYPE_LABEL: Record<string, string> = {
  solo: "Solo",
  duo: "Duo",
  group: "Group",
};

export default function StoryCard({
  id, title, description, storyType, coverUrl, priceNgn, price1Ngn, packageSize, sceneCount, creator, formatPrice,
}: StoryCardProps) {
  const typeLabel = storyType ? (TYPE_LABEL[storyType] ?? storyType) : null;
  const fromPrice = price1Ngn ?? priceNgn;

  return (
    <Link href={`/marketplace/${id}`} className={styles.card}>
      <div className={styles.cover}>
        {coverUrl ? (
          <ImagePreview src={coverUrl} alt={title} className={styles.coverImg} preferredWidth={400} />
        ) : (
          <div className={styles.coverPlaceholder}>
            <span className={styles.coverPlaceholderText}>Story</span>
          </div>
        )}
        <div className={styles.typeBadge}>
          <span className={styles.storyBadge}>Story</span>
          {typeLabel && <span className={styles.typePill}>{typeLabel}</span>}
        </div>
        <div className={styles.sceneBadge}>{sceneCount ?? packageSize} scenes</div>
      </div>

      <div className={styles.info}>
        <p className={styles.title}>{title}</p>
        {description && <p className={styles.description}>{description}</p>}
        <div className={styles.footer}>
          {creator && <span className={styles.creator}>{creator.displayName}</span>}
          <span className={styles.price}>from {formatPrice(fromPrice)}</span>
        </div>
      </div>
    </Link>
  );
}
