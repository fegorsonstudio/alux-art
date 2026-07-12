"use client";

import { useState, useEffect, useRef } from "react";
import { resizeIfNeeded } from "@/lib/resize-image";
import styles from "./checkout-panel.module.css";
import ImagePreview from "@/components/ImagePreview";
import { savePendingCheckout, loadPendingCheckout, clearPendingCheckout, setResumeMarker } from "@/lib/checkout-resume";

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
  trendSlots?: {
    mugshot?: { enabled: boolean; imageUrl?: string | null } | null;
    bowl?: { enabled: boolean; imageUrl?: string | null } | null;
    viral?: { enabled: boolean; imageUrl?: string | null } | null;
  } | null;
  poseOptions?: Array<{ id: string; name: string; description?: string; imageUrl: string }>;
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
  loggedIn: boolean;
  resume?: boolean;
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
  loggedIn,
  resume,
  onClose,
}: Props) {
  const [selectedPkg, setSelectedPkg] = useState<1 | 5 | 10>(initialPkg);
  const [shotType, setShotType] = useState<"headshot" | "close_up" | "medium" | "full_body">("close_up");

  // Viral flag shot — offered when the template enables it. Replaces the last image in the package.
  const flagShotAvailable = !!template.flagShot?.enabled;
  const [flagShotOn, setFlagShotOn] = useState(false);
  const [flagText, setFlagText] = useState("");
  const FLAG_TEXT_MAX = 60;

  // Trend slots (Trending category) — optional viral shots, each replaces one image.
  const mugshotAvailable = !!template.trendSlots?.mugshot?.enabled;
  const bowlAvailable = !!template.trendSlots?.bowl?.enabled;
  // Viral chair pose: NOT optional — every booking of this template includes it.
  const viralIncluded = !!template.trendSlots?.viral?.enabled;
  const [mugshotOn, setMugshotOn] = useState(false);
  const [mugshotName, setMugshotName] = useState("");
  const [mugshotOffense, setMugshotOffense] = useState("");
  const [mugshotDate, setMugshotDate] = useState(() =>
    new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  );
  const [bowlOn, setBowlOn] = useState(false);
  const [bowlMode, setBowlMode] = useState<"product" | "logo">("product");
  const [bowlUpload, setBowlUpload] = useState<NewIdentityUpload | null>(null);

  // Buyer background allocation — active when the template offers 2+ options.
  // Custom slots (flag, mugshot, bowl) don't take part in the backdrop distribution:
  // buyers only place their NORMAL portraits across backdrops.
  const bgOptions = template.backgroundOptions ?? [];
  const bgExemptCount = (flagShotAvailable && flagShotOn ? 1 : 0)
    + (mugshotAvailable && mugshotOn ? 1 : 0)
    + (bowlAvailable && bowlOn ? 1 : 0)
    + (viralIncluded ? 1 : 0);
  const bgTarget = Math.max(0, selectedPkg - bgExemptCount);
  const bgActive = bgOptions.length >= 2 && bgTarget >= 1;
  const [bgAlloc, setBgAlloc] = useState<Record<string, number>>({});
  // Default UX: one backdrop for the whole shoot. Buyers opt into splitting across backdrops.
  const [bgSplitMode, setBgSplitMode] = useState(false);

  // Buyer choice groups. Single-select groups: pick one, shown at 2+ options.
  // Multi-select groups (props): pick any number, shown from 1 option.
  const MULTI_SELECT_TYPES = new Set(["props"]);
  const choiceGroups = template.optionGroups ?? [];
  const pickableGroups = choiceGroups.filter(g => !MULTI_SELECT_TYPES.has(g.type) && (g.options?.length ?? 0) >= 2);
  const multiGroups = choiceGroups.filter(g => MULTI_SELECT_TYPES.has(g.type) && (g.options?.length ?? 0) >= 1);
  const [groupPicks, setGroupPicks] = useState<Record<string, string>>({});
  const [multiPicks, setMultiPicks] = useState<Record<string, string[]>>({});

  // Signature poses (creator-uploaded pose mimicry) — NOT buyer-chosen. The
  // planner randomly picks a distinct pose per portrait slot server-side at
  // booking time (lib/pose-options.ts pickRandomPoseOptions); nothing to
  // render or send here.

  const [savedRefs, setSavedRefs] = useState<SavedIdentityRef[]>([]);
  const [selectedSaved, setSelectedSaved] = useState<Set<string>>(new Set());
  const [newUploads, setNewUploads] = useState<NewIdentityUpload[]>([]);
  const [clearing, setClearing] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [defaultsReady, setDefaultsReady] = useState(false);
  const didRestore = useRef(false);
  // Return to this template in resume mode after Google sign-in. Belt-and-suspenders:
  // ?resume=1 rides the OAuth `next` (works when next survives), and a cookie+localStorage
  // marker (set in goSignIn) covers the case where next is dropped to the home page.
  const loginUrl = `/login?next=${encodeURIComponent(`/marketplace/${templateId}?resume=1`)}`;
  const signedOut = !loggedIn || needsLogin;

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
      .then(r => {
        if (r.status === 401) { setNeedsLogin(true); return { refs: [] }; }
        setNeedsLogin(false);
        return r.ok ? r.json() : { refs: [] };
      })
      .then(d => {
        if (d.refs?.length) {
          setSavedRefs(d.refs);
        }
      })
      .catch(() => {});

    // Background-option and choice-group images travel via their selections,
    // not as tagged refs — exclude them from the customizable reference list.
    const bgOptionPaths = new Set([
      ...((template.backgroundOptions ?? []).length >= 2
        ? (template.backgroundOptions ?? []).filter(o => o.imagePath).map(o => o.imagePath as string)
        : []),
      ...(template.optionGroups ?? []).flatMap(g => (g.options ?? []).filter(o => o.imagePath).map(o => o.imagePath as string)),
    ]);
    const tagged = (template.images ?? []).filter(img => img.purpose === "tagged" && img.tag && img.tag !== "FLAG_SCENE" && !bgOptionPaths.has(img.storagePath));
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

  // Default allocation: everything on the first background option.
  // Held until a resume restore (if any) resolves, and skipped when we restored a saved config.
  useEffect(() => {
    if (!defaultsReady) return;
    if (!bgActive) return;
    // In single-backdrop mode, keep ALL images on the currently chosen backdrop (or the
    // first) and follow bgTarget as it changes (flag toggle / package change). This also
    // runs after a resume restore to reconcile the restored selection with bgTarget.
    if (!bgSplitMode) {
      setBgAlloc(prev => {
        const selectedId = Object.keys(prev).find(id => (prev[id] ?? 0) > 0) ?? bgOptions[0]?.id;
        if (!selectedId) return prev;
        return { [selectedId]: bgTarget };
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgActive, selectedPkg, template, defaultsReady, bgTarget, bgSplitMode]);

  // No default group picks — every group is opt-in so buyers only get what fits
  // them (e.g. a man skips Hair/Nails on a unisex template).

  // Resume an in-progress checkout after Google sign-in: restore choices + re-upload
  // the photos the buyer had picked, then continue straight to payment.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!loggedIn || !resume) { setDefaultsReady(true); return; }
      const pending = await loadPendingCheckout(templateId);
      if (cancelled) return;
      if (!pending) { setDefaultsReady(true); return; }
      didRestore.current = true;
      const c = pending.config;
      if ([1, 5, 10].includes(c.selectedPkg)) setSelectedPkg(c.selectedPkg);
      if (c.shotType) setShotType(c.shotType as typeof shotType);
      setFlagShotOn(!!c.flagShotOn);
      setFlagText(c.flagText ?? "");
      if (c.groupPicks) setGroupPicks(c.groupPicks);
      if (c.multiPicks) setMultiPicks(c.multiPicks);
      if (typeof c.bgSplitMode === "boolean") setBgSplitMode(c.bgSplitMode);
      if (c.bgAlloc) setBgAlloc(c.bgAlloc);
      setRolePrompt(c.rolePrompt ?? "");
      if (c.brandPlacement) setBrandPlacement(c.brandPlacement as typeof brandPlacement);
      // Trend slots
      setMugshotOn(!!c.mugshotOn);
      if (c.mugshotName) setMugshotName(c.mugshotName);
      if (c.mugshotOffense) setMugshotOffense(c.mugshotOffense);
      if (c.mugshotDate) setMugshotDate(c.mugshotDate);
      setBowlOn(!!c.bowlOn);
      if (c.bowlMode === "product" || c.bowlMode === "logo") setBowlMode(c.bowlMode);
      if (pending.files?.length) {
        const items: NewIdentityUpload[] = pending.files.map(f => {
          const file = new File([f.blob], f.name, { type: f.type || "image/jpeg" });
          return { localId: crypto.randomUUID(), file, preview: URL.createObjectURL(f.blob), storagePath: "", storageBucket: "identity-images", uploading: true };
        });
        setNewUploads(prev => [...prev, ...items]);
        items.forEach(u => uploadIdentityFile(u.file, u.localId));
      }
      if (pending.bowlFile) {
        const bf = pending.bowlFile;
        const file = new File([bf.blob], bf.name, { type: bf.type || "image/jpeg" });
        const item: NewIdentityUpload = { localId: crypto.randomUUID(), file, preview: URL.createObjectURL(bf.blob), storagePath: "", storageBucket: "identity-images", uploading: true };
        setBowlUpload(item);
        uploadBowlFile(file, item.localId);
      }
      await clearPendingCheckout(templateId);
      setDefaultsReady(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, resume, templateId]);

  // Background allocation stays fully placed (sums to the package size) at all times.
  // Clicking + on a background pulls one image from whichever OTHER background currently
  // has the most — so "click + five times on the one I like" just moves them all there,
  // without the buyer having to first click − on the default background.
  const addImageToBg = (optionId: string) => {
    setBgAlloc(prev => {
      const cur = prev[optionId] ?? 0;
      if (cur >= bgTarget) return prev; // already holds every image
      const total = Object.values(prev).reduce((a, b) => a + b, 0);
      const next = { ...prev, [optionId]: cur + 1 };
      if (total >= bgTarget) {
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
      if (res.status === 401) setNeedsLogin(true);
      const msg = res.status === 401 ? "Sign in first" : "Upload failed";
      setNewUploads(prev => prev.map(u => u.localId === localId ? { ...u, uploading: false, error: msg } : u));
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
    // Signed out: keep the photos staged locally (no upload yet). They're preserved
    // across sign-in and uploaded automatically on return. Signed in: upload now.
    if (!signedOut) items.forEach(u => uploadIdentityFile(u.file, u.localId));
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

  // ── Trend slot: bowl content (product photo or logo) ─────────────────────────
  const uploadBowlFile = async (file: File, localId: string) => {
    setBowlUpload(prev => prev && prev.localId === localId ? { ...prev, uploading: true } : prev);
    const f = await resizeIfNeeded(file);
    const form = new FormData();
    form.append("file", f, f.name);
    form.append("bucket", "identity-images");
    const res = await fetch("/api/upload/file", { method: "POST", body: form });
    if (!res.ok) {
      if (res.status === 401) setNeedsLogin(true);
      setBowlUpload(prev => prev && prev.localId === localId ? { ...prev, uploading: false, error: res.status === 401 ? "Sign in first" : "Upload failed" } : prev);
      return;
    }
    const { storagePath } = await res.json();
    setBowlUpload(prev => prev && prev.localId === localId ? { ...prev, uploading: false, storagePath, storageBucket: "identity-images" } : prev);
  };

  const setBowlFile = (file: File) => {
    const item: NewIdentityUpload = {
      localId: crypto.randomUUID(), file,
      preview: URL.createObjectURL(file),
      storagePath: "", storageBucket: "identity-images", uploading: false,
    };
    setBowlUpload(item);
    // Signed out: stage locally (preserved across sign-in). Signed in: upload now.
    if (!signedOut) uploadBowlFile(file, item.localId);
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
  const bgValid = !bgActive || bgAllocTotal === bgTarget;
  const flagValid = !flagShotOn || flagText.trim().length > 0;
  const mugshotValid = !mugshotOn || (mugshotName.trim().length > 0 && mugshotOffense.trim().length > 0);
  const bowlValid = !bowlOn || (signedOut ? !!bowlUpload : !!bowlUpload?.storagePath);
  const canPay = allIdentityRefs.length > 0
    && !anyUploading
    && !newUploads.some(u => u.error)
    && !buying
    && bgValid
    && flagValid
    && mugshotValid
    && bowlValid
    && !bowlUpload?.uploading
    && (!template.requiresCostar || (costarUploads.some(u => u.storagePath) && costarConsent))
    && (!template.requiresGroup || !!groupPhotoUpload?.storagePath)
    && (!template.requiresBrand || brandUploads.some(u => u.storagePath));

  // Signed-out buyer: stash their config + picked photos, then go to Google sign-in.
  // They return to this same checkout (resume mode) with everything restored.
  const goSignIn = async () => {
    setResuming(true);
    const config = {
      selectedPkg, shotType, flagShotOn, flagText, groupPicks, multiPicks, bgAlloc, bgSplitMode, rolePrompt, brandPlacement,
      mugshotOn, mugshotName, mugshotOffense, mugshotDate, bowlOn, bowlMode,
    };
    const files = newUploads
      .filter(u => u.file)
      .map(u => ({ name: u.file.name, type: u.file.type || "image/jpeg", blob: u.file as Blob }));
    const bowlFile = bowlUpload?.file
      ? { name: bowlUpload.file.name, type: bowlUpload.file.type || "image/jpeg", blob: bowlUpload.file as Blob }
      : null;
    await savePendingCheckout(templateId, config, files, bowlFile);
    // Marker (cookie + localStorage) drives the post-login redirect back here even if the
    // OAuth `next` is dropped to the home page.
    setResumeMarker(templateId);
    window.location.href = loginUrl;
  };

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
        choiceSelections: (pickableGroups.length > 0 || multiGroups.length > 0)
          ? [
              ...Object.entries(groupPicks).map(([groupId, optionId]) => ({ groupId, optionId })),
              ...Object.entries(multiPicks).flatMap(([groupId, ids]) => ids.map(optionId => ({ groupId, optionId }))),
            ]
          : undefined,
        flagShot: flagShotAvailable && flagShotOn
          ? { enabled: true, text: flagText.trim() }
          : undefined,
        trendSlots: (mugshotAvailable && mugshotOn) || (bowlAvailable && bowlOn)
          ? {
              mugshot: mugshotAvailable && mugshotOn
                ? { enabled: true, name: mugshotName.trim(), offense: mugshotOffense.trim(), date: mugshotDate.trim() }
                : undefined,
              bowl: bowlAvailable && bowlOn
                ? { enabled: true, mode: bowlMode }
                : undefined,
            }
          : undefined,
        bowlContentRef: bowlAvailable && bowlOn && bowlUpload?.storagePath
          ? { storagePath: bowlUpload.storagePath, storageBucket: bowlUpload.storageBucket }
          : undefined,
      }),
    });

    if (res.status === 401) {
      // Session expired at the last step — preserve everything and route through sign-in.
      await goSignIn();
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
          {signedOut && (
            <button
              type="button"
              onClick={goSignIn}
              disabled={resuming}
              style={{
                display: "block", width: "100%", margin: "0 0 14px", padding: "14px 16px", borderRadius: 12,
                background: "#2f8e9a", color: "#ffffff", border: "none", fontWeight: 700, fontSize: "0.9rem",
                textAlign: "center", cursor: "pointer", boxShadow: "0 2px 10px rgba(47,142,154,0.28)",
              }}
            >
              Set up your shoot below — you&apos;ll sign in with Google before you pay. Your choices are saved.
            </button>
          )}
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

          {/* Buyer backdrop — one backdrop for the whole shoot by default; splitting is optional */}
          {bgActive && (
            <div className={styles.pkgRow}>
              {!bgSplitMode ? (
                <>
                  <span className={styles.pkgLabel}>Choose your backdrop</span>
                  <p className={styles.sectionHint}>
                    {bgTarget === 1
                      ? "Your image will be shot on the backdrop you pick."
                      : "Pick one backdrop for your whole shoot. Tap another to switch."}
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {bgOptions.map(o => {
                      const picked = (bgAlloc[o.id] ?? 0) > 0;
                      return (
                        <button
                          key={o.id}
                          type="button"
                          title={o.kind === "text" ? o.description : o.name}
                          onClick={() => setBgAlloc({ [o.id]: bgTarget })}
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
                  {bgTarget >= 2 && (
                    <button
                      type="button"
                      onClick={() => setBgSplitMode(true)}
                      style={{ marginTop: 10, background: "none", border: "none", padding: 0, color: "#2f8e9a", fontWeight: 600, fontSize: "0.8rem", cursor: "pointer", textDecoration: "underline" }}
                    >
                      Use different backdrops for different shots
                    </button>
                  )}
                </>
              ) : (
                <>
                  <span className={styles.pkgLabel}>How many images on each backdrop?</span>
                  <p className={styles.sectionHint}>
                    {bgExemptCount > 0
                      ? <>Place your <strong>{bgTarget}</strong> studio images across the backdrops (your {bgExemptCount} special shot{bgExemptCount > 1 ? "s use" : " uses"} their own scene{bgExemptCount > 1 ? "s" : ""}). </>
                      : <>Your package has {selectedPkg} images. </>}
                    Tap <strong>+</strong> on a backdrop for more images there, or <strong>−</strong> for fewer.
                  </p>
                  {/* Prominent running total */}
                  <div
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "8px 12px", borderRadius: 8, marginBottom: 8,
                      background: bgAllocTotal === bgTarget ? "rgba(23,119,103,0.12)" : "rgba(229,72,77,0.10)",
                      fontSize: "0.85rem", fontWeight: 600,
                    }}
                  >
                    <span>{bgAllocTotal === bgTarget ? "All images placed" : "Images left to place"}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>
                      {bgAllocTotal === bgTarget ? `${bgTarget} / ${bgTarget}` : `${bgTarget - bgAllocTotal} left`}
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
                            disabled={count >= bgTarget}
                            onClick={() => addImageToBg(o.id)}
                          >+</button>
                        </div>
                      </div>
                    );
                  })}
                  {bgAllocTotal !== bgTarget && (
                    <p className={styles.sectionHint} style={{ color: "#e5484d" }}>
                      Place all {bgTarget} images across your backdrops to continue.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => setBgSplitMode(false)}
                    style={{ marginTop: 6, background: "none", border: "none", padding: 0, color: "#2f8e9a", fontWeight: 600, fontSize: "0.8rem", cursor: "pointer", textDecoration: "underline" }}
                  >
                    ← Use one backdrop for the whole shoot
                  </button>
                </>
              )}
            </div>
          )}

          {/* Buyer choice groups — optional, pick what fits you; used for the whole shoot */}
          {pickableGroups.length > 0 && (
            <div className={styles.pkgRow}>
              <span className={styles.pkgLabel}>Your styling</span>
              <p className={styles.sectionHint}>
                Pick only what fits you — skip anything you don&apos;t need (tap again to unselect).
                Whatever you choose is worn in <strong>every image</strong> of your shoot, so all your photos match.
              </p>
            </div>
          )}
          {pickableGroups.map(group => (
            <div key={group.id} className={styles.pkgRow}>
              <span className={styles.pkgLabel}>{group.label} <span style={{ fontWeight: 400, opacity: 0.6, fontSize: "0.78rem" }}>· optional — pick one or skip</span></span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {group.options.map(o => {
                  const picked = groupPicks[group.id] === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      title={o.kind === "text" ? o.description : o.name}
                      onClick={() => setGroupPicks(prev => {
                        if (prev[group.id] === o.id) {
                          const next = { ...prev };
                          delete next[group.id];
                          return next;
                        }
                        return { ...prev, [group.id]: o.id };
                      })}
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

          {/* Multi-select groups (props) — pick as many as you want */}
          {multiGroups.map(group => {
            const picked = multiPicks[group.id] ?? [];
            return (
              <div key={group.id} className={styles.pkgRow}>
                <span className={styles.pkgLabel}>{group.label} <span style={{ fontWeight: 400, opacity: 0.6, fontSize: "0.78rem" }}>· choose any</span></span>
                <p className={styles.sectionHint}>
                  Pick as many {group.label.toLowerCase()} as you want — they&apos;ll appear in your photos. Or pick none.
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {group.options.map(o => {
                    const isOn = picked.includes(o.id);
                    return (
                      <button
                        key={o.id}
                        type="button"
                        title={o.kind === "text" ? o.description : o.name}
                        onClick={() => setMultiPicks(prev => {
                          const cur = prev[group.id] ?? [];
                          return { ...prev, [group.id]: isOn ? cur.filter(id => id !== o.id) : [...cur, o.id] };
                        })}
                        style={{
                          display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                          background: "none", cursor: "pointer", padding: 4,
                          border: isOn ? "2px solid currentColor" : "2px solid rgba(127,127,127,0.25)",
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
                        {isOn && <span style={{ fontSize: "0.65rem" }}>✓ added</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Signature poses — informational only; the planner picks randomly, no repeats */}
          {(template.poseOptions?.length ?? 0) > 0 && (
            <div className={styles.pkgRow}>
              <span className={styles.pkgLabel}>🎭 Signature poses included</span>
              <p className={styles.sectionHint}>
                Your portraits will feature a random mix of this template&apos;s signature poses —
                no two images in your shoot repeat the same one.
              </p>
            </div>
          )}

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

          {/* Trend slot: viral chair pose — always included, informational only */}
          {viralIncluded && (
            <div className={styles.pkgRow}>
              <span className={styles.pkgLabel}>🔥 The viral chair pose — included</span>
              <p className={styles.sectionHint}>
                One of your {selectedPkg} {selectedPkg === 1 ? "image" : "images"} automatically recreates
                the viral seated pose everyone is sharing — tan suit, coat draped over the shoulders,
                legs crossed. Same iconic look whether you&apos;re a man or a woman.
              </p>
              {template.trendSlots?.viral?.imageUrl && (
                <ImagePreview src={template.trendSlots.viral.imageUrl} alt="The viral chair pose" className={styles.flagScenePreview} preferredWidth={420} />
              )}
            </div>
          )}

          {/* Trend slot: viral mugshot */}
          {mugshotAvailable && (
            <div className={styles.pkgRow}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={mugshotOn} onChange={e => setMugshotOn(e.target.checked)} style={{ marginTop: 3 }} />
                <span>
                  <span className={styles.pkgLabel}>Add the viral mugshot</span>
                  <span style={{ display: "block", fontSize: "0.78rem", opacity: 0.7 }}>
                    Uses 1 of your {selectedPkg} {selectedPkg === 1 ? "image" : "images"}. You pose like a mugshot
                    holding the board — your name, &quot;offense&quot; and date are handwritten on it in red.
                  </span>
                </span>
              </label>
              {mugshotOn && (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                  {template.trendSlots?.mugshot?.imageUrl && (
                    <ImagePreview src={template.trendSlots.mugshot.imageUrl} alt="Mugshot board" className={styles.flagScenePreview} preferredWidth={420} />
                  )}
                  <div className={styles.flagField}>
                    <label className={styles.flagFieldLabel}>✍️ Your name (on the board)</label>
                    <input type="text" className={styles.flagInput} placeholder="e.g. Barr. Amaka O." value={mugshotName} maxLength={30} onChange={e => setMugshotName(e.target.value)} />
                  </div>
                  <div className={styles.flagField}>
                    <label className={styles.flagFieldLabel}>🚨 The &quot;offense&quot;</label>
                    <input type="text" className={styles.flagInput} placeholder='e.g. "Passing the Bar too easily"' value={mugshotOffense} maxLength={100} onChange={e => setMugshotOffense(e.target.value)} />
                    <p className={styles.sectionHint} style={{ marginTop: 4 }}>
                      Make it fun — a birthday, a launch, an achievement. {mugshotOffense.length}/100
                    </p>
                  </div>
                  <div className={styles.flagField}>
                    <label className={styles.flagFieldLabel}>📅 Date (tap to change)</label>
                    <input type="text" className={styles.flagInput} value={mugshotDate} maxLength={20} onChange={e => setMugshotDate(e.target.value)} />
                  </div>
                  {mugshotOn && (!mugshotName.trim() || !mugshotOffense.trim()) && (
                    <p className={styles.identityWarn}>Fill in your name and the offense to continue.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Trend slot: business on my head (bowl) */}
          {bowlAvailable && (
            <div className={styles.pkgRow}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={bowlOn} onChange={e => setBowlOn(e.target.checked)} style={{ marginTop: 3 }} />
                <span>
                  <span className={styles.pkgLabel}>Add the &quot;business on my head&quot; shot</span>
                  <span style={{ display: "block", fontSize: "0.78rem", opacity: 0.7 }}>
                    Uses 1 of your {selectedPkg} {selectedPkg === 1 ? "image" : "images"}. You carry the classic
                    enamel bowl on your head — loaded with your product, or branded with your logo.
                  </span>
                </span>
              </label>
              {bowlOn && (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                  {template.trendSlots?.bowl?.imageUrl && (
                    <ImagePreview src={template.trendSlots.bowl.imageUrl} alt="Bowl" className={styles.flagScenePreview} preferredWidth={420} />
                  )}
                  <div className={styles.shotTypeRow}>
                    {([["product", "My product — piled in the bowl"], ["logo", "My logo — printed on the bowl"]] as const).map(([m, label]) => (
                      <button
                        key={m}
                        type="button"
                        className={`${styles.pkgPill} ${bowlMode === m ? styles.pkgPillActive : ""}`}
                        onClick={() => setBowlMode(m)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className={styles.sectionHint}>
                    {bowlMode === "product"
                      ? "Upload ONE clear photo of what you sell (on a plain background works best). We pile it comically high in the bowl."
                      : "Upload your logo (a clean, high-quality image). We print it on the side of the bowl."}
                  </p>
                  {bowlUpload ? (
                    <div className={styles.uploadGrid}>
                      <div className={styles.uploadItem}>
                        <ImagePreview src={bowlUpload.preview} alt="" className={styles.uploadImg} preferredWidth={140} />
                        {bowlUpload.uploading && <div className={styles.uploadOverlay}>Uploading...</div>}
                        {bowlUpload.error && <div className={styles.uploadError}>{bowlUpload.error}</div>}
                        <button type="button" className={styles.removeBtn} onClick={() => setBowlUpload(null)}>✕</button>
                      </div>
                    </div>
                  ) : (
                    <label className={styles.uploadBtn} style={{ cursor: "pointer", alignSelf: "flex-start" }}>
                      + Upload {bowlMode === "product" ? "product photo" : "logo"}
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={e => { const f = e.target.files?.[0]; if (f) setBowlFile(f); e.target.value = ""; }}
                      />
                    </label>
                  )}
                  {bowlOn && !bowlUpload && (
                    <p className={styles.identityWarn}>Upload your {bowlMode === "product" ? "product photo" : "logo"} to continue.</p>
                  )}
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

            {allIdentityRefs.length === 0 && !(signedOut && newUploads.length > 0) && (
              <p className={styles.identityWarn}>Select or upload at least 1 photo to continue.</p>
            )}
            {signedOut && newUploads.length > 0 && (
              <p className={styles.sectionHint} style={{ color: "#2f8e9a", fontWeight: 600 }}>
                {newUploads.length} photo{newUploads.length > 1 ? "s" : ""} ready — sign in below to upload &amp; continue.
              </p>
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
          {signedOut ? (
            <button type="button" className={styles.payBtn} onClick={goSignIn} disabled={resuming}>
              {resuming ? "Taking you to sign in…" : "Sign in with Google to continue →"}
            </button>
          ) : (
            <button type="button" className={styles.payBtn} onClick={book} disabled={!canPay}>
              {buying ? "Redirecting to payment..." : "Pay & Generate"}
            </button>
          )}
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
