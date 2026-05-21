"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCurrency, type Currency } from "@/lib/useCurrency";
import styles from "./book.module.css";

interface TemplateImage {
  id: string;
  url: string | null;
  purpose: string;
  tag?: string;
  storagePath: string;
  storageBucket: string;
  displayOrder: number;
}

interface TemplateDetail {
  id: string;
  title: string;
  priceNgn: number;
  price1Ngn?: number | null;
  price5Ngn?: number | null;
  shootMode: string;
  aspectRatio: string;
  packageSize: number;
  images: TemplateImage[];
  creator: { id: string; displayName: string } | null;
}

interface SavedIdentityRef {
  id: string;
  name: string;
  storagePath: string;
  storageBucket: string;
  url: string;
}

interface NewIdentityUpload {
  localId: string;
  file: File;
  preview: string;
  storagePath: string;
  storageBucket: string;
  uploading: boolean;
  error?: string;
}

interface TaggedRefState {
  id: string;
  tag: string;
  storagePath: string;
  storageBucket: string;
  url: string;
  isReplaced: boolean;
}

interface CouponResult {
  valid: boolean;
  discountNgn?: number;
  discountDescription?: string;
  message?: string;
}

export default function BookPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { usdToNgn } = useCurrency();
  const currency: Currency = searchParams.get("currency") === "USD" ? "USD" : "NGN";
  const formatPrice = (ngn: number) => currency === "NGN"
    ? `₦${Math.round(ngn).toLocaleString()}`
    : `$${(ngn / usdToNgn).toFixed(2)}`;
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const [savedRefs, setSavedRefs] = useState<SavedIdentityRef[]>([]);
  const [selectedSaved, setSelectedSaved] = useState<Set<string>>(new Set());
  const [newUploads, setNewUploads] = useState<NewIdentityUpload[]>([]);

  const [taggedRefs, setTaggedRefs] = useState<TaggedRefState[]>([]);
  const [replacingTag, setReplacingTag] = useState<string | null>(null);
  const [addingRef, setAddingRef] = useState(false);
  const [addRefTag, setAddRefTag] = useState("OUTFIT");
  const addRefInputRef = useRef<HTMLInputElement>(null);

  const [couponCode, setCouponCode] = useState("");
  const [couponResult, setCouponResult] = useState<CouponResult | null>(null);
  const [validating, setValidating] = useState(false);

  const [selectedPkg, setSelectedPkg] = useState<1 | 5 | 10>(() => {
    const p = Number(searchParams.get("pkg"));
    return ([1, 5, 10].includes(p) ? p : 10) as 1 | 5 | 10;
  });
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState("");

  const identityInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceFileRef = useRef<File | null>(null);

  // Load template detail + saved identity refs on mount
  useEffect(() => {
    Promise.all([
      fetch(`/api/marketplace/${id}`).then(r => r.json()),
      fetch("/api/user/identity-refs").then(r => r.ok ? r.json() : { refs: [] }),
    ]).then(([templateData, idData]) => {
      if (templateData.template) {
        const t: TemplateDetail = templateData.template;
        setTemplate(t);
        // Initialize tagged refs from template images
        const tagged = (t.images ?? []).filter(img => img.purpose === "tagged" && img.tag);
        setTaggedRefs(tagged.map(img => ({
          id: img.id,
          tag: img.tag!,
          storagePath: img.storagePath,
          storageBucket: img.storageBucket,
          url: img.url ?? "",
          isReplaced: false,
        })));
      }
      if (idData.refs) setSavedRefs(idData.refs);
    }).finally(() => setLoading(false));
  }, [id]);

  // Auto-apply coupon code passed as URL query param once template is loaded
  useEffect(() => {
    const c = searchParams.get("coupon");
    if (!c || !template) return;
    const code = c.trim().toUpperCase();
    setCouponCode(code);
    fetch("/api/coupons/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, templateId: id }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setCouponResult(d); });
  }, [template, id, searchParams]);

  // ── Identity uploads ────────────────────────────────────────────────────────

  const uploadIdentityFile = async (file: File, localId: string) => {
    setNewUploads(prev => prev.map(u => u.localId === localId ? { ...u, uploading: true } : u));
    const res = await fetch("/api/upload/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size, bucket: "identity-images" }),
    });
    if (!res.ok) {
      setNewUploads(prev => prev.map(u => u.localId === localId ? { ...u, uploading: false, error: "Upload failed" } : u));
      return;
    }
    const { uploadUrl, storagePath, storageBucket } = await res.json();
    const put = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
    if (!put.ok) {
      setNewUploads(prev => prev.map(u => u.localId === localId ? { ...u, uploading: false, error: "Upload failed" } : u));
      return;
    }
    setNewUploads(prev => prev.map(u => u.localId === localId ? { ...u, uploading: false, storagePath, storageBucket } : u));
  };

  const addIdentityFiles = (files: FileList) => {
    if (!template) return;
    const toAdd = Array.from(files).slice(0, 10 - newUploads.length);
    const items: NewIdentityUpload[] = toAdd.map(file => ({
      localId: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
      storagePath: "",
      storageBucket: "identity-images",
      uploading: false,
    }));
    setNewUploads(prev => [...prev, ...items]);
    items.forEach(u => uploadIdentityFile(u.file, u.localId));
  };

  // ── Tagged ref replace ──────────────────────────────────────────────────────

  const startReplace = (tagId: string) => {
    setReplacingTag(tagId);
    replaceInputRef.current?.click();
  };

  const handleReplaceFile = async (file: File) => {
    if (!replacingTag) return;
    const localPreview = URL.createObjectURL(file);
    const res = await fetch("/api/upload/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size, bucket: "identity-images" }),
    });
    if (!res.ok) { setReplacingTag(null); return; }
    const { uploadUrl, storagePath, storageBucket } = await res.json();
    await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
    setTaggedRefs(prev => prev.map(r => r.id === replacingTag
      ? { ...r, storagePath, storageBucket, url: localPreview, isReplaced: true }
      : r
    ));
    setReplacingTag(null);
  };

  // ── Add custom reference ────────────────────────────────────────────────────

  const handleAddRefFile = async (file: File) => {
    const res = await fetch("/api/upload/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size, bucket: "identity-images" }),
    });
    if (!res.ok) { setAddingRef(false); return; }
    const { uploadUrl, storagePath, storageBucket } = await res.json();
    await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
    setTaggedRefs(prev => [...prev, {
      id: crypto.randomUUID(),
      tag: addRefTag,
      storagePath,
      storageBucket,
      url: URL.createObjectURL(file),
      isReplaced: true,
    }]);
    setAddingRef(false);
  };

  // ── Coupon ──────────────────────────────────────────────────────────────────

  const validateCoupon = async () => {
    if (!couponCode.trim()) return;
    setValidating(true);
    setCouponResult(null);
    const res = await fetch("/api/coupons/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: couponCode, templateId: id }),
    });
    if (res.status === 401) { router.push(`/login?next=/marketplace/${id}/book?pkg=${selectedPkg}`); return; }
    const data = await res.json();
    setCouponResult(data);
    setValidating(false);
  };

  // ── Pay ─────────────────────────────────────────────────────────────────────

  const allIdentityRefs = [
    ...Array.from(selectedSaved).map(sid => {
      const ref = savedRefs.find(r => r.id === sid)!;
      return { name: ref.name, storageBucket: ref.storageBucket, storagePath: ref.storagePath };
    }),
    ...newUploads.filter(u => u.storagePath).map(u => ({
      name: u.file.name, type: u.file.type, size: u.file.size,
      storageBucket: u.storageBucket, storagePath: u.storagePath,
    })),
  ];

  const canPay = allIdentityRefs.length > 0 && !newUploads.some(u => u.uploading) && !newUploads.some(u => u.error) && !buying;

  const book = async () => {
    if (!canPay) return;
    setBuying(true);
    setError("");
    const res = await fetch(`/api/marketplace/${id}/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identityRefs: allIdentityRefs,
        taggedRefs: taggedRefs.map(r => ({ tag: r.tag, storagePath: r.storagePath, storageBucket: r.storageBucket })),
        couponCode: couponResult?.valid ? couponCode : undefined,
        packageSize: selectedPkg,
        currency,
      }),
    });
    if (res.status === 401) { router.push(`/login?next=/marketplace/${id}/book?pkg=${selectedPkg}`); return; }
    const data = await res.json();
    if (data.authorizationUrl) {
      window.location.href = data.authorizationUrl;
    } else {
      setError(data.error ?? "Payment initialization failed. Please try again.");
      setBuying(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingPage}>
        <Link href={`/marketplace/${id}`} className={styles.back}>← Back</Link>
        <div className={styles.loadingText}>Loading...</div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className={styles.loadingPage}>
        <Link href="/marketplace" className={styles.back}>← Marketplace</Link>
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
    <div className={styles.page}>
      <header className={styles.nav}>
        <Link href={`/marketplace/${id}`} className={styles.back}>← {template.title}</Link>
        <Link href="/" className={styles.brand}>Alux Art</Link>
      </header>

      {/* Template info bar */}
      <div className={styles.infoBar}>
        <div className={styles.infoBarMeta}>
          {template.creator && <span className={styles.creatorName}>{template.creator.displayName}</span>}
          <span className={styles.templateTitle}>{template.title}</span>
          <span className={styles.templateMeta}>{template.shootMode} · {template.aspectRatio} · {template.packageSize} images</span>
        </div>
        <span className={styles.price}>{formatPrice(pkgPrice)}</span>
      </div>

      <div className={styles.layout}>
        {/* Identity section */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Your identity photos</h2>
          <p className={styles.sectionHint}>Select saved photos or upload new ones. At least 1 required.</p>

          {savedRefs.length > 0 && (
            <div className={styles.savedGrid}>
              {savedRefs.map(ref => (
                <button
                  key={ref.id}
                  type="button"
                  className={`${styles.savedThumb} ${selectedSaved.has(ref.id) ? styles.savedThumbSelected : ""}`}
                  onClick={() => setSelectedSaved(prev => {
                    const next = new Set(prev);
                    if (next.has(ref.id)) next.delete(ref.id); else next.add(ref.id);
                    return next;
                  })}
                >
                  <img src={ref.url} alt={ref.name} className={styles.savedImg} />
                  {selectedSaved.has(ref.id) && <div className={styles.selectedTick}>✓</div>}
                </button>
              ))}
            </div>
          )}

          <div className={styles.uploadRow}>
            <button type="button" className={styles.uploadBtn} onClick={() => identityInputRef.current?.click()}>
              + Upload new
            </button>
            <input
              type="file"
              accept="image/*"
              multiple
              ref={identityInputRef}
              className={styles.hidden}
              onChange={e => { if (e.target.files) addIdentityFiles(e.target.files); e.target.value = ""; }}
            />
          </div>

          {newUploads.length > 0 && (
            <div className={styles.uploadGrid}>
              {newUploads.map(u => (
                <div key={u.localId} className={styles.uploadItem}>
                  <img src={u.preview} alt="" className={styles.uploadImg} />
                  {u.uploading && <div className={styles.uploadOverlay}>Uploading...</div>}
                  {u.error && <div className={styles.uploadError}>{u.error}</div>}
                  <button type="button" className={styles.removeBtn} onClick={() => setNewUploads(prev => prev.filter(x => x.localId !== u.localId))}>✕</button>
                </div>
              ))}
            </div>
          )}

          {allIdentityRefs.length === 0 && (
            <p className={styles.identityWarn}>Select or upload at least 1 identity photo to continue.</p>
          )}
        </section>

        {/* Tagged refs section */}
        {(taggedRefs.length > 0 || addingRef) && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Reference images</h2>
            <p className={styles.sectionHint}>
              Creator&apos;s references are kept private until your shoot generates. Replace any with your own image, or add new ones.
            </p>

            <div className={styles.refGrid}>
              {taggedRefs.map(ref => (
                <div key={ref.id} className={`${styles.refCard} ${ref.isReplaced ? styles.refCardReplaced : ""}`}>
                  {ref.isReplaced && ref.url
                    ? <img src={ref.url} alt={ref.tag} className={styles.refImg} />
                    : (
                      <div className={styles.refPrivate}>
                        <span className={styles.refPrivateLock}>🔒</span>
                        <span className={styles.refPrivateLabel}>Private ref</span>
                      </div>
                    )
                  }
                  <div className={styles.refMeta}>
                    <span className={styles.refTag}>{ref.tag}</span>
                    {ref.isReplaced && <span className={styles.yourImage}>Your image</span>}
                  </div>
                  <div className={styles.refActions}>
                    <button type="button" className={styles.refBtn} onClick={() => startReplace(ref.id)}>
                      Replace
                    </button>
                    <button type="button" className={`${styles.refBtn} ${styles.refBtnRemove}`} onClick={() => setTaggedRefs(prev => prev.filter(r => r.id !== ref.id))}>
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add custom reference */}
            <div className={styles.addRefRow}>
              {!addingRef && (
                <button type="button" className={styles.addRefBtn} onClick={() => setAddingRef(true)}>
                  + Add your own reference
                </button>
              )}
              {addingRef && (
                <div className={styles.addRefForm}>
                  <select className={styles.addRefSelect} value={addRefTag} onChange={e => setAddRefTag(e.target.value)}>
                    {["OUTFIT", "HAIRSTYLE", "MAKEUP", "NAIL_DESIGN", "ACCESSORY", "BACKGROUND", "LIGHTING", "COLOR_GRADE"].map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={styles.addRefUploadBtn}
                    onClick={() => addRefInputRef.current?.click()}
                  >
                    Upload image
                  </button>
                  <button type="button" className={styles.addRefCancelBtn} onClick={() => setAddingRef(false)}>Cancel</button>
                  <input
                    type="file"
                    accept="image/*"
                    ref={addRefInputRef}
                    className={styles.hidden}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) handleAddRefFile(file);
                      e.target.value = "";
                    }}
                  />
                </div>
              )}
            </div>

            <input
              type="file"
              accept="image/*"
              ref={replaceInputRef}
              className={styles.hidden}
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) { replaceFileRef.current = file; handleReplaceFile(file); }
                e.target.value = "";
              }}
            />
          </section>
        )}

        {/* Allow adding refs even when template has none */}
        {taggedRefs.length === 0 && !addingRef && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Reference images</h2>
            <p className={styles.sectionHint}>Optionally add your own reference images to guide the shoot.</p>
            <div className={styles.addRefRow}>
              <button type="button" className={styles.addRefBtn} onClick={() => setAddingRef(true)}>
                + Add your own reference
              </button>
            </div>
          </section>
        )}
      </div>

      {/* Payment footer */}
      <div className={styles.payFooter}>
        {pkgOptions.length > 1 && (
          <div className={styles.pkgRow}>
            {pkgOptions.map(o => (
              <button
                key={o.n}
                type="button"
                className={`${styles.pkgPill} ${selectedPkg === o.n ? styles.pkgPillActive : ""}`}
                onClick={() => setSelectedPkg(o.n)}
              >
                {o.n} {o.n === 1 ? "image" : "images"} — {formatPrice(o.price)}
              </button>
            ))}
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

        {error && <p className={styles.bookError}>{error}</p>}

        <div className={styles.footerBottom}>
          <div className={styles.priceBlock}>
            {couponResult?.valid && couponResult.discountNgn ? (
              <>
                <span className={styles.priceOld}>{formatPrice(pkgPrice)}</span>
                <span className={styles.priceFinal}>{formatPrice(displayedPrice)}</span>
              </>
            ) : (
              <span className={styles.priceFinal}>{formatPrice(pkgPrice)}</span>
            )}
          </div>
          <button type="button" className={styles.payBtn} onClick={book} disabled={!canPay}>
            {buying ? "Redirecting to payment..." : "Pay & Generate"}
          </button>
        </div>
      </div>
    </div>
  );
}
