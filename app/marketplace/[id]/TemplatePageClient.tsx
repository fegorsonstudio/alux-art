"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import styles from "./template.module.css";

interface TemplateImage {
  id: string;
  url: string | null;
  purpose: string;
  tag?: string;
  displayOrder: number;
}

interface TemplateDetail {
  id: string;
  title: string;
  description?: string;
  category: string;
  tags: string[];
  priceNgn: number;
  shootMode: string;
  aspectRatio: string;
  packageSize: number;
  purchaseCount: number;
  coverUrl: string | null;
  images: TemplateImage[];
  creator: {
    id: string;
    displayName: string;
    bio?: string;
    avatarUrl: string | null;
    instagramUrl?: string;
    websiteUrl?: string;
    templateCount: number;
  } | null;
}

interface CouponResult {
  valid: boolean;
  discountNgn?: number;
  discountDescription?: string;
  message?: string;
}

export default function TemplatePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [galleryIdx, setGalleryIdx] = useState(0);
  const [couponCode, setCouponCode] = useState("");
  const [couponResult, setCouponResult] = useState<CouponResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState("");
  const [isCreator, setIsCreator] = useState(false);
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: template?.title ?? "Alux Art", text: `Book a professional AI photo shoot — "${template?.title}"`, url }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  useEffect(() => {
    fetch(`/api/marketplace/${id}`)
      .then(r => r.json())
      .then(d => { if (d.template) setTemplate(d.template); })
      .finally(() => setLoading(false));
    fetch("/api/user/creator-status").then(r => r.ok ? r.json() : { isCreator: false }).then(d => setIsCreator(d.isCreator));
  }, [id]);

  const allImages = template ? [
    ...(template.coverUrl ? [{ id: "__cover", url: template.coverUrl, purpose: "cover", displayOrder: -1, tag: undefined }] : []),
    ...template.images,
  ] : [];

  const validateCoupon = async () => {
    if (!couponCode.trim()) return;
    setValidating(true);
    setCouponResult(null);
    const res = await fetch("/api/coupons/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: couponCode, templateId: id }),
    });
    if (res.status === 401) {
      window.location.href = `/login?redirect=/marketplace/${id}`;
      return;
    }
    const data = await res.json();
    setCouponResult(data);
    setValidating(false);
  };

  const purchase = () => {
    setBuying(true);
    router.push(`/marketplace/${id}/book${couponCode ? `?coupon=${encodeURIComponent(couponCode)}` : ""}`);
  };

  if (loading) {
    return (
      <div className={styles.loadingPage}>
        <Link href="/marketplace" className={styles.backLink}>← Marketplace</Link>
        <div className={styles.loadingText}>Loading...</div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className={styles.loadingPage}>
        <Link href="/marketplace" className={styles.backLink}>← Marketplace</Link>
        <div className={styles.loadingText}>Template not found.</div>
      </div>
    );
  }

  const displayedPrice = couponResult?.valid && couponResult.discountNgn
    ? template.priceNgn - couponResult.discountNgn
    : template.priceNgn;

  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <Link href="/marketplace" className={styles.backLink}>← Marketplace</Link>
        <Link href="/" className={styles.navBrand}>Alux Art</Link>
        {isCreator
          ? <Link href="/creator-dashboard" className={styles.backLink}>Creator Dashboard →</Link>
          : <Link href="/become-creator" className={styles.backLink}>Become a Creator</Link>
        }
      </header>

      <div className={styles.layout}>
        {/* Gallery */}
        <div className={styles.galleryCol}>
          <div className={styles.mainImg}>
            {allImages[galleryIdx]?.url
              ? <img src={allImages[galleryIdx].url!} alt={template.title} className={styles.mainImgEl} />
              : <div className={styles.imgPlaceholder}>No image</div>
            }
          </div>
          {allImages.length > 1 && (
            <div className={styles.thumbTrack}>
              {allImages.map((img, i) => (
                <button
                  key={img.id}
                  type="button"
                  className={`${styles.thumb} ${i === galleryIdx ? styles.thumbActive : ""}`}
                  onClick={() => setGalleryIdx(i)}
                >
                  {img.url
                    ? <img src={img.url} alt="" className={styles.thumbImg} />
                    : <div className={styles.thumbPlaceholder} />
                  }
                  {img.tag && <span className={styles.thumbTag}>{img.tag}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div className={styles.infoCol}>
          <span className={styles.categoryPill}>{template.category}</span>
          <h1 className={styles.title}>{template.title}</h1>

          {template.creator && (
            <Link href={`/creators/${template.creator.id}`} className={styles.creatorCard}>
              {template.creator.avatarUrl
                ? <img src={template.creator.avatarUrl} alt={template.creator.displayName} className={styles.creatorAvatar} />
                : <div className={styles.creatorAvatarFallback}>{template.creator.displayName[0]}</div>
              }
              <div className={styles.creatorInfo}>
                <span className={styles.creatorName}>{template.creator.displayName}</span>
                <span className={styles.creatorMeta}>{template.creator.templateCount} style{template.creator.templateCount !== 1 ? "s" : ""}</span>
              </div>
              <span className={styles.creatorArrow}>→</span>
            </Link>
          )}

          {template.description && (
            <p className={styles.description}>{template.description}</p>
          )}

          <div className={styles.metaGrid}>
            <div className={styles.metaItem}><span className={styles.metaLabel}>Mode</span><span className={styles.metaVal}>{template.shootMode}</span></div>
            <div className={styles.metaItem}><span className={styles.metaLabel}>Ratio</span><span className={styles.metaVal}>{template.aspectRatio}</span></div>
            <div className={styles.metaItem}><span className={styles.metaLabel}>Images</span><span className={styles.metaVal}>{template.packageSize}</span></div>
            <div className={styles.metaItem}><span className={styles.metaLabel}>Sales</span><span className={styles.metaVal}>{template.purchaseCount}</span></div>
          </div>

          {template.tags.length > 0 && (
            <div className={styles.tags}>
              {template.tags.map(t => <span key={t} className={styles.tag}>{t}</span>)}
            </div>
          )}

          <div className={styles.purchaseBox}>
            <div className={styles.couponRow}>
              <input
                className={styles.couponInput}
                placeholder="Coupon code"
                value={couponCode}
                onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponResult(null); }}
              />
              <button
                type="button"
                className={styles.couponBtn}
                onClick={validateCoupon}
                disabled={validating || !couponCode.trim()}
              >{validating ? "..." : "Apply"}</button>
            </div>
            {couponResult && (
              <p className={couponResult.valid ? styles.couponSuccess : styles.couponError}>
                {couponResult.valid
                  ? `${couponResult.discountDescription} — save ₦${couponResult.discountNgn?.toLocaleString()}`
                  : couponResult.message}
              </p>
            )}

            <div className={styles.priceRow}>
              {couponResult?.valid && couponResult.discountNgn ? (
                <>
                  <span className={styles.priceOriginal}>₦{template.priceNgn.toLocaleString()}</span>
                  <span className={styles.priceFinal}>₦{displayedPrice.toLocaleString()}</span>
                </>
              ) : (
                <span className={styles.priceFinal}>₦{template.priceNgn.toLocaleString()}</span>
              )}
            </div>

            {error && <p className={styles.buyError}>{error}</p>}

            <button
              type="button"
              className={styles.buyBtn}
              onClick={purchase}
              disabled={buying}
            >{buying ? "Loading..." : "Book This Look"}</button>

            <p className={styles.buyNote}>
              Add your identity photos, customise the reference images, then pay — all on the next screen.
            </p>

            <button
              type="button"
              className={`${styles.shareBtn} ${copied ? styles.shareBtnCopied : ""}`}
              onClick={share}
            >
              {copied ? "Link copied!" : "Share this look"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
