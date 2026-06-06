"use client";

import { useState, useEffect, useRef } from "react";
import { resizeIfNeeded } from "@/lib/resize-image";
import styles from "./checkout-panel.module.css";
import ImagePreview from "@/components/ImagePreview";

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
}

interface TemplateDetail {
  id: string;
  title: string;
  priceNgn: number;
  price1Ngn?: number | null;
  price5Ngn?: number | null;
  shootMode: string;
  aspectRatio: string;
  images: TemplateImage[];
}

interface CouponResult {
  valid: boolean;
  discountNgn?: number;
  discountDescription?: string;
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
  customName: string;
  storagePath: string;
  storageBucket: string;
  url: string;
  isReplaced: boolean;
  note: string;
  noteHidden: boolean;
}

interface PoseUpload {
  localId: string;
  file: File;
  preview: string;
  storagePath: string;
  storageBucket: string;
  uploading: boolean;
  error?: string;
}

interface Props {
  templateId: string;
  template: TemplateDetail;
  initialPkg: 1 | 5 | 10;
  pkgOptions: Array<{ n: 1 | 5 | 10; price: number }>;
  currency: "NGN" | "USD";
  formatPrice: (ngn: number) => string;
  couponCode: string;
  couponResult: CouponResult | null;
  onClose: () => void;
}

export default function CheckoutPanel({
  templateId,
  template,
  initialPkg,
  pkgOptions,
  currency,
  formatPrice,
  couponCode,
  couponResult,
  onClose,
}: Props) {
  const [selectedPkg, setSelectedPkg] = useState<1 | 5 | 10>(initialPkg);
  const [shotType, setShotType] = useState<"headshot" | "close_up" | "medium" | "full_body">("close_up");

  const [savedRefs, setSavedRefs] = useState<SavedIdentityRef[]>([]);
  const [selectedSaved, setSelectedSaved] = useState<Set<string>>(new Set());
  const [newUploads, setNewUploads] = useState<NewIdentityUpload[]>([]);
  const [clearing, setClearing] = useState(false);

  const [poseUploads, setPoseUploads] = useState<PoseUpload[]>([]);
  const [taggedRefs, setTaggedRefs] = useState<TaggedRefState[]>([]);
  const [replacingTag, setReplacingTag] = useState<string | null>(null);
  const [addingRef, setAddingRef] = useState(false);
  const [addRefTag, setAddRefTag] = useState("OUTFIT");
  const [addRefNote, setAddRefNote] = useState("");

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState("");

  const identityInputRef = useRef<HTMLInputElement>(null);
  const poseInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const addRefInputRef = useRef<HTMLInputElement>(null);

  // Lock body scroll while panel is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Load saved identity refs + init tagged refs from template
  useEffect(() => {
    fetch("/api/user/identity-refs")
      .then(r => r.ok ? r.json() : { refs: [] })
      .then(d => {
        if (d.refs?.length) {
          setSavedRefs(d.refs);
          setSelectedSaved(new Set((d.refs as SavedIdentityRef[]).map(r => r.id)));
        }
      });

    const tagged = (template.images ?? []).filter(img => img.purpose === "tagged" && img.tag);
    setTaggedRefs(tagged.map(img => ({
      id: img.id,
      tag: img.tag!,
      customName: img.customName || img.tag!,
      storagePath: img.storagePath,
      storageBucket: img.storageBucket,
      url: img.url ?? "",
      isReplaced: false,
      note: img.noteHidden ? "" : (img.note ?? ""),
      noteHidden: img.noteHidden ?? false,
    })));
  }, [template]);

  // ── Identity uploads ──────────────────────────────────────────────────────

  const uploadIdentityFile = async (file: File, localId: string) => {
    setNewUploads(prev => prev.map(u => u.localId === localId ? { ...u, uploading: true } : u));
    const f = await resizeIfNeeded(file);
    const form = new FormData();
    form.append("file", f, f.name);
    form.append("bucket", "identity-images");
    const res = await fetch("/api/upload/file", { method: "POST", body: form });
    if (!res.ok) {
      setNewUploads(prev => prev.map(u => u.localId === localId ? { ...u, uploading: false, error: "Upload failed" } : u));
      return;
    }
    const { storagePath } = await res.json();
    setNewUploads(prev => prev.map(u => u.localId === localId ? { ...u, uploading: false, storagePath, storageBucket: "identity-images" } : u));
  };

  const addIdentityFiles = (files: FileList) => {
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

  const clearIdentityImages = async () => {
    if (!confirm("Delete all your saved identity images? This cannot be undone.")) return;
    setClearing(true);
    await fetch("/api/user/identity-refs", { method: "DELETE" });
    setSavedRefs([]);
    setSelectedSaved(new Set());
    setClearing(false);
  };

  // ── Pose uploads ──────────────────────────────────────────────────────────

  const uploadPoseFile = async (file: File, localId: string) => {
    setPoseUploads(prev => prev.map(u => u.localId === localId ? { ...u, uploading: true } : u));
    const f = await resizeIfNeeded(file);
    const form = new FormData();
    form.append("file", f, f.name);
    form.append("bucket", "identity-images");
    const res = await fetch("/api/upload/file", { method: "POST", body: form });
    if (!res.ok) {
      setPoseUploads(prev => prev.map(u => u.localId === localId ? { ...u, uploading: false, error: "Upload failed" } : u));
      return;
    }
    const { storagePath } = await res.json();
    setPoseUploads(prev => prev.map(u => u.localId === localId ? { ...u, uploading: false, storagePath, storageBucket: "identity-images" } : u));
  };

  const addPoseFiles = (files: FileList) => {
    const toAdd = Array.from(files).slice(0, 10 - poseUploads.length);
    const items: PoseUpload[] = toAdd.map(file => ({
      localId: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
      storagePath: "",
      storageBucket: "identity-images",
      uploading: false,
    }));
    setPoseUploads(prev => [...prev, ...items]);
    items.forEach(u => uploadPoseFile(u.file, u.localId));
  };

  // ── Tagged ref replace ────────────────────────────────────────────────────

  const startReplace = (tagId: string) => {
    setReplacingTag(tagId);
    replaceInputRef.current?.click();
  };

  const handleReplaceFile = async (file: File) => {
    if (!replacingTag) return;
    const localPreview = URL.createObjectURL(file);
    const f = await resizeIfNeeded(file);
    const form = new FormData();
    form.append("file", f, f.name);
    form.append("bucket", "identity-images");
    const res = await fetch("/api/upload/file", { method: "POST", body: form });
    if (!res.ok) { setReplacingTag(null); return; }
    const { storagePath } = await res.json();
    setTaggedRefs(prev => prev.map(r => r.id === replacingTag
      ? { ...r, storagePath, storageBucket: "identity-images", url: localPreview, isReplaced: true }
      : r
    ));
    setReplacingTag(null);
  };

  // ── Add custom reference ──────────────────────────────────────────────────

  const handleAddRefFile = async (file: File) => {
    const f = await resizeIfNeeded(file);
    const form = new FormData();
    form.append("file", f, f.name);
    form.append("bucket", "identity-images");
    const res = await fetch("/api/upload/file", { method: "POST", body: form });
    if (!res.ok) { setAddingRef(false); return; }
    const { storagePath } = await res.json();
    setTaggedRefs(prev => [...prev, {
      id: crypto.randomUUID(),
      tag: addRefTag,
      customName: addRefTag,
      storagePath,
      storageBucket: "identity-images",
      url: URL.createObjectURL(file),
      isReplaced: true,
      note: addRefNote.trim(),
      noteHidden: false,
    }]);
    setAddingRef(false);
    setAddRefNote("");
  };

  // ── Pay ───────────────────────────────────────────────────────────────────

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

  const anyUploading = newUploads.some(u => u.uploading) || poseUploads.some(u => u.uploading);
  const canPay = allIdentityRefs.length > 0 && !anyUploading && !newUploads.some(u => u.error) && !buying;

  const book = async () => {
    if (!canPay) return;
    setBuying(true);
    setError("");
    const res = await fetch(`/api/marketplace/${templateId}/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identityRefs: allIdentityRefs,
        taggedRefs: taggedRefs.map(r => ({ tag: r.tag, storagePath: r.storagePath, storageBucket: r.storageBucket, note: r.note.trim() || undefined })),
        poseRefs: poseUploads.filter(u => u.storagePath).map(u => ({
          name: u.file.name, type: u.file.type, size: u.file.size,
          storageBucket: u.storageBucket, storagePath: u.storagePath,
        })),
        shotType: selectedPkg === 1 ? shotType : undefined,
        couponCode: couponResult?.valid ? couponCode : undefined,
        packageSize: selectedPkg,
        currency,
      }),
    });

    if (res.status === 401) {
      window.location.href = `/login?next=/marketplace/${templateId}`;
      return;
    }

    const data = await res.json();
    if (data.bypass && data.callbackUrl) {
      window.location.href = data.callbackUrl;
    } else if (data.authorizationUrl) {
      window.location.href = data.authorizationUrl;
    } else {
      setError(data.error ?? "Payment initialization failed. Please try again.");
      setBuying(false);
    }
  };

  // ── Derived price ─────────────────────────────────────────────────────────

  const activePkg = pkgOptions.find(o => o.n === selectedPkg) ?? pkgOptions[pkgOptions.length - 1];
  const pkgPrice = activePkg?.price ?? 0;
  const displayedPrice = couponResult?.valid && couponResult.discountNgn
    ? pkgPrice - couponResult.discountNgn
    : pkgPrice;

  return (
    <>
      {/* Backdrop */}
      <div className={styles.overlay} onClick={onClose} />

      {/* Panel */}
      <div className={styles.panel} role="dialog" aria-modal="true" aria-label="Checkout">
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerText}>
            <p className={styles.headerTitle}>Book this look</p>
            <p className={styles.headerSub}>{template.title}</p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Scrollable body */}
        <div className={styles.body}>
          {/* Package picker */}
          {pkgOptions.length > 1 && (
            <div className={styles.pkgRow}>
              <span className={styles.pkgLabel}>Images</span>
              <div className={styles.pkgPills}>
                {pkgOptions.map(o => (
                  <button
                    key={o.n}
                    type="button"
                    className={`${styles.pkgPill} ${selectedPkg === o.n ? styles.pkgPillActive : ""}`}
                    onClick={() => setSelectedPkg(o.n)}
                  >
                    {o.n} {o.n === 1 ? "image" : "images"}
                    <span className={styles.pkgPillPrice}>{formatPrice(o.price)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Shot type (1-image package only) */}
          {selectedPkg === 1 && (
            <div className={styles.pkgRow}>
              <span className={styles.pkgLabel}>Shot type</span>
              <div className={styles.shotTypeRow}>
                {(["headshot", "close_up", "medium", "full_body"] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    className={`${styles.pkgPill} ${shotType === t ? styles.pkgPillActive : ""}`}
                    onClick={() => setShotType(t)}
                  >
                    {t === "headshot" ? "Headshot" : t === "close_up" ? "Close-up" : t === "medium" ? "Medium" : "Full body"}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={styles.divider} />

          {/* Identity photos */}
          <div>
            <p className={styles.sectionTitle}>Your identity photos</p>
            <p className={styles.sectionHint}>Select saved photos or upload new ones. At least 1 required.</p>

            {savedRefs.length > 0 && (
              <>
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
                      <ImagePreview src={ref.url} alt={ref.name} className={styles.savedImg} preferredWidth={120} />
                      {selectedSaved.has(ref.id) && <div className={styles.selectedTick}>✓</div>}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className={styles.clearBtn}
                  onClick={clearIdentityImages}
                  disabled={clearing}
                >
                  {clearing ? "Clearing..." : "Clear saved photos"}
                </button>
              </>
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
                    <ImagePreview src={u.preview} alt="" className={styles.uploadImg} preferredWidth={140} />
                    {u.uploading && <div className={styles.uploadOverlay}>Uploading...</div>}
                    {u.error && <div className={styles.uploadError}>{u.error}</div>}
                    <button type="button" className={styles.removeBtn} onClick={() => setNewUploads(prev => prev.filter(x => x.localId !== u.localId))}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {allIdentityRefs.length === 0 && (
              <p className={styles.identityWarn}>Select or upload at least 1 photo to continue.</p>
            )}
          </div>

          <div className={styles.divider} />

          {/* Advanced options toggle */}
          <button
            type="button"
            className={styles.advancedToggle}
            onClick={() => setAdvancedOpen(v => !v)}
          >
            <span className={`${styles.advancedChevron} ${advancedOpen ? styles.advancedChevronOpen : ""}`}>▼</span>
            Advanced options (pose direction, reference customisation)
          </button>

          {advancedOpen && (
            <div className={styles.advancedBody}>
              {/* Pose direction */}
              <div>
                <p className={styles.sectionTitle}>Pose direction (optional)</p>
                <p className={styles.sectionHint}>Upload pose reference images. Each can be a single pose or a collage — the AI extracts all visible poses in order.</p>
                {poseUploads.length > 0 && (
                  <div className={styles.uploadGrid}>
                    {poseUploads.map(u => (
                      <div key={u.localId} className={styles.uploadItem}>
                        <ImagePreview src={u.preview} alt="" className={styles.uploadImg} preferredWidth={140} />
                        {u.uploading && <div className={styles.uploadOverlay}>Uploading...</div>}
                        {u.error && <div className={styles.uploadError}>{u.error}</div>}
                        <button type="button" className={styles.removeBtn} onClick={() => setPoseUploads(prev => prev.filter(x => x.localId !== u.localId))}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
                {poseUploads.length < 10 && (
                  <button type="button" className={styles.uploadBtn} onClick={() => poseInputRef.current?.click()}>
                    + Add pose image
                  </button>
                )}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  ref={poseInputRef}
                  className={styles.hidden}
                  onChange={e => { if (e.target.files) addPoseFiles(e.target.files); e.target.value = ""; }}
                />
              </div>

              {/* Reference customisation */}
              <div>
                <p className={styles.sectionTitle}>Reference images</p>
                <p className={styles.sectionHint}>Add a note to any creator reference, replace it with your own image, or remove it.</p>

                {taggedRefs.length > 0 && (
                  <div className={styles.refList}>
                    {taggedRefs.map(ref => (
                      <div key={ref.id} className={`${styles.refRow} ${ref.isReplaced ? styles.refRowReplaced : ""}`}>
                        {ref.isReplaced && ref.url && (
                          <ImagePreview src={ref.url} alt={ref.tag} className={styles.refThumb} preferredWidth={80} />
                        )}
                        <span className={styles.refTag}>{ref.customName}</span>
                        {!ref.noteHidden && (
                          <input
                            type="text"
                            className={styles.refNoteInput}
                            placeholder="Styling note…"
                            value={ref.note}
                            onChange={e => setTaggedRefs(prev => prev.map(r => r.id === ref.id ? { ...r, note: e.target.value } : r))}
                          />
                        )}
                        <div className={styles.refActions}>
                          <button type="button" className={styles.refBtn} onClick={() => startReplace(ref.id)}>
                            {ref.isReplaced ? "Re-upload" : "Replace"}
                          </button>
                          <button type="button" className={`${styles.refBtn} ${styles.refBtnRemove}`} onClick={() => setTaggedRefs(prev => prev.filter(r => r.id !== ref.id))}>
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

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
                      <input
                        type="text"
                        className={styles.addRefNoteInput}
                        placeholder="Styling note (optional)…"
                        value={addRefNote}
                        onChange={e => setAddRefNote(e.target.value)}
                      />
                      <button type="button" className={styles.addRefUploadBtn} onClick={() => addRefInputRef.current?.click()}>
                        Upload image
                      </button>
                      <button type="button" className={styles.addRefCancelBtn} onClick={() => { setAddingRef(false); setAddRefNote(""); }}>
                        Cancel
                      </button>
                      <input
                        type="file"
                        accept="image/*"
                        ref={addRefInputRef}
                        className={styles.hidden}
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleAddRefFile(f); e.target.value = ""; }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sticky footer */}
        <div className={styles.footer}>
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
          {error && <p className={styles.bookError}>{error}</p>}
          <button type="button" className={styles.payBtn} onClick={book} disabled={!canPay}>
            {buying ? "Redirecting to payment..." : "Pay & Generate"}
          </button>
        </div>

        {/* Hidden file inputs */}
        <input
          type="file"
          accept="image/*"
          ref={replaceInputRef}
          className={styles.hidden}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleReplaceFile(f); e.target.value = ""; }}
        />
      </div>
    </>
  );
}
