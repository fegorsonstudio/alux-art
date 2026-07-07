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
  storyType?: string | null;
  requiresCostar?: boolean;
  requiresGroup?: boolean;
  requiresBrand?: boolean;
  defaultRole?: string | null;
  roleChips?: string[];
  backgroundOptions?: Array<{
    id: string;
    name: string;
    kind: "photo" | "text";
    description?: string;
    imagePath?: string | null;
    imageUrl?: string | null;
  }>;
  optionGroups?: Array<{
    id: string;
    type: string;
    label: string;
    options: Array<{
      id: string;
      name: string;
      kind: "photo" | "text";
      description?: string;
      imagePath?: string | null;
      imageUrl?: string | null;
    }>;
  }>;
  flagShot?: { enabled: boolean; imageUrl?: string | null } | null;
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

  // Viral flag shot — offered when the template enables it. Replaces the last image in the package.
  const flagShotAvailable = !!template.flagShot?.enabled;
  const [flagShotOn, setFlagShotOn] = useState(false);
  const [flagText, setFlagText] = useState("");
  const FLAG_TEXT_MAX = 60;

  // Buyer background allocation — active when the template offers 2+ options
  const bgOptions = template.backgroundOptions ?? [];
  const bgActive = bgOptions.length >= 2;
  const [bgAlloc, setBgAlloc] = useState<Record<string, number>>({});

  // Buyer choice groups — pick one option per group; only groups with 2+ options show a picker
  const choiceGroups = template.optionGroups ?? [];
  const pickableGroups = choiceGroups.filter(g => (g.options?.length ?? 0) >= 2);
  const [groupPicks, setGroupPicks] = useState<Record<string, string>>({});

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

  // Story state
  const [rolePrompt, setRolePrompt] = useState("");
  const [costarUploads, setCostarUploads] = useState<NewIdentityUpload[]>([]);
  const [costarConsent, setCostarConsent] = useState(false);
  const [groupPhotoUpload, setGroupPhotoUpload] = useState<NewIdentityUpload | null>(null);
  const [brandUploads, setBrandUploads] = useState<NewIdentityUpload[]>([]);
  const [brandPlacement, setBrandPlacement] = useState<"everywhere" | "background" | "subtle">("everywhere");

  const identityInputRef = useRef<HTMLInputElement>(null);
  const poseInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const addRefInputRef = useRef<HTMLInputElement>(null);
  const costarInputRef = useRef<HTMLInputElement>(null);
  const groupPhotoInputRef = useRef<HTMLInputElement>(null);
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
        }
      });

    // Background-option and choice-group images travel via their selections,
    // not as tagged refs — exclude them from the customizable reference list.
    const bgOptionPaths = new Set([
      ...((template.backgroundOptions ?? []).length >= 2
        ? (template.backgroundOptions ?? []).filter(o => o.imagePath).map(o => o.imagePath as string)
        : []),
      ...(template.optionGroups ?? []).flatMap(g => (g.options ?? []).filter(o => o.imagePath).map(o => o.imagePath as string)),
    ]);
    const tagged = (template.images ?? []).filter(img => img.purpose === "tagged" && img.tag && !bgOptionPaths.has(img.storagePath));
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

  // Default allocation: everything on the first background option
  useEffect(() => {
    if (!bgActive) return;
    setBgAlloc({ [bgOptions[0].id]: selectedPkg });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgActive, selectedPkg, template]);

  // Default group picks: first option of each pickable group
  useEffect(() => {
    if (pickableGroups.length === 0) return;
    setGroupPicks(Object.fromEntries(pickableGroups.map(g => [g.id, g.options[0].id])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template]);

  // Background allocation stays fully placed (sums to the package size) at all times.
  // Clicking + on a background pulls one image from whichever OTHER background currently
  // has the most — so "click + five times on the one I like" just moves them all there,
  // without the buyer having to first click − on the default background.
  const addImageToBg = (optionId: string) => {
    setBgAlloc(prev => {
      const cur = prev[optionId] ?? 0;
      if (cur >= selectedPkg) return prev; // already holds every image
      const total = Object.values(prev).reduce((a, b) => a + b, 0);
      const next = { ...prev, [optionId]: cur + 1 };
      if (total >= selectedPkg) {
        // Pull one from the largest other background
        let donor: string | null = null;
        let max = 0;
        for (const [id, c] of Object.entries(prev)) {
          if (id === optionId) continue;
          if ((c ?? 0) > max) { max = c ?? 0; donor = id; }
        }
        if (!donor) return prev;
        next[donor] = (next[donor] ?? 0) - 1;
      }
      return next;
    });
  };
  const removeImageFromBg = (optionId: string) => {
    setBgAlloc(prev => {
      const cur = prev[optionId] ?? 0;
      if (cur <= 0) return prev;
      return { ...prev, [optionId]: cur - 1 };
    });
  };

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

  // ── Story: co-star uploads ────────────────────────────────────────────────

  const uploadCostarFile = async (file: File, localId: string) => {
    setCostarUploads(prev => prev.map(u => u.localId === localId ? { ...u, uploading: true } : u));
    const f = await resizeIfNeeded(file);
    const form = new FormData();
    form.append("file", f, f.name);
    form.append("bucket", "identity-images");
    const res = await fetch("/api/upload/file", { method: "POST", body: form });
    if (!res.ok) {
      setCostarUploads(prev => prev.map(u => u.localId === localId ? { ...u, uploading: false, error: "Upload failed" } : u));
      return;
    }
    const { storagePath } = await res.json();
    setCostarUploads(prev => prev.map(u => u.localId === localId ? { ...u, uploading: false, storagePath, storageBucket: "identity-images" } : u));
  };

  const addCostarFiles = (files: FileList) => {
    const toAdd = Array.from(files).slice(0, 5 - costarUploads.length);
    const items: NewIdentityUpload[] = toAdd.map(file => ({
      localId: crypto.randomUUID(), file,
      preview: URL.createObjectURL(file),
      storagePath: "", storageBucket: "identity-images", uploading: false,
    }));
    setCostarUploads(prev => [...prev, ...items]);
    items.forEach(u => uploadCostarFile(u.file, u.localId));
  };

  // ── Story: group photo ────────────────────────────────────────────────────

  const uploadGroupPhotoFile = async (file: File, localId: string) => {
    setGroupPhotoUpload(prev => prev ? { ...prev, uploading: true } : prev);
    const f = await resizeIfNeeded(file);
    const form = new FormData();
    form.append("file", f, f.name);
    form.append("bucket", "identity-images");
    const res = await fetch("/api/upload/file", { method: "POST", body: form });
    if (!res.ok) {
      setGroupPhotoUpload(prev => prev ? { ...prev, uploading: false, error: "Upload failed" } : prev);
      return;
    }
    const { storagePath } = await res.json();
    setGroupPhotoUpload(prev => prev ? { ...prev, uploading: false, storagePath, storageBucket: "identity-images" } : prev);
  };

  const setGroupPhotoFile = (file: File) => {
    const item: NewIdentityUpload = {
      localId: crypto.randomUUID(), file,
      preview: URL.createObjectURL(file),
      storagePath: "", storageBucket: "identity-images", uploading: false,
    };
    setGroupPhotoUpload(item);
    uploadGroupPhotoFile(file, item.localId);
  };

  // ── Story: brand / logo upload ────────────────────────────────────────────

  const uploadBrandFile = async (file: File, localId: string) => {
    setBrandUploads(prev => prev.map(u => u.localId === localId ? { ...u, uploading: true } : u));
    const f = await resizeIfNeeded(file);
    const form = new FormData();
    form.append("file", f, f.name);
    form.append("bucket", "identity-images");
    const res = await fetch("/api/upload/file", { method: "POST", body: form });
    if (!res.ok) {
      setBrandUploads(prev => prev.map(u => u.localId === localId ? { ...u, uploading: false, error: "Upload failed" } : u));
      return;
    }
    const { storagePath } = await res.json();
    setBrandUploads(prev => prev.map(u => u.localId === localId ? { ...u, uploading: false, storagePath, storageBucket: "identity-images" } : u));
  };

  const addBrandFile = (file: File) => {
    const item: NewIdentityUpload = {
      localId: crypto.randomUUID(), file,
      preview: URL.createObjectURL(file),
      storagePath: "", storageBucket: "identity-images", uploading: false,
    };
    setBrandUploads([item]);
    uploadBrandFile(file, item.localId);
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
    || costarUploads.some(u => u.uploading) || !!groupPhotoUpload?.uploading || brandUploads.some(u => u.uploading);
  const bgAllocTotal = Object.values(bgAlloc).reduce((a, b) => a + b, 0);
  const bgValid = !bgActive || bgAllocTotal === selectedPkg;
  const flagValid = !flagShotOn || flagText.trim().length > 0;
  const canPay = allIdentityRefs.length > 0
    && !anyUploading
    && !newUploads.some(u => u.error)
    && !buying
    && bgValid
    && flagValid
    && (!template.requiresCostar || (costarUploads.some(u => u.storagePath) && costarConsent))
    && (!template.requiresGroup || !!groupPhotoUpload?.storagePath)
    && (!template.requiresBrand || brandUploads.some(u => u.storagePath));

  const book = async () => {
    if (!canPay) return;
    setBuying(true);
    setError("");
    const storyAssets = template.isStory ? {
      costarRefs: costarUploads.filter(u => u.storagePath).map(u => ({
        name: u.file.name, storageBucket: u.storageBucket, storagePath: u.storagePath,
      })),
      groupPhotoRef: groupPhotoUpload?.storagePath ? {
        name: groupPhotoUpload.file.name, storageBucket: groupPhotoUpload.storageBucket, storagePath: groupPhotoUpload.storagePath,
      } : undefined,
      brandRefs: brandUploads.filter(u => u.storagePath).map(u => ({
        name: u.file.name, storageBucket: u.storageBucket, storagePath: u.storagePath, placement: brandPlacement,
      })),
    } : undefined;

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
        rolePrompt: template.isStory && rolePrompt.trim() ? rolePrompt.trim() : undefined,
        storyAssets,
        backgroundAllocations: bgActive
          ? Object.entries(bgAlloc).filter(([, c]) => c > 0).map(([optionId, count]) => ({ optionId, count }))
          : undefined,
        choiceSelections: pickableGroups.length > 0
          ? Object.entries(groupPicks).map(([groupId, optionId]) => ({ groupId, optionId }))
          : undefined,
        flagShot: flagShotAvailable && flagShotOn
          ? { enabled: true, text: flagText.trim() }
          : undefined,
      }),
    });

    if (res.status === 401) {
      window.location.href = `/login?next=/marketplace/${templateId}`;
      return;
    }

    const data = await res.json();
    if (data.bypass && data.callbackUrl) {
      window.location.href = data.callbackUrl;
      return;
    }
    if (data.authorizationUrl) {
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

          {/* Buyer background allocation */}
          {bgActive && (
            <div className={styles.pkgRow}>
              {selectedPkg === 1 ? (
                <>
                  <span className={styles.pkgLabel}>Choose your background</span>
                  <p className={styles.sectionHint}>Your image will be shot on the background you pick.</p>
                  <div className={styles.shotTypeRow}>
                    {bgOptions.map(o => (
                      <button
                        key={o.id}
                        type="button"
                        className={`${styles.pkgPill} ${(bgAlloc[o.id] ?? 0) > 0 ? styles.pkgPillActive : ""}`}
                        title={o.kind === "text" ? o.description : undefined}
                        onClick={() => setBgAlloc({ [o.id]: 1 })}
                      >
                        {o.name}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <span className={styles.pkgLabel}>How many images on each background?</span>
                  <p className={styles.sectionHint}>
                    Your package has {selectedPkg} images. Tap <strong>+</strong> on a background to shoot more of
                    your images there, or <strong>−</strong> for fewer. Want them all on one backdrop? Just tap its{" "}
                    <strong>+</strong> {selectedPkg} times.
                  </p>
                  {/* Prominent running total */}
                  <div
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "8px 12px", borderRadius: 8, marginBottom: 8,
                      background: bgAllocTotal === selectedPkg ? "rgba(23,119,103,0.12)" : "rgba(229,72,77,0.10)",
                      fontSize: "0.85rem", fontWeight: 600,
                    }}
                  >
                    <span>{bgAllocTotal === selectedPkg ? "All images placed" : "Images left to place"}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>
                      {bgAllocTotal === selectedPkg ? `${selectedPkg} / ${selectedPkg}` : `${selectedPkg - bgAllocTotal} left`}
                    </span>
                  </div>
                  {bgOptions.map(o => {
                    const count = bgAlloc[o.id] ?? 0;
                    return (
                      <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
                        {o.imageUrl ? (
                          <ImagePreview src={o.imageUrl} alt={o.name} className={styles.savedImg} preferredWidth={80} />
                        ) : (
                          <span
                            title={o.description}
                            style={{ width: 44, height: 55, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, background: "rgba(127,127,127,0.15)", fontSize: "0.6rem", letterSpacing: "0.04em", flexShrink: 0 }}
                          >
                            TEXT
                          </span>
                        )}
                        <span style={{ flex: 1, fontSize: "0.85rem" }}>
                          {o.name}
                          <span style={{ display: "block", fontSize: "0.72rem", opacity: 0.7 }}>
                            {count === 0 ? "not used" : count === 1 ? "1 image" : `${count} images`}
                          </span>
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <button
                            type="button"
                            aria-label={`One fewer image on ${o.name}`}
                            className={styles.pkgPill}
                            disabled={count <= 0}
                            onClick={() => removeImageFromBg(o.id)}
                          >−</button>
                          <span style={{ minWidth: 20, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{count}</span>
                          <button
                            type="button"
                            aria-label={`One more image on ${o.name}`}
                            className={styles.pkgPill}
                            disabled={count >= selectedPkg}
                            onClick={() => addImageToBg(o.id)}
                          >+</button>
                        </div>
                      </div>
                    );
                  })}
                  {bgAllocTotal !== selectedPkg && (
                    <p className={styles.sectionHint} style={{ color: "#e5484d" }}>
                      Place all {selectedPkg} images across your backgrounds to continue.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Buyer choice groups — pick one option per group, used for the whole shoot */}
          {pickableGroups.length > 0 && (
            <div className={styles.pkgRow}>
              <span className={styles.pkgLabel}>Your styling</span>
              <p className={styles.sectionHint}>
                Pick one option in each section below. Whatever you choose — outfit, hairstyle, shoes, and the
                rest — is worn in <strong>every image</strong> of your shoot, so all your photos match.
              </p>
            </div>
          )}
          {pickableGroups.map(group => (
            <div key={group.id} className={styles.pkgRow}>
              <span className={styles.pkgLabel}>{group.label} <span style={{ fontWeight: 400, opacity: 0.6, fontSize: "0.78rem" }}>· choose one</span></span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {group.options.map(o => {
                  const picked = groupPicks[group.id] === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      title={o.kind === "text" ? o.description : o.name}
                      onClick={() => setGroupPicks(prev => ({ ...prev, [group.id]: o.id }))}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                        background: "none", cursor: "pointer", padding: 4,
                        border: picked ? "2px solid currentColor" : "2px solid rgba(127,127,127,0.25)",
                        borderRadius: 8, minWidth: 64,
                      }}
                    >
                      {o.imageUrl ? (
                        <ImagePreview src={o.imageUrl} alt={o.name} className={styles.savedImg} preferredWidth={80} />
                      ) : (
                        <span style={{ width: 44, height: 55, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, background: "rgba(127,127,127,0.15)", fontSize: "0.6rem", letterSpacing: "0.04em" }}>
                          TEXT
                        </span>
                      )}
                      <span style={{ fontSize: "0.72rem", maxWidth: 90, textAlign: "center" }}>{o.name}</span>
                      {picked && <span style={{ fontSize: "0.65rem" }}>✓ selected</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Viral skyscraper flag shot */}
          {flagShotAvailable && (
            <div className={styles.pkgRow}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={flagShotOn}
                  onChange={e => setFlagShotOn(e.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <span>
                  <span className={styles.pkgLabel}>Add the viral skyscraper flag shot</span>
                  <span style={{ display: "block", fontSize: "0.78rem", opacity: 0.7 }}>
                    Uses 1 of your {selectedPkg} {selectedPkg === 1 ? "image" : "images"}. You appear in full
                    wig and gown on a rooftop antenna holding a black flag with your own text.
                  </span>
                </span>
              </label>

              {flagShotOn && (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                  {template.flagShot?.imageUrl && (
                    <ImagePreview src={template.flagShot.imageUrl} alt="Flag scene" className={styles.flagScenePreview} preferredWidth={420} />
                  )}
                  <div className={styles.flagField}>
                    <label className={styles.flagFieldLabel}>✍️ Type your flag text here</label>
                    <input
                      type="text"
                      className={styles.flagInput}
                      placeholder='e.g. CALLED TO BAR 2026'
                      value={flagText}
                      maxLength={FLAG_TEXT_MAX}
                      onChange={e => setFlagText(e.target.value)}
                    />
                    <p className={styles.sectionHint} style={{ marginTop: 6 }}>
                      This exact text is printed on the flag. Keep it short — a name, title, or year reads best.
                      Long text, phone numbers, and links often render with mistakes. {flagText.length}/{FLAG_TEXT_MAX}
                    </p>
                    {flagShotOn && flagText.trim().length === 0 && (
                      <p className={styles.identityWarn}>Type your flag text to continue.</p>
                    )}
                  </div>
                </div>
              )}
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

          {/* Story: role prompt */}
          {template.isStory && (
            <div>
              <p className={styles.sectionTitle}>What&apos;s your angle? <span className={styles.optionalTag}>(optional)</span></p>
              <p className={styles.sectionHint}>
                Tell us your role in the story in one short sentence.{" "}
                {template.defaultRole ? `Default: "${template.defaultRole}"` : ""}
              </p>
              {template.roleChips && template.roleChips.length > 0 && (
                <div className={styles.roleChips}>
                  {template.roleChips.map(chip => (
                    <button
                      key={chip}
                      type="button"
                      className={`${styles.roleChip} ${rolePrompt === chip ? styles.roleChipActive : ""}`}
                      onClick={() => setRolePrompt(prev => prev === chip ? "" : chip)}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              )}
              <input
                type="text"
                className={styles.roleInput}
                placeholder={template.defaultRole ? `e.g. "${template.defaultRole}"` : "e.g. I'm the photographer pitchside"}
                value={rolePrompt}
                maxLength={100}
                onChange={e => setRolePrompt(e.target.value)}
              />
            </div>
          )}

          {template.isStory && <div className={styles.divider} />}

          {/* Story: co-star photos */}
          {template.requiresCostar && (
            <div>
              <p className={styles.sectionTitle}>Your co-star <span className={styles.requiredTag}>(required)</span></p>
              <p className={styles.sectionHint}>Upload 2–3 clear photos of the person you want to appear with you. At least 1 required.</p>
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
              {costarUploads.length < 5 && (
                <div className={styles.uploadRow}>
                  <button type="button" className={styles.uploadBtn} onClick={() => costarInputRef.current?.click()}>
                    + Upload co-star photo
                  </button>
                  <input type="file" accept="image/*" multiple ref={costarInputRef} className={styles.hidden}
                    onChange={e => { if (e.target.files) addCostarFiles(e.target.files); e.target.value = ""; }} />
                </div>
              )}
              <label className={styles.consentRow}>
                <input type="checkbox" checked={costarConsent} onChange={e => setCostarConsent(e.target.checked)} />
                <span className={styles.consentText}>I have permission to use this person&apos;s photos.</span>
              </label>
              {!costarUploads.some(u => u.storagePath) && (
                <p className={styles.identityWarn}>Upload at least 1 co-star photo to continue.</p>
              )}
            </div>
          )}

          {template.requiresCostar && <div className={styles.divider} />}

          {/* Story: group photo */}
          {template.requiresGroup && (
            <div>
              <p className={styles.sectionTitle}>Your group photo <span className={styles.requiredTag}>(required)</span></p>
              <p className={styles.sectionHint}>Upload one photo showing the whole group. We&apos;ll find everyone&apos;s face and place them in every scene.</p>
              {groupPhotoUpload ? (
                <div className={styles.uploadGrid}>
                  <div className={styles.uploadItem}>
                    <ImagePreview src={groupPhotoUpload.preview} alt="" className={styles.uploadImg} preferredWidth={200} />
                    {groupPhotoUpload.uploading && <div className={styles.uploadOverlay}>Uploading...</div>}
                    {groupPhotoUpload.error && <div className={styles.uploadError}>{groupPhotoUpload.error}</div>}
                    <button type="button" className={styles.removeBtn} onClick={() => setGroupPhotoUpload(null)}>✕</button>
                  </div>
                </div>
              ) : (
                <div className={styles.uploadRow}>
                  <button type="button" className={styles.uploadBtn} onClick={() => groupPhotoInputRef.current?.click()}>
                    + Upload group photo
                  </button>
                  <input type="file" accept="image/*" ref={groupPhotoInputRef} className={styles.hidden}
                    onChange={e => { const f = e.target.files?.[0]; if (f) setGroupPhotoFile(f); e.target.value = ""; }} />
                </div>
              )}
              {!groupPhotoUpload?.storagePath && (
                <p className={styles.identityWarn}>Upload a group photo to continue.</p>
              )}
            </div>
          )}

          {template.requiresGroup && <div className={styles.divider} />}

          {/* Story: brand / logo */}
          {template.requiresBrand && (
            <div>
              <p className={styles.sectionTitle}>Your brand / logo <span className={styles.requiredTag}>(required)</span></p>
              <p className={styles.sectionHint}>Upload your logo or product image. It will appear on screens, hoardings, and billboards in the scene.</p>
              {brandUploads.length > 0 ? (
                <div className={styles.uploadGrid}>
                  {brandUploads.map(u => (
                    <div key={u.localId} className={styles.uploadItem}>
                      <ImagePreview src={u.preview} alt="" className={styles.uploadImg} preferredWidth={200} />
                      {u.uploading && <div className={styles.uploadOverlay}>Uploading...</div>}
                      {u.error && <div className={styles.uploadError}>{u.error}</div>}
                      <button type="button" className={styles.removeBtn} onClick={() => setBrandUploads([])}>✕</button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.uploadRow}>
                  <button type="button" className={styles.uploadBtn} onClick={() => brandInputRef.current?.click()}>
                    + Upload logo / product image
                  </button>
                  <input type="file" accept="image/*" ref={brandInputRef} className={styles.hidden}
                    onChange={e => { const f = e.target.files?.[0]; if (f) addBrandFile(f); e.target.value = ""; }} />
                </div>
              )}
              <div className={styles.brandPlacementRow}>
                <span className={styles.pkgLabel}>Placement:</span>
                <div className={styles.pkgPills}>
                  {(["everywhere", "background", "subtle"] as const).map(p => (
                    <button
                      key={p}
                      type="button"
                      className={`${styles.pkgPill} ${brandPlacement === p ? styles.pkgPillActive : ""}`}
                      onClick={() => setBrandPlacement(p)}
                    >
                      {p === "everywhere" ? "Everywhere" : p === "background" ? "Background only" : "Subtle"}
                    </button>
                  ))}
                </div>
              </div>
              {!brandUploads.some(u => u.storagePath) && (
                <p className={styles.identityWarn}>Upload your logo to continue.</p>
              )}
            </div>
          )}

          {template.requiresBrand && <div className={styles.divider} />}

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
