"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Analytics } from "@/lib/analytics";
import { useCurrency } from "@/lib/useCurrency";
import { getTheme, getFont } from "@/lib/storefront-themes";
import styles from "./template.module.css";
import ImagePreview from "@/components/ImagePreview";
import CheckoutPanel from "./CheckoutPanel";
import TemplateShareCard from "@/components/TemplateShareCard";

function renderMarkdown(text: string) {
  // Split into lines, handle > blockquotes, then bold **...**
  return text.split("\n").map((line, li) => {
    const isQuote = line.startsWith("> ");
    const content = isQuote ? line.slice(2) : line;
    const parts: React.ReactNode[] = [];
    const boldRe = /\*\*(.+?)\*\*/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = boldRe.exec(content)) !== null) {
      if (m.index > last) parts.push(content.slice(last, m.index));
      parts.push(<strong key={m.index}>{m[1]}</strong>);
      last = m.index + m[0].length;
    }
    if (last < content.length) parts.push(content.slice(last));
    return isQuote
      ? <blockquote key={li} className={styles.descQuote}>{parts}</blockquote>
      : <span key={li}>{parts}{li < text.split("\n").length - 1 ? " " : ""}</span>;
  });
}

interface TemplateImage {
  id: string;
  url: string | null;
  purpose: string;
  tag?: string;
  customName?: string | null;
  note?: string | null;
  noteHidden?: boolean;
  storagePath: string;
  storageBucket: string;
  displayOrder: number;
}

interface TemplateDetail {
  id: string;
  title: string;
  description?: string;
  category: string;
  tags: string[];
  priceNgn: number;
  price1Ngn?: number | null;
  price5Ngn?: number | null;
  shootMode: string;
  aspectRatio: string;
  packageSize: number;
  purchaseCount: number;
  avgRating: number | null;
  ratingCount: number;
  userRating: number | null;
  coverUrl: string | null;
  images: TemplateImage[];
  // Story fields
  isStory?: boolean;
  storyType?: string;
  defaultRole?: string;
  roleChips?: string[];
  requiresCostar?: boolean;
  requiresGroup?: boolean;
  requiresBrand?: boolean;
  scenes?: Array<{ slot: number; title: string; description: string; environment?: string; wardrobe?: string; coCharacter?: string }>;
  creator: {
    id: string;
    displayName: string;
    bio?: string;
    avatarUrl: string | null;
    instagramUrl?: string;
    websiteUrl?: string;
    templateCount: number;
    theme?: string;
    fontFamily?: string;
  } | null;
}

interface CouponResult {
  valid: boolean;
  discountNgn?: number;
  discountDescription?: string;
  message?: string;
}

function StarWidget({
  avg,
  count,
  userRating,
  onRate,
}: {
  avg: number | null;
  count: number;
  userRating: number | null;
  onRate: (n: number) => void;
}) {
  const [hover, setHover] = useState(0);
  const display = hover || userRating || 0;

  return (
    <div className={styles.ratingBlock}>
      <div className={styles.ratingStars}>
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            className={`${styles.ratingStar} ${n <= display ? styles.ratingStarActive : ""}`}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onRate(n)}
            aria-label={`Rate ${n} star${n !== 1 ? "s" : ""}`}
          >★</button>
        ))}
      </div>
      {avg !== null && count > 0 && (
        <span className={styles.ratingAvg}>{avg.toFixed(1)} ({count})</span>
      )}
      {userRating && <span className={styles.ratingYours}>Your rating: {userRating}★</span>}
    </div>
  );
}

export default function TemplatePage() {
  const { id } = useParams<{ id: string }>();
  const { currency, toggle: toggleCurrency, format: formatPrice } = useCurrency();
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [galleryIdx, setGalleryIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponResult, setCouponResult] = useState<CouponResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState("");
  const [isCreator, setIsCreator] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [selectedPkg, setSelectedPkg] = useState<1 | 5 | 10>(10);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [shareLabel, setShareLabel] = useState("Share");
  const [showQR, setShowQR] = useState(false);
  const [showGift, setShowGift] = useState(false);
  const [giftBuying, setGiftBuying] = useState(false);
  const [giftName, setGiftName] = useState("");
  const [giftMessage, setGiftMessage] = useState("");
  const [giftError, setGiftError] = useState("");
  const [userName, setUserName] = useState("");
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [avgRating, setAvgRating] = useState<number | null>(null);
  const [ratingCount, setRatingCount] = useState(0);
  const [ratingSubmitting, setRatingSubmitting] = useState(false);

  const storTheme = getTheme(template?.creator?.theme ?? "alux");
  const storFont = getFont(template?.creator?.fontFamily ?? "default");

  useEffect(() => {
    fetch(`/api/marketplace/${id}`)
      .then(r => r.json())
      .then(d => {
        if (d.template) {
          setTemplate(d.template);
          setAvgRating(d.template.avgRating ?? null);
          setRatingCount(d.template.ratingCount ?? 0);
          setUserRating(d.template.userRating ?? null);
          Analytics.templateViewed(d.template.id, d.template.title);
        }
      })
      .finally(() => setLoading(false));
    fetch("/api/user/creator-status").then(r => r.ok ? r.json() : { isCreator: false }).then(d => setIsCreator(d.isCreator));
    fetch("/api/me").then(r => {
      setIsLoggedIn(r.ok);
      if (r.ok) r.json().then(d => { if (d.user?.name) setUserName(d.user.name); });
    });
  }, [id]);

  useEffect(() => {
    if (!storFont.googleUrl) return;
    const existing = document.querySelector("link[data-storefront-font]");
    if (existing) existing.remove();
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = storFont.googleUrl;
    link.setAttribute("data-storefront-font", "");
    document.head.appendChild(link);
  }, [storFont.googleUrl]);

  // Gallery: if creator has uploaded sample/gallery images use those; otherwise fall back to the cover.
  // Workflow refs (tagged + inspiration) are hidden pre-payment.
  const sampleImgs = template ? template.images.filter(img => img.purpose === "sample") : [];
  const allImages = template ? (
    sampleImgs.length > 0
      ? sampleImgs
      : (template.coverUrl ? [{ id: "__cover", url: template.coverUrl, purpose: "cover", displayOrder: -1, tag: undefined }] : [])
  ) : [];

  useEffect(() => {
    const len = allImages.length;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setLightboxOpen(false); return; }
      if (!len) return;
      if (e.key === "ArrowLeft") setGalleryIdx(i => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setGalleryIdx(i => Math.min(len - 1, i + 1));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allImages.length]);

  const submitRating = async (n: number) => {
    if (!isLoggedIn) { window.location.href = `/login?next=/marketplace/${id}`; return; }
    if (ratingSubmitting) return;
    setRatingSubmitting(true);
    setUserRating(n);
    const res = await fetch(`/api/templates/${id}/rate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: n }),
    });
    if (res.ok) {
      const d = await res.json();
      setAvgRating(d.avgRating ?? null);
      setRatingCount(d.ratingCount ?? 0);
    }
    setRatingSubmitting(false);
  };

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
      window.location.href = `/login?next=/marketplace/${id}`;
      return;
    }
    const data = await res.json();
    setCouponResult(data);
    setValidating(false);
  };

  const share = async () => {
    const url = window.location.href;
    if (template && typeof navigator.share === "function") {
      try { await navigator.share({ title: template.title, url }); return; } catch {}
    }
    await navigator.clipboard.writeText(url);
    setShareLabel("Copied!");
    setTimeout(() => setShareLabel("Share"), 1500);
  };

  const purchase = () => {
    if (!isLoggedIn) {
      window.location.href = `/login?next=/marketplace/${id}`;
      return;
    }
    setCheckoutOpen(true);
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

  const pkgOptions = ([
    { n: 1 as const, price: template.price1Ngn },
    { n: 5 as const, price: template.price5Ngn },
    { n: 10 as const, price: template.priceNgn },
  ] as Array<{ n: 1 | 5 | 10; price: number | null | undefined }>)
    .filter(o => o.price != null && o.price > 0) as Array<{ n: 1 | 5 | 10; price: number }>;

  const activePkg = pkgOptions.find(o => o.n === selectedPkg) ?? pkgOptions[pkgOptions.length - 1];
  const pkgPrice = activePkg?.price ?? template.priceNgn;

  const displayedPrice = couponResult?.valid && couponResult.discountNgn
    ? pkgPrice - couponResult.discountNgn
    : pkgPrice;

  return (
    <div
      className={`${styles.page}${storTheme.dark ? ` ${styles.pageDark}` : ""}`}
      style={{ ...storTheme.vars, "--st-font-heading": storFont.heading, "--st-font-body": storFont.body } as React.CSSProperties}
    >
      {/* Lightbox */}
      {lightboxOpen && allImages.length > 0 && (
        <div className={styles.lightbox} onClick={() => setLightboxOpen(false)}>
          <button type="button" className={styles.lightboxClose} onClick={() => setLightboxOpen(false)} aria-label="Close">✕</button>
          <div className={styles.lightboxImgWrap} onClick={e => e.stopPropagation()}>
            {allImages[galleryIdx]?.url
              ? <ImagePreview src={allImages[galleryIdx].url!} alt={template.title} className={styles.lightboxImg} />
              : <div className={styles.lightboxPlaceholder}>No image</div>
            }
            {allImages.length > 1 && (
              <>
                {galleryIdx > 0 && (
                  <button type="button" className={`${styles.lightboxArrow} ${styles.lightboxArrowLeft}`}
                    onClick={() => setGalleryIdx(i => i - 1)}>&#8249;</button>
                )}
                {galleryIdx < allImages.length - 1 && (
                  <button type="button" className={`${styles.lightboxArrow} ${styles.lightboxArrowRight}`}
                    onClick={() => setGalleryIdx(i => i + 1)}>&#8250;</button>
                )}
                <span className={styles.lightboxCounter}>{galleryIdx + 1} / {allImages.length}</span>
              </>
            )}
          </div>
        </div>
      )}

      <header className={styles.nav}>
        <Link href="/marketplace" className={styles.backLink}>← Marketplace</Link>
        <Link href="/" className={styles.navBrand}>Alux Art</Link>
        <div className={styles.navRight}>
          <button className={styles.currencyToggle} onClick={toggleCurrency} type="button">
            {currency === "NGN" ? "₦ NGN" : "$ USD"}
          </button>
          {isLoggedIn === false
            ? <Link href={`/login?next=/marketplace/${id}`} className={styles.backLink}>Sign in →</Link>
            : isCreator
              ? <Link href="/creator-dashboard" className={styles.backLink}>Creator Dashboard →</Link>
              : <Link href="/become-creator" className={styles.backLink}>Become a Creator</Link>
          }
        </div>
      </header>

      <div className={styles.layout}>
        {/* Gallery / Scene Timeline */}
        <div className={styles.galleryCol}>
          {template.isStory ? (
            /* ---- Scene Timeline (story templates) ---- */
            <div>
              <div className={styles.sceneTimeline}>
                {(template.scenes && template.scenes.length > 0 ? template.scenes : allImages.map((_, i) => ({ slot: i + 1, title: `Scene ${i + 1}`, description: "", environment: "", wardrobe: "", coCharacter: "" }))).map((scene, i) => {
                  const isActive = (i + 1) <= selectedPkg;
                  const isLocked = !isActive;
                  const coverImg = allImages[i];
                  return (
                    <div
                      key={scene.slot}
                      className={`${styles.sceneCard} ${isActive ? styles.sceneCardActive : styles.sceneCardLocked}`}
                      onClick={() => { if (isActive && coverImg?.url) { setGalleryIdx(i); setLightboxOpen(true); } }}
                      title={isLocked ? "Included in larger packages" : scene.title || `Scene ${i + 1}`}
                    >
                      {coverImg?.url
                        ? <ImagePreview src={coverImg.url} alt={scene.title || `Scene ${i + 1}`} className={styles.sceneThumb} preferredWidth={110} />
                        : <div className={styles.sceneThumbPlaceholder} />
                      }
                      {isLocked && <div className={styles.sceneLockOverlay}>&#128274;</div>}
                      <div className={styles.sceneInfo}>
                        <span className={styles.sceneIndex}>Scene {i + 1}</span>
                        {scene.title && <span className={styles.sceneLabel}>{scene.title}</span>}
                        {scene.description && isActive && <span className={styles.sceneDesc}>{scene.description}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* ---- Regular Gallery (non-story templates) ---- */
            <div className={styles.mainImgWrap}
              onTouchStart={e => setTouchStartX(e.touches[0].clientX)}
              onTouchEnd={e => {
                if (touchStartX === null) return;
                const delta = touchStartX - e.changedTouches[0].clientX;
                if (delta > 50) setGalleryIdx(i => Math.min(allImages.length - 1, i + 1));
                else if (delta < -50) setGalleryIdx(i => Math.max(0, i - 1));
                setTouchStartX(null);
              }}
            >
              <div
                className={`${styles.mainImg} ${styles.mainImgClickable}`}
                onClick={() => setLightboxOpen(true)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === "Enter" && setLightboxOpen(true)}
                aria-label="Expand image"
              >
                {allImages[galleryIdx]?.url
                  ? <ImagePreview src={allImages[galleryIdx].url!} alt={template.title} className={styles.mainImgEl} />
                  : <div className={styles.imgPlaceholder}>No image</div>
                }
                <div className={styles.expandHint}>Tap to expand</div>
              </div>
              {allImages.length > 1 && (
                <>
                  {galleryIdx > 0 && (
                    <button type="button" className={`${styles.galleryArrow} ${styles.galleryArrowLeft}`}
                      onClick={() => setGalleryIdx(i => i - 1)} aria-label="Previous image">&#8249;</button>
                  )}
                  {galleryIdx < allImages.length - 1 && (
                    <button type="button" className={`${styles.galleryArrow} ${styles.galleryArrowRight}`}
                      onClick={() => setGalleryIdx(i => i + 1)} aria-label="Next image">&#8250;</button>
                  )}
                  <span className={styles.galleryCounter}>{galleryIdx + 1} / {allImages.length}</span>
                </>
              )}
            </div>
          )}
          {!template.isStory && allImages.length > 1 && (
            <div className={styles.thumbTrack}>
              {allImages.map((img, i) => (
                <button
                  key={img.id}
                  type="button"
                  className={`${styles.thumb} ${i === galleryIdx ? styles.thumbActive : ""}`}
                  onClick={() => setGalleryIdx(i)}
                >
                  {img.url
                    ? <ImagePreview src={img.url} alt="" className={styles.thumbImg} preferredWidth={160} />
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
          <div className={styles.categoryRow}>
            <span className={styles.categoryPill}>{template.category}</span>
            <button type="button" className={styles.shareBtn} onClick={share}>{shareLabel}</button>
            <button type="button" className={styles.shareBtn} onClick={() => setShowQR(true)}>QR Code</button>
            <button type="button" className={styles.shareBtn} onClick={() => {
              if (!isLoggedIn) { window.location.href = `/login?next=/marketplace/${id}`; return; }
              setGiftName(userName);
              setGiftMessage("");
              setGiftError("");
              setShowGift(true);
            }}>Gift a Friend</button>
          </div>
          <h1 className={styles.title}>{template.title}</h1>

          {/* Story type chip row */}
          {template.isStory && (
            <div className={styles.storyTypeRow}>
              <span className={styles.storyTypeChip}>📖</span>
              <span className={styles.storyTypeChip}>
                {template.storyType === "solo" ? "Solo Story"
                  : template.storyType === "duo" ? "Duo Story"
                  : template.storyType === "group" ? "Group Story"
                  : template.storyType === "brand" ? "Brand Story"
                  : template.storyType === "group_brand" ? "Group + Brand"
                  : "Story"}
              </span>
              <span className={styles.storyTypeChip}>{(template.scenes && template.scenes.length > 0 ? template.scenes.length : template.packageSize)} scenes</span>
            </div>
          )}

          <StarWidget
            avg={avgRating}
            count={ratingCount}
            userRating={userRating}
            onRate={submitRating}
          />

          {template.creator && (
            <Link href={`/creators/${template.creator.id}`} className={styles.creatorCard}>
              {template.creator.avatarUrl
                ? <ImagePreview src={template.creator.avatarUrl} alt={template.creator.displayName} className={styles.creatorAvatar} preferredWidth={80} />
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
            <p className={styles.description}>{renderMarkdown(template.description)}</p>
          )}

          <div className={styles.purchaseBox}>
            {pkgOptions.length > 0 && (
              <div className={styles.pkgRow}>
                <span className={styles.pkgLabel}>{template.isStory ? "Scenes" : "Images"}</span>
                <div className={styles.pkgPills}>
                  {pkgOptions.map(o => (
                    <button
                      key={o.n}
                      type="button"
                      className={`${styles.pkgPill} ${selectedPkg === o.n ? styles.pkgPillActive : ""}`}
                      onClick={() => setSelectedPkg(o.n)}
                    >
                      {template.isStory
                        ? `${o.n} ${o.n === 1 ? "scene" : "scenes"}`
                        : `${o.n} ${o.n === 1 ? "image" : "images"}`}
                      <span className={styles.pkgPillPrice}>{formatPrice(o.price)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

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
                  ? `${couponResult.discountDescription} — save ${formatPrice(couponResult.discountNgn ?? 0)}`
                  : couponResult.message}
              </p>
            )}

            <div className={styles.priceRow}>
              {couponResult?.valid && couponResult.discountNgn ? (
                <>
                  <span className={styles.priceOriginal}>{formatPrice(pkgPrice)}</span>
                  <span className={styles.priceFinal}>{formatPrice(displayedPrice)}</span>
                </>
              ) : (
                <span className={styles.priceFinal}>{formatPrice(pkgPrice)}</span>
              )}
            </div>

            {error && <p className={styles.buyError}>{error}</p>}

            <button
              type="button"
              className={styles.buyBtn}
              onClick={purchase}
            >{template.isStory ? "Cast Yourself in This Story →" : "Book This Look"}</button>
          </div>

          <div className={styles.metaGrid}>
            <div className={styles.metaItem}><span className={styles.metaLabel}>Style</span><span className={styles.metaVal}>{template.shootMode === "advanced" ? "Full customisation" : "Standard"}</span></div>
            <div className={styles.metaItem}><span className={styles.metaLabel}>Ratio</span><span className={styles.metaVal}>{template.aspectRatio}</span></div>
            {template.purchaseCount > 0 && (
              <div className={styles.metaItem}><span className={styles.metaLabel}>Sales</span><span className={styles.metaVal}>{template.purchaseCount}</span></div>
            )}
          </div>

          {template.tags.length > 0 && (
            <div className={styles.tags}>
              {template.tags.map(t => <span key={t} className={styles.tag}>{t}</span>)}
            </div>
          )}
        </div>
      </div>

      {showQR && (
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.8)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 100, overflowY: "auto",
        }} onClick={() => setShowQR(false)}>
          <div onClick={e => e.stopPropagation()}>
            <TemplateShareCard
              templateUrl={`https://aluxartandframes.shop/marketplace/${template.id}`}
              creatorUsername={template.creator?.displayName ?? "AluxArt"}
              coverUrl={template.coverUrl}
              onClose={() => setShowQR(false)}
            />
          </div>
        </div>
      )}

      {showGift && (
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.88)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 100, padding: "16px", overflowY: "auto",
        }} onClick={() => !giftBuying && setShowGift(false)}>
          <div style={{
            background: "linear-gradient(160deg, #0f0c2e 0%, #080618 100%)",
            border: "1px solid rgba(109,40,217,0.3)",
            borderRadius: "20px",
            padding: "36px 28px",
            maxWidth: 440,
            width: "100%",
            fontFamily: "system-ui, sans-serif",
            boxShadow: "0 30px 80px rgba(55,48,163,0.4)",
          }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "24px" }}>
              <div>
                <p style={{ margin: "0 0 4px", fontSize: "0.7rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(196,181,253,0.5)" }}>
                  Gift this style
                </p>
                <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "#f5f3ff" }}>
                  Gift a Friend
                </h2>
              </div>
              <button type="button" onClick={() => setShowGift(false)} style={{
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px", color: "rgba(255,255,255,0.5)", cursor: "pointer",
                width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "1.1rem", padding: 0, flexShrink: 0,
              }} aria-label="Close">✕</button>
            </div>

            {/* Session summary — synced with main page selection */}
            <div style={{
              background: "rgba(109,40,217,0.1)", border: "1px solid rgba(109,40,217,0.2)",
              borderRadius: "10px", padding: "12px 16px", marginBottom: "24px",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div>
                <p style={{ margin: 0, color: "#f5f3ff", fontSize: "0.88rem", fontWeight: 600 }}>{template.title}</p>
                <p style={{ margin: "3px 0 0", color: "rgba(255,255,255,0.4)", fontSize: "0.75rem" }}>
                  {activePkg?.n ?? selectedPkg} {(activePkg?.n ?? selectedPkg) === 1 ? "image" : "images"} · {template.category}
                </p>
              </div>
              <span style={{ color: "#c4b5fd", fontSize: "1.1rem", fontWeight: 700 }}>
                {formatPrice(pkgPrice)}
              </span>
            </div>

            {/* Sender name */}
            <label style={{ display: "block", marginBottom: "16px" }}>
              <span style={{ display: "block", marginBottom: "6px", fontSize: "0.78rem", color: "rgba(255,255,255,0.5)", letterSpacing: "0.04em" }}>
                YOUR NAME (required)
              </span>
              <input
                type="text"
                value={giftName}
                onChange={e => setGiftName(e.target.value.slice(0, 80))}
                placeholder="Your name"
                style={{
                  width: "100%", boxSizing: "border-box",
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "10px", padding: "10px 14px",
                  color: "#f5f3ff", fontSize: "0.9rem", outline: "none",
                  fontFamily: "system-ui, sans-serif",
                }}
              />
            </label>

            {/* Custom message */}
            <label style={{ display: "block", marginBottom: "20px" }}>
              <span style={{ display: "block", marginBottom: "6px", fontSize: "0.78rem", color: "rgba(255,255,255,0.5)", letterSpacing: "0.04em" }}>
                PERSONAL MESSAGE (optional)
              </span>
              <textarea
                value={giftMessage}
                onChange={e => setGiftMessage(e.target.value.slice(0, 300))}
                placeholder="Write something special for your friend..."
                rows={3}
                style={{
                  width: "100%", boxSizing: "border-box", resize: "none",
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "10px", padding: "10px 14px",
                  color: "#f5f3ff", fontSize: "0.88rem", outline: "none",
                  fontFamily: "system-ui, sans-serif", lineHeight: 1.5,
                }}
              />
              <span style={{ display: "block", textAlign: "right", fontSize: "0.7rem", color: "rgba(255,255,255,0.25)", marginTop: "3px" }}>
                {giftMessage.length}/300
              </span>
            </label>

            {giftError && (
              <p style={{ margin: "0 0 14px", color: "#f87171", fontSize: "0.83rem" }}>{giftError}</p>
            )}

            <button
              type="button"
              disabled={giftBuying || !giftName.trim()}
              onClick={async () => {
                if (!giftName.trim()) { setGiftError("Please enter your name."); return; }
                setGiftBuying(true);
                setGiftError("");
                try {
                  const res = await fetch("/api/gift/create", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      templateId: id,
                      senderName: giftName.trim(),
                      customMessage: giftMessage.trim() || null,
                      packageSize: activePkg?.n ?? selectedPkg,
                      currency,
                    }),
                  });
                  const data = await res.json();
                  if (!res.ok) { setGiftError(data.error ?? "Failed to create gift. Please try again."); setGiftBuying(false); return; }
                  if (data.authorizationUrl) { window.location.href = data.authorizationUrl; return; }
                  setGiftError("Unexpected response. Please try again.");
                  setGiftBuying(false);
                } catch {
                  setGiftError("Network error. Please try again.");
                  setGiftBuying(false);
                }
              }}
              style={{
                width: "100%",
                background: giftBuying || !giftName.trim()
                  ? "rgba(109,40,217,0.35)"
                  : "linear-gradient(135deg, #3730a3, #6d28d9)",
                color: "#fff", border: "none", borderRadius: "12px",
                padding: "14px 20px", fontSize: "0.95rem", fontWeight: 700,
                cursor: giftBuying || !giftName.trim() ? "default" : "pointer",
                fontFamily: "system-ui, sans-serif",
                boxShadow: giftBuying || !giftName.trim() ? "none" : "0 6px 24px rgba(109,40,217,0.4)",
                transition: "opacity 0.2s",
              }}
            >
              {giftBuying ? "Redirecting to payment..." : `Pay ${formatPrice(pkgPrice)} — Send Gift`}
            </button>

            <p style={{ margin: "12px 0 0", textAlign: "center", fontSize: "0.73rem", color: "rgba(255,255,255,0.25)", lineHeight: 1.5 }}>
              Your friend will receive a private link valid for 30 days. They&apos;ll upload their photos when they claim it.
            </p>
          </div>
        </div>
      )}

      {checkoutOpen && (
        <CheckoutPanel
          templateId={id}
          template={template}
          initialPkg={selectedPkg}
          pkgOptions={pkgOptions}
          currency={currency}
          formatPrice={formatPrice}
          couponCode={couponCode}
          couponResult={couponResult}
          onClose={() => setCheckoutOpen(false)}
        />
      )}
    </div>
  );
}
