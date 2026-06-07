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
  // Story fields
  isStory?: boolean;
  storyType?: string;
  defaultRole?: string;
  roleChips?: string[];
  requiresCostar?: boolean;
  requiresGroup?: boolean;
  requiresBrand?: boolean;
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

  // Story-specific state
  const [rolePrompt, setRolePrompt] = useState("");
  const [costarUploads, setCostarUploads] = useState<NewIdentityUpload[]>([]);
  const [groupPhotoUpload, setGroupPhotoUpload] = useState<NewIdentityUpload | null>(null);
  const [brandUploads, setBrandUploads] = useState<NewIdentityUpload[]>([]);
  const [brandPlacement, setBrandPlacement] = useState<"everywhere" | "background" | "subtle">("everywhere");
  const [costarConsent, setCostarConsent] = useState(false);

  const identityInputRef = useRef<HTMLInputElement>(null);
  const poseInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const addRefInputRef = useRef<HTMLInputElement>(null);
  const costarInputRef = useRef<HTMLInputElement>(null);
  const groupInputRef = useRef<HTMLInputElement>(null);
  const brandInputRef = useRef<HTMLInputElement>(null);

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

  // ── Story asset upload (costar / brand) ───────────────────────────────────

  const uploadStoryAssetFile = async (
    file: File,
    localId: string,
    setter: React.Dispatch<React.SetStateAction<NewIdentityUpload[]>>
  ) => {
    setter(prev => prev.map(u => u.localId === localId ? { ...u, uploading: true } : u));
    const f = await resizeIfNeeded(file);
    const form = new FormData();
    form.append("file", f, f.name);
    form.append("bucket", "identity-images");
    const res = await fetch("/api/upload/file", { method: "POST", body: form });
    if (!res.ok) {
      setter(prev => prev.map(u => u.localId === localId ? { ...u, uploading: false, error: "Upload failed" } : u));
      return;
    }
    const { storagePath } = await res.json();
    setter(prev => prev.map(u => u.localId === localId ? { ...u, uploading: false, storagePath, storageBucket: "identity-images" } : u));
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

  const anyUploading = newUploads.some(u => u.uploading) || poseUploads.some(u => u.uploading)
    || costarUploads.some(u => u.uploading) || (groupPhotoUpload?.uploading ?? false)
    || brandUploads.some(u => u.uploading);
  const canPay = allIdentityRefs.length > 0
    && !anyUploading
    && !newUploads.some(u => u.error)
    && !buying
    && (!template.requiresCostar || (costarUploads.some(u => u.storagePath) && costarConsent))
    && (!template.requiresGroup || !!groupPhotoUpload?.storagePath);

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
        rolePrompt: rolePrompt.trim() || undefined,
        storyAssets: (template.isStory && (costarUploads.length > 0 || groupPhotoUpload?.storagePath || brandUploads.length > 0)) ? {
          costarRefs: costarUploads.filter(u => u.storagePath).map(u => ({
            storagePath: u.storagePath, storageBucket: u.storageBucket, name: u.file.name,
          })),
          groupPhotoRef: groupPhotoUpload?.storagePath ? {
            storagePath: groupPhotoUpload.storagePath, storageBucket: groupPhotoUpload.storageBucket,
          } : undefined,
          brandRefs: brandUploads.filter(u => u.storagePath).map(u => ({
            storagePath: u.storagePath, storageBucket: u.storageBucket,
            placement: brandPlacement, name: u.file.name,
          })),
        } : undefined,
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

          {/* Story: Role prompt section */}
          {template.isStory && (
            <div className={styles.roleSection}>
              <p className={styles.sectionTitle}>🎭 Your Angle in This Story <span className={styles.optionalTag}>(optional)</span></p>
              <div className={styles.roleInputWrap}>
                <span className={styles.rolePrefix}>I&apos;m the</span>
                <input
                  type="text"
                  className={styles.roleInput}
                  placeholder={template.defaultRole ?? "fan in the stands"}
                  value={rolePrompt}
                  onChange={e => setRolePrompt(e.target.value.slice(0, 60))}
                  maxLength={60}
                />
                {rolePrompt.length > 45 && (
                  <span className={styles.roleCounter}>{rolePrompt.length}/60</span>
                )}
              </div>
              {template.roleChips && template.roleChips.length > 0 && (
                <div className={styles.roleChips}>
                  {template.roleChips.map((chip, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`${styles.roleChip} ${rolePrompt === chip ? styles.roleChipActive : ""}`}
                      onClick={() => setRolePrompt(prev => prev === chip ? "" : chip)}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              )}
              {template.defaultRole && !rolePrompt && (
                <p className={styles.roleDefault}>Default: {template.defaultRole}</p>
              )}
            </div>
          )}

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

          {/* Story: Co-star upload */}
          {template.isStory && template.requiresCostar && (
            <div>
              <div className={styles.divider} />
              <p className={styles.sectionTitle}>Your Co-star <span className={styles.optionalTag}>(required for Duo stories)</span></p>
              <p className={styles.sectionHint}>Upload 2–3 clear photos of the person you want to appear with you. At least 1 required to proceed.</p>
              {costarUploads.length > 0 && (
                <div className={styles.uploadGrid}>
                  {costarUploads.map(u => (
                    <div key={u.localId} className={styles.uploadItem}>
                      <ImagePreview src={u.preview} alt="" className={styles.uploadImg} preferredWidth={140} />
                      {u.uploading && <div className={styles.uploadOverlay}>Uploading...</div>}
                      {u.error && <div className={styles.uploadError}>{u.error}</div>}
                      <button type="button" className={styles.removeBtn} onClick={() => setCostarUploads(prev => prev.filter(x => x.localId !== u.localId))}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              {costarUploads.length < 3 && (
                <button type="button" className={styles.uploadBtn} onClick={() => costarInputRef.current?.click()}>
                  + Add co-star photo
                </button>
              )}
              <input type="file" accept="image/*" multiple ref={costarInputRef} className={styles.hidden}
                onChange={e => {
                  if (!e.target.files) return;
                  const files = Array.from(e.target.files).slice(0, 3 - costarUploads.length);
                  const items: NewIdentityUpload[] = files.map(file => ({
                    localId: crypto.randomUUID(), file, preview: URL.createObjectURL(file),
                    storagePath: "", storageBucket: "identity-images", uploading: false,
                  }));
                  setCostarUploads(prev => [...prev, ...items]);
                  items.forEach(u => uploadStoryAssetFile(u.file, u.localId, setCostarUploads));
                  e.target.value = "";
                }}
              />
              <label className={styles.consentRow}>
                <input type="checkbox" checked={costarConsent} onChange={e => setCostarConsent(e.target.checked)} />
                <span className={styles.consentText}>I confirm I have this person&apos;s permission to use their photos</span>
              </label>
            </div>
          )}

          {/* Story: Group photo upload */}
          {template.isStory && template.requiresGroup && (
            <div>
              <div className={styles.divider} />
              <p className={styles.sectionTitle}>Your Group Photo <span className={styles.optionalTag}>(optional)</span></p>
              <p className={styles.sectionHint}>Upload one group photo — we&apos;ll place everyone in the story together.</p>
              {groupPhotoUpload ? (
                <div className={styles.uploadItem} style={{ maxWidth: 200 }}>
                  <ImagePreview src={groupPhotoUpload.preview} alt="" className={styles.uploadImg} preferredWidth={200} />
                  {groupPhotoUpload.uploading && <div className={styles.uploadOverlay}>Uploading...</div>}
                  <button type="button" className={styles.removeBtn} onClick={() => setGroupPhotoUpload(null)}>✕</button>
                </div>
              ) : (
                <button type="button" className={styles.uploadBtn} onClick={() => groupInputRef.current?.click()}>
                  + Upload group photo
                </button>
              )}
              <input type="file" accept="image/*" ref={groupInputRef} className={styles.hidden}
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const localId = crypto.randomUUID();
                  const item: NewIdentityUpload = {
                    localId, file, preview: URL.createObjectURL(file),
                    storagePath: "", storageBucket: "identity-images", uploading: true,
                  };
                  setGroupPhotoUpload(item);
                  resizeIfNeeded(file).then(f => {
                    const form = new FormData();
                    form.append("file", f, f.name);
                    form.append("bucket", "identity-images");
                    return fetch("/api/upload/file", { method: "POST", body: form });
                  }).then(r => r.ok ? r.json() : null).then(d => {
                    if (d?.storagePath) {
                      setGroupPhotoUpload(prev => prev ? { ...prev, storagePath: d.storagePath, uploading: false } : prev);
                    } else {
                      setGroupPhotoUpload(prev => prev ? { ...prev, uploading: false, error: "Upload failed" } : prev);
                    }
                  }).catch(() => {
                    setGroupPhotoUpload(prev => prev ? { ...prev, uploading: false, error: "Upload failed" } : prev);
                  });
                  e.target.value = "";
                }}
              />
            </div>
          )}

          {/* Story: Brand assets upload */}
          {template.isStory && template.requiresBrand && (
            <div>
              <div className={styles.divider} />
              <p className={styles.sectionTitle}>Your Brand Assets <span className={styles.optionalTag}>(optional)</span></p>
              <p className={styles.sectionHint}>Upload your logo and/or product images. PNG with transparent background works best.</p>
              {brandUploads.length > 0 && (
                <div className={styles.uploadGrid}>
                  {brandUploads.map(u => (
                    <div key={u.localId} className={styles.uploadItem}>
                      <ImagePreview src={u.preview} alt="" className={styles.uploadImg} preferredWidth={140} />
                      {u.uploading && <div className={styles.uploadOverlay}>Uploading...</div>}
                      {u.error && <div className={styles.uploadError}>{u.error}</div>}
                      <button type="button" className={styles.removeBtn} onClick={() => setBrandUploads(prev => prev.filter(x => x.localId !== u.localId))}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              {brandUploads.length < 5 && (
                <button type="button" className={styles.uploadBtn} onClick={() => brandInputRef.current?.click()}>
                  + Add brand image
                </button>
              )}
              <input type="file" accept="image/*" multiple ref={brandInputRef} className={styles.hidden}
                onChange={e => {
                  if (!e.target.files) return;
                  const files = Array.from(e.target.files).slice(0, 5 - brandUploads.length);
                  const items: NewIdentityUpload[] = files.map(file => ({
                    localId: crypto.randomUUID(), file, preview: URL.createObjectURL(file),
                    storagePath: "", storageBucket: "identity-images", uploading: false,
                  }));
                  setBrandUploads(prev => [...prev, ...items]);
                  items.forEach(u => uploadStoryAssetFile(u.file, u.localId, setBrandUploads));
                  e.target.value = "";
                }}
              />
              <div className={styles.placementRow}>
                <p className={styles.sectionTitle} style={{ margin: "12px 0 8px" }}>Where should your brand appear?</p>
                {([  
                  { value: "everywhere" as const, label: "Everywhere (banners, screens, shirts)" },
                  { value: "background" as const, label: "Mainly in the background" },
                  { value: "subtle" as const, label: "Subtly — one or two placements" },
                ]).map(opt => (
                  <label key={opt.value} className={styles.placementOption}>
                    <input
                      type="radio"
                      name="brandPlacement"
                      value={opt.value}
                      checked={brandPlacement === opt.value}
                      onChange={() => setBrandPlacement(opt.value)}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

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
