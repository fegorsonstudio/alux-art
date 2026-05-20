"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import type { User, Shoot, ShootImage, AspectRatio, Currency, ShootMode, ReferenceTag, ShootPackageSize, PackagePricing } from "@/lib/types";
import { ASPECTS, REFERENCE_TAGS, SHOOT_PACKAGES, normalizePackageSize, packagePrice } from "@/lib/types";
import styles from "./workspace.module.css";

interface UploadedRef { id: string; name: string; type: string; size: number; storageBucket: string; storagePath: string; url: string; tag?: ReferenceTag; customTag?: string; note?: string; }
interface CharacterBaseItem { id: string; user_label?: string | null; base_url?: string | null; attempt_number: number; created_at: string; }
const DEFAULT_PACKAGES: PackagePricing[] = Object.values(SHOOT_PACKAGES).map((pkg) => ({
  imageCount: pkg.imageCount,
  label: pkg.label,
  ngn: packagePrice(15000, pkg.imageCount),
  usd: packagePrice(10, pkg.imageCount),
}));

function sanitizeFileName(name: string) {
  return name.replace(/[\\/]/g, "_").replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, "_");
}

function getShootImages(shoot: Shoot | null): Array<ShootImage & Record<string, unknown>> {
  if (!shoot) return [];
  const canonical = shoot.images;
  const dbImages = (shoot as unknown as { shoot_images?: Array<ShootImage & Record<string, unknown>> }).shoot_images;
  return ((canonical?.length ? canonical : dbImages) ?? []) as Array<ShootImage & Record<string, unknown>>;
}

function getProviderError(img: ShootImage & Record<string, unknown>) {
  const raw = String(img.providerError ?? img.provider_error ?? img.error ?? "").trim();
  try {
    const parsed = JSON.parse(raw);
    if (parsed.forbidden && parsed.flaggedWord) {
      return `Content filter: "${parsed.flaggedWord}" → replaced with "${parsed.replacement}"`;
    }
  } catch { /* not JSON, return raw */ }
  return raw;
}

function getForbiddenMeta(img: ShootImage & Record<string, unknown>): { flaggedWord: string; replacement: string } | null {
  const raw = String(img.providerError ?? img.provider_error ?? "").trim();
  try {
    const parsed = JSON.parse(raw);
    if (parsed.forbidden && parsed.flaggedWord) return { flaggedWord: parsed.flaggedWord, replacement: parsed.replacement };
  } catch { /* not JSON */ }
  return null;
}

function getShootPackageSize(shoot: Shoot | null): ShootPackageSize {
  if (!shoot) return 10;
  return normalizePackageSize(shoot.packageSize ?? (shoot as unknown as Record<string, unknown>).package_size);
}

export default function WorkspacePage() {
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);
  const [packages, setPackages] = useState<PackagePricing[]>(DEFAULT_PACKAGES);

  // Upload state
  const [identityImages, setIdentityImages] = useState<UploadedRef[]>([]);
  const [inspirationImages, setInspirationImages] = useState<UploadedRef[]>([]);
  const [taggedRefs, setTaggedRefs] = useState<UploadedRef[]>([]);

  // Shoot config
  const [mode, setMode] = useState<ShootMode>("fast");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("4:5");
  const [currency, setCurrency] = useState<Currency>("NGN");
  const [packageSize, setPackageSize] = useState<ShootPackageSize>(10);
  const [resolution, setResolution] = useState("1K");
  const [quote, setQuote] = useState({ text: "", attribution: "" });

  // Shoots
  const [shoots, setShoots] = useState<Shoot[]>([]);
  const [currentShoot, setCurrentShoot] = useState<Shoot | null>(null);

  // UI state
  const [status, setStatus] = useState<{ type: "idle" | "loading" | "ok" | "error"; message?: string }>({ type: "idle" });
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadIssue, setUploadIssue] = useState<string>("");
  const [libraryImages, setLibraryImages] = useState<UploadedRef[]>([]);
  const [inspirationLibraryImages, setInspirationLibraryImages] = useState<UploadedRef[]>([]);
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [characterBases, setCharacterBases] = useState<CharacterBaseItem[]>([]);
  const [selectedBase, setSelectedBase] = useState<CharacterBaseItem | null>(null);
  const [reviewBaseUrl, setReviewBaseUrl] = useState<string | null>(null);
  const [reviewAttemptsRemaining, setReviewAttemptsRemaining] = useState(4);
  const [baseAction, setBaseAction] = useState<"idle" | "loading">("idle");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedShootId, setCopiedShootId] = useState<string | null>(null);
  const [editingInspirationId, setEditingInspirationId] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState("");
  const [editingTag, setEditingTag] = useState("");
  // Forbidden word feedback state — slot number → { flaggedWord, replacement, detectedAt }
  const [forbiddenSlots, setForbiddenSlots] = useState<Map<number, { flaggedWord: string; replacement: string; detectedAt: number }>>(new Map());
  const [countdowns, setCountdowns] = useState<Map<number, number>>(new Map());

  const identityRef = useRef<HTMLInputElement>(null);
  const inspirationRef = useRef<HTMLInputElement>(null);
  const taggedRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLDivElement>(null);
  const resumeStartedRef = useRef<Set<string>>(new Set());

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

  // Load user + config + shoots
  useEffect(() => {
    (async () => {
      const [meRes, configRes, shootsRes, libRes, inspirationLibRes, charsRes] = await Promise.all([
        fetch("/api/me"),
        fetch("/api/config"),
        fetch("/api/shoots"),
        fetch("/api/identity-library"),
        fetch("/api/inspiration-library"),
        fetch("/api/characters"),
      ]);
      if (meRes.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (meRes.ok) setUser((await meRes.json()).user);
      if (configRes.ok) {
        const c = await configRes.json();
        if (Array.isArray(c.packages) && c.packages.length > 0) {
          setPackages(c.packages);
        } else if (c.pricing) {
          setPackages(Object.values(SHOOT_PACKAGES).map((pkg) => ({
            imageCount: pkg.imageCount,
            label: pkg.label,
            ngn: packagePrice(c.pricing.ngn, pkg.imageCount),
            usd: packagePrice(c.pricing.usd, pkg.imageCount),
          })));
        }
      }
      if (shootsRes.ok) {
        const shootList: Shoot[] = (await shootsRes.json()).shoots ?? [];
        setShoots(shootList);
        // Auto-open and enrich the most recent shoot with signed preview URLs
        if (shootList.length > 0) {
          const enrichRes = await fetch(`/api/shoots/${shootList[0].id}`);
          if (enrichRes.ok) {
            const enrichData = await enrichRes.json();
            if (enrichData.shoot) {
              setCurrentShoot(enrichData.shoot);
              setShoots(prev => prev.map(p => p.id === enrichData.shoot.id ? enrichData.shoot : p));
            }
          }
        }
      }
      if (libRes.ok) {
        const libData = await libRes.json();
        const imgs: UploadedRef[] = (libData.images ?? []).map((img: Record<string, unknown>) => ({
          id: img.id as string,
          name: img.name as string,
          type: img.type as string,
          size: img.size as number,
          storageBucket: img.storage_bucket as string,
          storagePath: img.storage_path as string,
          url: img.url as string,
        }));
        setLibraryImages(imgs);
      }
      if (inspirationLibRes.ok) {
        const libData = await inspirationLibRes.json();
        const imgs: UploadedRef[] = (libData.images ?? []).map((img: Record<string, unknown>) => ({
          id: img.id as string,
          name: img.name as string,
          type: img.type as string,
          size: img.size as number,
          storageBucket: img.storage_bucket as string,
          storagePath: img.storage_path as string,
          url: img.url as string,
          tag: img.tag as ReferenceTag | undefined,
          note: img.note as string | undefined,
        }));
        setInspirationLibraryImages(imgs);
      }
      if (charsRes.ok) {
        const charsData = await charsRes.json();
        setCharacterBases(charsData.characters ?? []);
      }
    })();
  }, []);

  // SSE listener for active shoot
  const shootIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentShoot) return;
    if (["COMPLETE", "FAILED", "BASE_REJECTED"].includes(currentShoot.status ?? "")) return;
    const isBaseLockState = ["BASE_LOCKING", "BASE_REVIEW"].includes(currentShoot.status ?? "");
    const hasWorkableSlot = getShootImages(currentShoot).some(img => ["PENDING", "QUEUED"].includes(String(img.status)));
    const hasActiveSlot = getShootImages(currentShoot).some(img => ["GENERATING", "UPSCALING"].includes(String(img.status)));
    if (hasWorkableSlot && !hasActiveSlot && !isBaseLockState && !resumeStartedRef.current.has(currentShoot.id)) {
      resumeStartedRef.current.add(currentShoot.id);
      fetch(`/api/shoots/${currentShoot.id}/start`, { method: "POST" }).catch(() => {});
    }
    if (shootIdRef.current === currentShoot.id) return; // already listening
    shootIdRef.current = currentShoot.id;
    const es = new EventSource(`/api/shoots/${currentShoot.id}/events`);
    es.onmessage = (e) => {
      const event = JSON.parse(e.data);
      if (event.type === "snapshot" && event.shoot) {
        setCurrentShoot(event.shoot);
        setShoots(prev => prev.map(s => s.id === event.shoot.id ? event.shoot : s));
      } else if (event.type === "complete") {
        fetch(`/api/shoots/${currentShoot.id}`).then(async (res) => {
          if (!res.ok) return;
          const data = await res.json();
          if (data.shoot) {
            setCurrentShoot(data.shoot);
            setShoots(prev => prev.map(s => s.id === data.shoot.id ? data.shoot : s));
          }
        }).catch(() => {});
      } else if (event.type === "slot_complete" || event.type === "slot_update") {
        setCurrentShoot(prev => {
          if (!prev) return prev;
          const imgs = getShootImages(prev).map(img =>
            img.id === event.image?.id ? { ...img, ...event.image } : img
          );
          const nextStage = event.stage ?? event.error ?? prev.pipelineStage ?? (prev as unknown as Record<string, string>).pipeline_stage;
          return { ...prev, images: imgs, shoot_images: imgs, progress: event.progress ?? prev.progress, pipelineStage: nextStage } as unknown as Shoot;
        });
      } else if (event.type === "stage" || event.type === "base_locking") {
        setCurrentShoot(prev => prev ? { ...prev, pipelineStage: event.stage ?? "Building character base...", progress: event.progress ?? prev.progress } : prev);
      } else if (event.type === "base_review_required") {
        if (event.base_url) setReviewBaseUrl(event.base_url as string);
        setReviewAttemptsRemaining(typeof event.attempts_remaining === "number" ? event.attempts_remaining : 4);
        setCurrentShoot(prev => prev ? { ...prev, status: "BASE_REVIEW" as Shoot["status"], pipelineStage: "Review required" } : prev);
        setShoots(prev => prev.map(s => s.id === currentShoot.id ? { ...s, status: "BASE_REVIEW" as Shoot["status"] } : s));
      } else if (event.type === "base_approved") {
        setReviewBaseUrl(null);
        setCurrentShoot(prev => prev ? { ...prev, status: "QUEUED" as Shoot["status"], pipelineStage: "Base approved — starting generation" } : prev);
        setShoots(prev => prev.map(s => s.id === currentShoot.id ? { ...s, status: "QUEUED" as Shoot["status"] } : s));
      } else if (event.type === "forbidden_detected") {
        const { slot, flaggedWord, replacement } = (event.payload ?? event) as Record<string, unknown>;
        if (typeof slot === "number" && typeof flaggedWord === "string") {
          setForbiddenSlots(prev => {
            const next = new Map(prev);
            next.set(slot, { flaggedWord, replacement: String(replacement ?? ""), detectedAt: Date.now() });
            return next;
          });
        }
      }
    };
    es.onerror = () => es.close();
    return () => { es.close(); shootIdRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentShoot?.id, currentShoot?.status]);

  // Countdown ticker — ticks every second while any forbidden slot is awaiting retry
  useEffect(() => {
    if (forbiddenSlots.size === 0) return;
    const interval = setInterval(() => {
      setCountdowns(() => {
        const next = new Map<number, number>();
        forbiddenSlots.forEach((meta, slot) => {
          const elapsed = Math.floor((Date.now() - meta.detectedAt) / 1000);
          next.set(slot, Math.max(0, 120 - elapsed));
        });
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [forbiddenSlots]);

  // Page-load recovery: derive forbidden state from already-loaded shoot_images
  useEffect(() => {
    if (!currentShoot) return;
    const imgs = getShootImages(currentShoot);
    const recovered = new Map<number, { flaggedWord: string; replacement: string; detectedAt: number }>();
    for (const img of imgs) {
      if (String(img.status) === "FAILED") {
        const meta = getForbiddenMeta(img as ShootImage & Record<string, unknown>);
        if (meta) {
          const updatedAt = String((img as unknown as Record<string, unknown>).updated_at ?? "");
          recovered.set(Number(img.slot), {
            ...meta,
            detectedAt: updatedAt ? new Date(updatedAt).getTime() : Date.now(),
          });
        }
      }
    }
    if (recovered.size > 0) setForbiddenSlots(recovered);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentShoot?.id]);

  // Fetch review base URL when opening a shoot already in BASE_REVIEW
  useEffect(() => {
    if (!currentShoot || currentShoot.status !== "BASE_REVIEW") return;
    if (reviewBaseUrl) return;
    const baseId = (currentShoot as unknown as Record<string, unknown>).character_base_id as string | undefined;
    if (!baseId) return;
    fetch(`/api/characters/${baseId}`)
      .then(r => r.json())
      .then(data => {
        if (data.character?.base_url) setReviewBaseUrl(data.character.base_url);
        if (typeof data.character?.attempt_number === "number") {
          setReviewAttemptsRemaining(Math.max(0, 5 - data.character.attempt_number));
        }
      })
      .catch(() => {});
  }, [currentShoot?.status, currentShoot?.id]);

  const uploadFile = useCallback(async (file: File, bucket: string, saveLib = false): Promise<UploadedRef | null> => {
    const key = `${file.name}-${file.size}`;
    setUploadIssue("");
    setUploadProgress(prev => ({ ...prev, [key]: 0 }));
    const done = () => setUploadProgress(prev => { const n = { ...prev }; delete n[key]; return n; });
    try {
      if (!user?.id) throw new Error("Sign in again before uploading");

      // Resize files >10MB client-side before upload (preserves quality at max 4000px)
      const TEN_MB = 10 * 1024 * 1024;
      const fileToUpload = file.size <= TEN_MB ? file : await new Promise<File>((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(url);
          const MAX_DIM = 4000;
          const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext("2d");
          ctx!.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(blob => {
            if (!blob) { reject(new Error("Resize failed")); return; }
            resolve(new File([blob], file.name, { type: "image/jpeg" }));
          }, "image/jpeg", 0.85);
        };
        img.onerror = () => reject(new Error("Image load failed"));
        img.src = url;
      });

      // Step 1: get presigned upload URL from server (auth only, no file bytes)
      const presignRes = await fetch("/api/upload/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: fileToUpload.name, contentType: fileToUpload.type, size: fileToUpload.size, bucket, saveToLibrary: saveLib }),
      });
      if (!presignRes.ok) {
        const err = await presignRes.json().catch(() => ({}));
        throw new Error(err.error ?? `Presign failed (${presignRes.status})`);
      }
      const meta = await presignRes.json();

      // Step 2: PUT bytes directly to Supabase CDN via XHR for real progress tracking
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.timeout = 120_000;
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable)
            setUploadProgress(prev => ({ ...prev, [key]: Math.round((e.loaded / e.total) * 95) }));
        });
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed (${xhr.status})`));
        });
        xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
        xhr.addEventListener("timeout", () => reject(new Error("Upload timed out — try again")));
        xhr.open("PUT", meta.uploadUrl);
        xhr.setRequestHeader("Content-Type", fileToUpload.type);
        xhr.send(fileToUpload);
      });

      setUploadProgress(prev => ({ ...prev, [key]: 96 }));
      const finalizeRes = await fetch("/api/upload", {
        method: "POST",
        body: new URLSearchParams({
          saveToLibrary: saveLib ? "true" : "false",
          id: meta.id,
          filename: meta.name,
          contentType: meta.type,
          size: String(meta.size),
          storageBucket: meta.storageBucket,
          storagePath: meta.storagePath,
        }),
      });
      const finalizeData = await finalizeRes.json().catch(() => null);
      if (!finalizeRes.ok || !finalizeData?.image) {
        throw new Error(finalizeData?.error ?? `Upload finalize failed (${finalizeRes.status})`);
      }

      setUploadProgress(prev => ({ ...prev, [key]: 100 }));
      done();
      return finalizeData.image as UploadedRef;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      setUploadIssue(`${file.name}: ${message}`);
      setStatus({ type: "error", message });
      done();
      return null;
    }
  }, [user]);

  const handleIdentityFiles = async (files: FileList) => {
    setUploading("identity");
    const results = await Promise.all(Array.from(files).map(f => uploadFile(f, "identity-images", saveToLibrary)));
    const ok = results.filter((r): r is UploadedRef => r !== null);
    if (ok.length) {
      setIdentityImages(prev => [...prev, ...ok]);
      if (saveToLibrary) setLibraryImages(prev => [...prev, ...ok.filter(o => !prev.some(p => p.id === o.id))]);
    }
    setUploading(null);
  };

  const handleAddFromLibrary = (img: UploadedRef) => {
    setIdentityImages(prev =>
      prev.some(i => i.id === img.id) ? prev.filter(i => i.id !== img.id) : [...prev, img]
    );
  };

  const handleClearLibrary = async () => {
    await fetch("/api/identity-library", { method: "DELETE" });
    setLibraryImages([]);
    setIdentityImages(prev => prev.filter(img => !libraryImages.some(l => l.id === img.id)));
  };

  const handleAddFromInspirationLibrary = async (img: UploadedRef) => {
    setInspirationImages(prev =>
      prev.some(i => i.id === img.id) ? prev.filter(i => i.id !== img.id) : [...prev, img]
    );
    fetch("/api/inspiration-library", {
      method: "PATCH",
      body: new URLSearchParams({ id: img.id }),
    }).catch(() => {});
  };

  const handleClearInspirationLibrary = async () => {
    await fetch("/api/inspiration-library", { method: "DELETE" });
    setInspirationLibraryImages([]);
    setInspirationImages(prev => prev.filter(img => !inspirationLibraryImages.some(l => l.id === img.id)));
  };

  const handleDeleteInspirationLibraryImage = async (imgId: string) => {
    await fetch(`/api/inspiration-library?id=${imgId}`, { method: "DELETE" });
    setInspirationLibraryImages(prev => prev.filter(i => i.id !== imgId));
    setInspirationImages(prev => prev.filter(i => i.id !== imgId));
    if (editingInspirationId === imgId) setEditingInspirationId(null);
  };

  const handleSaveInspirationMeta = async (imgId: string, tag: string, note: string) => {
    await fetch("/api/inspiration-library", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: imgId, tag: tag || null, note: note || null }),
    });
    const update = { tag: (tag as ReferenceTag) || undefined, note: note || undefined };
    setInspirationLibraryImages(prev => prev.map(i => i.id === imgId ? { ...i, ...update } : i));
    setInspirationImages(prev => prev.map(i => i.id === imgId ? { ...i, ...update } : i));
    setEditingInspirationId(null);
  };

  const handleInspirationFiles = async (files: FileList) => {
    setUploading("inspiration");
    const results = await Promise.all(Array.from(files).map(f => uploadFile(f, "inspiration-images", true)));
    const ok = results.filter((r): r is UploadedRef => r !== null);
    if (ok.length) {
      setInspirationImages(prev => [...prev, ...ok]);
      setInspirationLibraryImages(prev => [...ok.filter(o => !prev.some(p => p.id === o.id)), ...prev]);
    }
    setUploading(null);
  };

  const handleTaggedFiles = async (files: FileList) => {
    setUploading("tagged");
    const results = await Promise.all(Array.from(files).map(f => uploadFile(f, "inspiration-images")));
    const ok = results.filter((r): r is UploadedRef => r !== null);
    if (ok.length) setTaggedRefs(prev => [...prev, ...ok]);
    setUploading(null);
  };

  const handleRetrySlot = async (slot: number) => {
    if (!currentShoot) return;
    try {
      await fetch(`/api/shoots/${currentShoot.id}/slots/${slot}/retry`, { method: "POST" });
      // SSE will deliver slot_update → QUEUED then COMPLETE, updating UI automatically
    } catch { /* ignore */ }
  };

  const handleRecompositeQuote = async () => {
    if (!currentShoot) return;
    setStatus({ type: "loading", message: "Recompositing quote card..." });
    try {
      const res = await fetch(`/api/shoots/${currentShoot.id}/recomposite-quote`, { method: "POST" });
      if (res.ok) {
        setStatus({ type: "ok", message: "Quote card updated! Refresh to see the new version." });
        // Refresh the shoot to get new signed URL
        const json = await fetch(`/api/shoots/${currentShoot.id}`).then(r => r.json()).catch(() => null);
        if (json?.shoot) setShoots(prev => prev.map(s => s.id === currentShoot.id ? { ...s, ...json.shoot } : s));
      } else {
        const { error } = await res.json().catch(() => ({ error: "Unknown error" }));
        setStatus({ type: "error", message: error ?? "Recomposite failed" });
      }
    } catch (e) {
      setStatus({ type: "error", message: String(e) });
    }
  };

  const handleApproveBase = async () => {
    if (!currentShoot || baseAction === "loading") return;
    setBaseAction("loading");
    const res = await fetch(`/api/shoots/${currentShoot.id}/base-lock/approve`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setReviewBaseUrl(null);
      setStatus({ type: "ok", message: "Base approved — generating your photos now..." });
      setCurrentShoot(prev => prev ? { ...prev, status: "QUEUED" as Shoot["status"] } : prev);
      setShoots(prev => prev.map(s => s.id === currentShoot.id ? { ...s, status: "QUEUED" as Shoot["status"] } : s));
      // Re-fetch character bases so it appears in library
      fetch("/api/characters").then(r => r.json()).then(d => setCharacterBases(d.characters ?? [])).catch(() => {});
    } else {
      setStatus({ type: "error", message: data.error ?? "Approve failed" });
    }
    setBaseAction("idle");
  };

  const handleRejectBase = async () => {
    if (!currentShoot || baseAction === "loading") return;
    setBaseAction("loading");
    const res = await fetch(`/api/shoots/${currentShoot.id}/base-lock/reject`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setReviewBaseUrl(null);
      if (data.terminal) {
        setStatus({ type: "error", message: "All 5 base attempts exhausted. Contact support for a refund." });
        setCurrentShoot(prev => prev ? { ...prev, status: "BASE_REJECTED" as Shoot["status"] } : prev);
        setShoots(prev => prev.map(s => s.id === currentShoot.id ? { ...s, status: "BASE_REJECTED" as Shoot["status"] } : s));
      } else {
        const left = data.attemptsRemaining ?? 0;
        setStatus({ type: "ok", message: `Re-rolling... ${left} attempt${left !== 1 ? "s" : ""} remaining.` });
        setCurrentShoot(prev => prev ? { ...prev, status: "BASE_LOCKING" as Shoot["status"], pipelineStage: "Re-rolling character base..." } : prev);
        setShoots(prev => prev.map(s => s.id === currentShoot.id ? { ...s, status: "BASE_LOCKING" as Shoot["status"] } : s));
      }
    } else {
      setStatus({ type: "error", message: data.error ?? "Re-roll failed" });
    }
    setBaseAction("idle");
  };

  const openShootGallery = async (shoot: Shoot) => {
    setCurrentShoot(shoot);
    setTimeout(() => galleryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);

    const res = await fetch(`/api/shoots/${shoot.id}`);
    if (res.ok) {
      const data = await res.json();
      if (data.shoot) {
        setCurrentShoot(data.shoot);
        setShoots(prev => prev.map(p => p.id === data.shoot.id ? data.shoot : p));
        setTimeout(() => galleryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      }
    }
  };

  const handleDeleteShoot = async (shootId: string) => {
    setDeletingId(shootId);
    try {
      const res = await fetch(`/api/shoots/${shootId}`, { method: "DELETE" });
      if (res.ok) {
        setShoots(prev => prev.filter(s => s.id !== shootId));
        if (currentShoot?.id === shootId) setCurrentShoot(null);
      }
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  const handleCreateAndPay = async (adminBypass = false) => {
    if (!canCreate || status.type === "loading") return;
    setStatus({ type: "loading", message: "Creating shoot..." });
    try {
      const res = await fetch("/api/shoots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode, aspectRatio, currency,
          packageSize,
          identityImages: identityImages.map(({ id, name, type, size, storageBucket, storagePath }) => ({ id, name, type, size, storageBucket, storagePath })),
          inspirationImages: inspirationImages.map(({ id, name, type, size, storageBucket, storagePath }) => ({ id, name, type, size, storageBucket, storagePath })),
          taggedReferences: taggedRefs.map(({ id, name, type, size, storageBucket, storagePath, tag, customTag, note }) => ({
            id,
            name,
            type,
            size,
            storageBucket,
            storagePath,
            tag: customTag?.trim() ? null : tag || null,
            customName: customTag?.trim() || null,
            note: note?.trim() || null,
          })),
          quote, adminBypass,
          characterBaseId: selectedBase?.id ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setStatus({ type: "error", message: data.error }); return; }

      const shoot: Shoot = data.shoot;
      setShoots(prev => [shoot, ...prev]);
      setCurrentShoot(shoot);

      if (adminBypass) {
        setStatus({ type: "ok", message: "Your shoot is queued! Generating professional images — check back in about 1 hour." });
        resumeStartedRef.current.add(shoot.id); // prevent useEffect double-start
        fetch(`/api/shoots/${shoot.id}/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resolution }),
        }).catch(() => {});
        return;
      }

      // Initiate payment
      setStatus({ type: "loading", message: "Opening payment..." });
      const payRes = await fetch(`/api/shoots/${shoot.id}/pay`, { method: "POST" });
      const payData = await payRes.json();
      if (!payRes.ok) { setStatus({ type: "error", message: payData.error }); return; }
      if (payData.bypass) { setStatus({ type: "ok", message: "Generating..." }); return; }

      // Open Paystack
      window.location.href = payData.authorization_url;
    } catch (e) {
      setStatus({ type: "error", message: String(e) });
    }
  };

  const downloadImage = async (shoot: Shoot, img: ShootImage) => {
    const res = await fetch(`/api/shoots/${shoot.id}/images/${img.id}?download=1`);
    if (!res.ok) return;
    const blob = await res.blob();
    const filename = `aluxart-slot${img.slot}-${img.kind}.png`;

    // On mobile with Web Share API, share the file so it can be saved to the Photos gallery
    if (typeof navigator !== "undefined" && "share" in navigator) {
      const file = new File([blob], filename, { type: blob.type || "image/png" });
      let canShareFiles = false;
      try {
        canShareFiles = typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
      } catch { /* canShare may throw on unsupported arguments */ }
      if (canShareFiles) {
        try {
          await navigator.share({ files: [file], title: "Alux Art Photo" });
          return;
        } catch (shareErr) {
          if ((shareErr as Error).name === "AbortError") {
            // User dismissed without saving — fall through to anchor download
          } else {
            // Non-abort share failure — fall through to anchor download
          }
        }
      }
    }

    // Desktop / unsupported browsers: anchor element download
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const downloadZip = async (shoot: Shoot) => {
    setStatus({ type: "loading", message: "Preparing ZIP..." });
    const res = await fetch(`/api/shoots/${shoot.id}/download-zip`);
    const { url, error } = await res.json();
    if (url) {
      const a = document.createElement("a");
      a.href = url;
      a.download = `aluxart-shoot-${shoot.id.slice(0, 8)}.zip`;
      a.target = "_blank";
      a.click();
      setStatus({ type: "ok", message: "ZIP ready!" });
    } else {
      setStatus({ type: "error", message: error ?? "ZIP failed" });
    }
  };

  const signOut = async () => { await supabase.auth.signOut(); window.location.href = "/login"; };
  const isAdmin = user?.role === "admin";
  const canCreate = identityImages.length >= 3 && inspirationImages.length >= 1;
  const activePackage = packages.find((pkg) => pkg.imageCount === packageSize) ?? DEFAULT_PACKAGES.find((pkg) => pkg.imageCount === packageSize)!;
  const activePrice = currency === "USD" ? activePackage.usd : activePackage.ngn;
  const price = currency === "USD" ? `$${activePrice}` : `NGN ${activePrice.toLocaleString()}`;
  const galleryImages = getShootImages(currentShoot);
  const completedCount = galleryImages.filter((img) => img.status === "COMPLETE").length;
  const failedCount = galleryImages.filter((img) => img.status === "FAILED").length;
  const activeSlotCount = galleryImages.filter((img) => ["GENERATING", "UPSCALING"].includes(String(img.status))).length;
  const queuedSlotCount = galleryImages.filter((img) => ["PENDING", "QUEUED"].includes(String(img.status))).length;
  const activeStage = currentShoot
    ? (completedCount || failedCount)
      ? `${completedCount}/${galleryImages.length} complete${failedCount ? `, ${failedCount} failed` : ""}`
      : activeSlotCount
        ? `${activeSlotCount} active, ${queuedSlotCount} queued`
      : (currentShoot.pipelineStage || (currentShoot as unknown as Record<string, string>).pipeline_stage || currentShoot.status)
    : "";

  return (
    <div className={styles.app} data-theme={theme}>
      {/* Nav */}
      <nav className={styles.nav}>
        <div className={styles.navBrand}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Alux Art" className={styles.navLogo} />
          Alux Art
        </div>
        <div className={styles.navRight}>
          <Link href="/marketplace" className={styles.adminLink}>Marketplace</Link>
          {isAdmin && <a href="/admin" className={styles.adminLink}>Admin</a>}
          <span className={styles.navEmail}>{user?.email}</span>
          <button className={styles.themeToggle} onClick={toggleTheme} aria-pressed={theme === "dark"}>
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          <button className={styles.signOutBtn} onClick={signOut}>Sign out</button>
        </div>
      </nav>

      <div className={styles.main}>
        {/* LEFT: Controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Saved character bases */}
          {characterBases.length > 0 && (
            <div className={styles.panel}>
              <div className={styles.panelTitleRow}>
                <p className={styles.panelTitle}>Saved Characters</p>
                {selectedBase && (
                  <button className={styles.clearLibBtn} onClick={() => setSelectedBase(null)}>Clear</button>
                )}
              </div>
              <p className={styles.helperText}>Select a saved character to reuse — skips base generation entirely.</p>
              <div className={styles.thumbGrid}>
                {characterBases.map(base => {
                  const isSelected = selectedBase?.id === base.id;
                  return (
                    <button key={base.id} type="button"
                      className={`${styles.thumb} ${isSelected ? styles.thumbSelected : ""}`}
                      onClick={() => setSelectedBase(isSelected ? null : base)}
                      title={base.user_label ?? `Base from ${new Date(base.created_at).toLocaleDateString()}`}>
                      {base.base_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={base.base_url} alt={base.user_label ?? "Character base"} />
                      ) : (
                        <span className={styles.baseNoThumb}>?</span>
                      )}
                      {isSelected && <span className={styles.thumbCheck}>OK</span>}
                    </button>
                  );
                })}
              </div>
              {selectedBase && (
                <p className={styles.libLabel}>Using saved character — base generation skipped</p>
              )}
            </div>
          )}

          {/* Identity photos */}
          <div className={styles.panel}>
            <div className={styles.panelTitleRow}>
              <p className={styles.panelTitle}>Identity Photos (min. 3)</p>
              {libraryImages.length > 0 && (
                <button className={styles.clearLibBtn} onClick={handleClearLibrary}>Clear library</button>
              )}
            </div>

            {/* Saved library */}
            {libraryImages.length > 0 && (
              <div>
                <p className={styles.libLabel}>Your library - tap to select/deselect</p>
                <div className={styles.thumbGrid}>
                  {libraryImages.map(img => {
                    const selected = identityImages.some(i => i.id === img.id);
                    return (
                      <button key={img.id} type="button" className={`${styles.thumb} ${selected ? styles.thumbSelected : ""}`}
                        onClick={() => handleAddFromLibrary(img)} aria-pressed={selected}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.url} alt={img.name} />
                        {selected && <span className={styles.thumbCheck}>OK</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Session-only (not in library) */}
            {identityImages.filter(img => !libraryImages.some(l => l.id === img.id)).length > 0 && (
              <div className={styles.thumbGrid}>
                {identityImages.filter(img => !libraryImages.some(l => l.id === img.id)).map(img => (
                  <div key={img.id} className={styles.thumb}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={img.name} />
                    <button className={styles.thumbRemove} onClick={() => setIdentityImages(p => p.filter(i => i.id !== img.id))}>x</button>
                  </div>
                ))}
              </div>
            )}

            {/* Upload zone with per-file progress */}
            <div className={styles.uploadZone} onClick={() => identityRef.current?.click()}>
              <input ref={identityRef} type="file" accept="image/*" multiple style={{ display: "none" }}
                onChange={e => e.target.files && handleIdentityFiles(e.target.files)} />
              {uploading === "identity" && Object.keys(uploadProgress).length > 0 ? (
                <div className={styles.progressList}>
                  {Object.entries(uploadProgress).map(([key, pct]) => (
                    <div key={key} className={styles.progressItem}>
                      <span className={styles.progressName}>{key.replace(/-\d+$/, "")}</span>
                      <div className={styles.progressTrack}><div className={styles.progressFill} style={{ width: `${pct}%` }} /></div>
                      <span className={styles.progressPct}>{pct}%</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p>{uploading === "identity" ? "Processing..." : "Click to add identity photos"}</p>
              )}
              <p className={styles.uploadCount}>{identityImages.length}/3 minimum</p>
            </div>

            {/* Save to library toggle */}
            <label className={styles.saveToggle}>
              <input type="checkbox" checked={saveToLibrary} onChange={e => setSaveToLibrary(e.target.checked)} />
              <span>Save to my identity library</span>
            </label>
            {uploadIssue && <p className={styles.uploadIssue}>{uploadIssue}</p>}
          </div>

          {/* Inspiration photos */}
          <div className={styles.panel}>
            <div className={styles.panelTitleRow}>
              <p className={styles.panelTitle}>Inspiration (min. 1)</p>
              {inspirationLibraryImages.length > 0 && (
                <button className={styles.clearLibBtn} onClick={handleClearInspirationLibrary}>Clear library</button>
              )}
            </div>

            {inspirationLibraryImages.length > 0 && (
              <div>
                <p className={styles.libLabel}>Saved inspiration — tap to select/deselect</p>
                <div className={styles.thumbGrid}>
                  {inspirationLibraryImages.map(img => {
                    const selected = inspirationImages.some(i => i.id === img.id);
                    const isEditing = editingInspirationId === img.id;
                    return (
                      <div key={img.id}
                        role="button" tabIndex={0} aria-pressed={selected}
                        className={`${styles.thumb} ${selected ? styles.thumbSelected : ""}`}
                        onClick={() => handleAddFromInspirationLibrary(img)}
                        onKeyDown={e => e.key === "Enter" && handleAddFromInspirationLibrary(img)}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.url} alt={img.name} />
                        {selected && <span className={styles.thumbCheck}>OK</span>}
                        {img.tag && (
                          <span className={styles.thumbTag}>
                            {img.tag.replace(/_/g, " ")}
                          </span>
                        )}
                        <button type="button" className={styles.libDeleteBtn}
                          onClick={e => { e.stopPropagation(); handleDeleteInspirationLibraryImage(img.id); }}
                          title="Delete permanently">✕</button>
                        <button type="button" className={`${styles.libEditBtn} ${isEditing ? styles.libEditBtnActive : ""}`}
                          onClick={e => {
                            e.stopPropagation();
                            if (isEditing) { setEditingInspirationId(null); } else {
                              setEditingInspirationId(img.id);
                              setEditingNote(img.note ?? "");
                              setEditingTag(img.tag ?? "");
                            }
                          }}
                          title="Edit tag & note">✎</button>
                      </div>
                    );
                  })}
                </div>

                {/* Inline edit panel */}
                {editingInspirationId && (() => {
                  const img = inspirationLibraryImages.find(i => i.id === editingInspirationId);
                  if (!img) return null;
                  return (
                    <div className={styles.libEditPanel}>
                      <p className={styles.libEditTitle}>{img.name}</p>
                      <div className={styles.libEditRow}>
                        <label className={styles.libEditLabel}>Tag</label>
                        <select className={styles.libEditSelect} value={editingTag} onChange={e => setEditingTag(e.target.value)}>
                          <option value="">None</option>
                          {REFERENCE_TAGS.map(t => (
                            <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                          ))}
                        </select>
                      </div>
                      <div className={styles.libEditRow}>
                        <label className={styles.libEditLabel}>Note</label>
                        <textarea className={styles.libEditNote} value={editingNote}
                          onChange={e => setEditingNote(e.target.value)}
                          placeholder="e.g. summer shoot, street style..." rows={2} />
                      </div>
                      <div className={styles.libEditActions}>
                        <button className={styles.libEditSave}
                          onClick={() => handleSaveInspirationMeta(editingInspirationId, editingTag, editingNote)}>
                          Save
                        </button>
                        <button className={styles.libEditCancel} onClick={() => setEditingInspirationId(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {inspirationImages.filter(img => !inspirationLibraryImages.some(l => l.id === img.id)).length > 0 && (
              <div className={styles.thumbGrid}>
                {inspirationImages.filter(img => !inspirationLibraryImages.some(l => l.id === img.id)).map(img => (
                  <div key={img.id} className={styles.thumb}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={img.name} />
                    <button className={styles.thumbRemove} onClick={() => setInspirationImages(p => p.filter(i => i.id !== img.id))}>x</button>
                  </div>
                ))}
              </div>
            )}
            <div className={styles.uploadZone} onClick={() => inspirationRef.current?.click()}>
              <input ref={inspirationRef} type="file" accept="image/*" multiple style={{ display: "none" }}
                onChange={e => e.target.files && handleInspirationFiles(e.target.files)} />
              <p>{uploading === "inspiration" ? "Uploading..." : "Click to add mood/inspiration photos"}</p>
            </div>
          </div>

          {/* Tagged References - advanced mode only */}
          {mode === "advanced" && (
            <div className={styles.panel}>
              <p className={styles.panelTitle}>Tagged References</p>
              <p className={styles.helperText}>We extract only the tagged element from each image. For best results, use clear, well-lit references.</p>
              {taggedRefs.length > 0 && (
                <div className={styles.taggedList}>
                  {taggedRefs.map(ref => (
                    <div key={ref.id} className={styles.taggedRow}>
                      <div className={styles.taggedThumb}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={ref.url} alt={ref.name} />
                      </div>
                      <div className={styles.taggedControls}>
                        <div className={styles.tagPills}>
                          {REFERENCE_TAGS.map(t => (
                            <button key={t} className={`${styles.tagPill} ${ref.tag === t && !ref.customTag ? styles.tagPillActive : ""}`}
                              onClick={() => setTaggedRefs(prev => prev.map(r => r.id === ref.id ? { ...r, tag: t, customTag: undefined } : r))}>
                              {t.replace("_", " ")}
                            </button>
                          ))}
                        </div>
                        <input
                          className={styles.customTagInput}
                          placeholder="Custom tag..."
                          value={ref.customTag ?? ""}
                          onChange={e => setTaggedRefs(prev => prev.map(r => r.id === ref.id ? { ...r, customTag: e.target.value, tag: undefined } : r))}
                        />
                        <textarea
                          className={styles.refNoteInput}
                          placeholder="Styling direction (optional)..."
                          rows={2}
                          value={ref.note ?? ""}
                          onChange={e => setTaggedRefs(prev => prev.map(r => r.id === ref.id ? { ...r, note: e.target.value } : r))}
                        />
                        <button className={styles.thumbRemove} style={{ position: "static" }} onClick={() => setTaggedRefs(p => p.filter(r => r.id !== ref.id))}>x Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className={styles.uploadZone} onClick={() => taggedRef.current?.click()}>
                <input ref={taggedRef} type="file" accept="image/*" multiple style={{ display: "none" }}
                  onChange={e => e.target.files && handleTaggedFiles(e.target.files)} />
                <p>{uploading === "tagged" ? "Uploading..." : "Add reference images and tag each one"}</p>
                <p className={styles.uploadCount}>OUTFIT / HAIRSTYLE / MAKEUP / NAIL / BACKGROUND / LIGHTING / COLOR GRADE</p>
              </div>
            </div>
          )}

          {/* Settings */}
          <div className={styles.panel}>
            <div className={styles.row}>
              <p className={styles.label}>Mode</p>
              <div className={styles.pillGroup}>
                {(["fast", "advanced"] as ShootMode[]).map(m => (
                  <button key={m} className={`${styles.pill} ${mode === m ? styles.pillActive : ""}`} onClick={() => setMode(m)}>{m}</button>
                ))}
              </div>
            </div>
            <div className={styles.row}>
              <p className={styles.label}>Aspect Ratio</p>
              <div className={styles.pillGroup}>
                {(Object.keys(ASPECTS) as AspectRatio[]).map(ar => (
                  <button key={ar} className={`${styles.pill} ${aspectRatio === ar ? styles.pillActive : ""}`} onClick={() => setAspectRatio(ar)}>{ASPECTS[ar].label}</button>
                ))}
              </div>
            </div>
            <div className={styles.row}>
              <p className={styles.label}>Currency</p>
              <div className={styles.pillGroup}>
                {(["NGN", "USD"] as Currency[]).map(c => (
                  <button key={c} className={`${styles.pill} ${currency === c ? styles.pillActive : ""}`} onClick={() => setCurrency(c)}>{c}</button>
                ))}
              </div>
            </div>
            <div className={styles.row}>
              <p className={styles.label}>Package</p>
              <div className={styles.packageGrid}>
                {packages.map(pkg => {
                  const selected = packageSize === pkg.imageCount;
                  const pkgPrice = currency === "USD" ? `$${pkg.usd}` : `NGN ${pkg.ngn.toLocaleString()}`;
                  return (
                    <button
                      key={pkg.imageCount}
                      type="button"
                      className={`${styles.packageOption} ${selected ? styles.packageOptionActive : ""}`}
                      onClick={() => setPackageSize(pkg.imageCount)}
                    >
                      <span>{pkg.label}</span>
                      <strong>{pkgPrice}</strong>
                    </button>
                  );
                })}
              </div>
              <p className={styles.pricingNote}>Paid slots stay retryable for 48 hours if a generation fails.</p>
            </div>
          </div>

          {/* Quote */}
          <div className={styles.panel}>
            <p className={styles.panelTitle}>Quote (optional)</p>
            <textarea className={styles.quoteInput} rows={2} placeholder="Inspirational quote text..." value={quote.text} onChange={e => setQuote(q => ({ ...q, text: e.target.value }))} />
            <input className={styles.quoteInput} placeholder="- Attribution" value={quote.attribution} onChange={e => setQuote(q => ({ ...q, attribution: e.target.value }))} />
          </div>

          {/* CTA */}
          <div className={styles.ctaSection}>
            {!canCreate && (
              <p className={styles.validationNote}>
                {identityImages.length < 3 ? `Add ${3 - identityImages.length} more identity photo${3 - identityImages.length !== 1 ? "s" : ""}` : "Add at least 1 inspiration photo"}
              </p>
            )}
            <button className={styles.payBtn} disabled={!canCreate || status.type === "loading"} onClick={() => handleCreateAndPay(false)}>
              Pay {price} & Generate {packageSize}
            </button>
            {isAdmin && (
              <div className={styles.adminControls}>
                <div className={styles.adminControlRow}>
                  <p className={styles.adminControlLabel}>Resolution</p>
                  <div className={styles.pillGroup}>
                    {(["", "0.5K", "1K", "2K", "4K"] as const).map((r) => (
                      <button
                        key={r || "default"}
                        className={`${styles.pill} ${resolution === r ? styles.pillActive : ""}`}
                        onClick={() => setResolution(r)}
                      >
                        {r || "Default"}
                      </button>
                    ))}
                  </div>
                </div>
                <button className={styles.adminBypassBtn} disabled={!canCreate || status.type === "loading"} onClick={() => handleCreateAndPay(true)}>
                  Admin: Generate Free
                </button>
              </div>
            )}
          </div>

          {/* Status */}
          {status.type !== "idle" && (
            <div className={`${styles.statusBar} ${status.type === "error" ? styles.statusBarError : status.type === "ok" ? styles.statusBarOk : ""}`}>
              {status.type === "loading" && <span className={styles.miniSpinner} />}
              {status.message}
            </div>
          )}
        </div>

        {/* RIGHT: Shoots + Gallery */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Shoots list */}
          {shoots.length > 0 && (
            <div className={styles.panel}>
              <p className={styles.panelTitle}>Your Shoots ({shoots.length})</p>
              <div className={styles.shootsList}>
                {shoots.map(s => {
                  const isActive = ["PROCESSING","QUEUED","BASE_LOCKING","BASE_REVIEW"].includes(s.status ?? "");
                  const isConfirming = confirmDeleteId === s.id;
                  const isDeleting = deletingId === s.id;
                  return (
                    <div key={s.id} className={`${styles.shootRow} ${currentShoot?.id === s.id ? styles.shootRowActive : ""}`}>
                      <button type="button" className={styles.shootCard} onClick={() => openShootGallery(s)}>
                        <div className={styles.shootMeta}>
                          <span style={{ fontSize: "0.85rem" }}>
                            {(s as unknown as Record<string, string>).aspect_ratio || s.aspectRatio} / {s.mode} / {getShootPackageSize(s)} images
                          </span>
                          <span className={styles.shootDate}>
                            {(() => { const d = new Date((s as unknown as Record<string, string>).created_at || s.createdAt); return `${d.toLocaleDateString()} · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`; })()}
                          </span>
                          <button
                            type="button"
                            className={styles.copyIdBtn}
                            onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(s.id).then(() => { setCopiedShootId(s.id); setTimeout(() => setCopiedShootId(prev => prev === s.id ? null : prev), 1500); }); }}
                          >
                            {copiedShootId === s.id ? "Copied!" : "Copy ID"}
                          </button>
                        </div>
                        <span className={styles.shootActions}>
                          <span className={`${styles.statusBadge} ${styles[`status${(s.status ?? "").replace(/_/g, "").charAt(0).toUpperCase() + (s.status ?? "").replace(/_/g, "").slice(1).toLowerCase()}` as keyof typeof styles] ?? ""}`}>
                            {s.status === "BASE_LOCKING" ? "Locking" : s.status === "BASE_REVIEW" ? "Review" : s.status === "BASE_REJECTED" ? "Rejected" : s.status}
                          </span>
                          <span className={styles.openGalleryLabel}>Open gallery</span>
                        </span>
                      </button>
                      {/* Delete controls */}
                      {!isConfirming && (
                        <button
                          className={`${styles.deleteShootBtn} ${isActive ? styles.deleteShootBtnActive : ""}`}
                          title={isActive ? "Stop & delete" : "Delete shoot"}
                          onClick={() => setConfirmDeleteId(s.id)}
                          disabled={isDeleting}
                        >
                          {isDeleting ? "…" : isActive ? "Stop" : "✕"}
                        </button>
                      )}
                      {isConfirming && (
                        <span className={styles.deleteConfirm}>
                          <button className={styles.deleteConfirmYes} onClick={() => handleDeleteShoot(s.id)} disabled={isDeleting}>
                            {isDeleting ? "…" : "Delete"}
                          </button>
                          <button className={styles.deleteConfirmNo} onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Gallery */}
          {currentShoot && (
            <div className={styles.panel} ref={galleryRef}>
              <div className={styles.galleryHeader}>
                <p className={styles.panelTitle}>Gallery</p>
                <span className={styles.galleryMeta}>{activeStage}</span>
              </div>

              {/* Progress */}
              {(currentShoot.status === "PROCESSING" || currentShoot.status === "QUEUED") && (
                <>
                  <div className={styles.progressBar}>
                    <div className={styles.galleryFill} style={{ width: `${currentShoot.progress ?? 0}%` }} />
                  </div>
                  <div className={styles.processingNotice}>
                    <span className={styles.processingIcon}>⏱</span>
                    <div>
                      <p className={styles.processingTitle}>Generating your professional images</p>
                      <p className={styles.processingBody}>High-quality images are heavy files that take time to render. Check back in about <strong>1 hour</strong> — we&apos;ll also send you an email when they&apos;re ready.</p>
                    </div>
                  </div>
                </>
              )}

              {/* Base locking — in progress */}
              {currentShoot.status === "BASE_LOCKING" && (
                <div className={styles.baseLockingBanner}>
                  <span className={styles.slotSpinner} />
                  <div>
                    <p className={styles.baseLockingTitle}>Building your character base...</p>
                    <p className={styles.baseLockingHint}>We&apos;re generating a canonical identity reference. This takes 30–90 seconds.</p>
                  </div>
                </div>
              )}

              {/* Base review — user approval required */}
              {currentShoot.status === "BASE_REVIEW" && (
                <div className={styles.baseReviewBanner}>
                  <p className={styles.baseReviewTitle}>Does this look like you?</p>
                  <p className={styles.baseReviewHint}>This is your character base — the identity anchor for all your generated photos. Approve if the likeness is accurate, or re-roll to generate a new one.</p>
                  {reviewBaseUrl ? (
                    <div className={styles.baseReviewContent}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={reviewBaseUrl} alt="Character base preview" className={styles.baseReviewImg} />
                      <div className={styles.baseReviewActions}>
                        <button className={styles.baseApproveBtn} onClick={handleApproveBase} disabled={baseAction === "loading"}>
                          {baseAction === "loading" ? "..." : "Looks good — generate my photos"}
                        </button>
                        <button className={styles.baseRejectBtn} onClick={handleRejectBase} disabled={baseAction === "loading"}>
                          {baseAction === "loading" ? "..." : `Re-roll${reviewAttemptsRemaining > 0 ? ` (${reviewAttemptsRemaining} left)` : ""}`}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.baseLockingBanner}>
                      <span className={styles.slotSpinner} />
                      <span>Loading preview...</span>
                    </div>
                  )}
                </div>
              )}

              {/* Base rejected — terminal */}
              {currentShoot.status === "BASE_REJECTED" && (
                <div className={styles.baseRejectedBanner}>
                  <p className={styles.baseRejectedTitle}>All base attempts exhausted</p>
                  <p className={styles.baseRejectedHint}>Please upload clearer, well-lit front-facing identity photos and start a new shoot, or contact support for a refund.</p>
                </div>
              )}

              {/* Image grid */}
              <div className={styles.slotGrid}>
                {galleryImages.map((img) => {
                  const providerError = getProviderError(img);
                  const forbidden = forbiddenSlots.get(Number(img.slot));
                  const remaining = forbidden ? (countdowns.get(Number(img.slot)) ?? Math.max(0, 120 - Math.floor((Date.now() - forbidden.detectedAt) / 1000))) : 0;
                  return (
                  <div key={img.id} className={`${styles.slotCard} ${img.status === "FAILED" ? styles.slotCardFailed : ""}`}>
                    <div className={styles.slotPreview}>
                      {(img.previewUrl || img.preview_url) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img.previewUrl || img.preview_url as string} alt={`Slot ${img.slot}`} />
                      ) : (img.status === "GENERATING" || img.status === "UPSCALING") ? (
                        <span className={styles.slotSpinner} />
                      ) : null}
                    </div>
                    <div className={styles.slotInfo}>
                      <span className={styles.slotNum}>#{img.slot} {img.kind}</span>
                      <span className={`${styles.slotStatus} ${img.status === "COMPLETE" ? styles.slotStatusDone : img.status === "FAILED" ? styles.slotStatusFailed : ""}`} title={providerError || "No provider error was saved for this failed slot"}>
                        {img.status === "COMPLETE" ? (
                          <div className={styles.downloadActions}>
                            <button className={styles.dlBtn} onClick={() => downloadImage(currentShoot, img)}>4K</button>
                            <button className={styles.dlBtn} onClick={() => downloadImage(currentShoot, img)} title="Download Image" aria-label="Download image">
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            </button>
                            {img.kind === "quote" && currentShoot.quote?.text && (
                              <button className={styles.dlBtn} onClick={handleRecompositeQuote} title="Recomposite quote card">
                                ✦
                              </button>
                            )}
                          </div>
                        ) : img.status?.toLowerCase()}
                      </span>
                    </div>
                    {img.status === "FAILED" && forbidden ? (
                      <div className={styles.forbiddenBanner}>
                        <p className={styles.forbiddenLabel}>
                          Content filter: <span className={styles.forbiddenWord}>&ldquo;{forbidden.flaggedWord}&rdquo;</span>
                          {" → "}<span className={styles.replacementWord}>&ldquo;{forbidden.replacement}&rdquo;</span>
                        </p>
                        {remaining > 0 ? (
                          <p className={styles.countdown}>
                            Retry in {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
                          </p>
                        ) : (
                          <button className={styles.regenerateBtn} onClick={() => handleRetrySlot(Number(img.slot))}>
                            Regenerate
                          </button>
                        )}
                      </div>
                    ) : img.status === "FAILED" && (
                      <details className={styles.slotErrorDetails}>
                        <summary>Reason</summary>
                        <p className={styles.slotError}>{providerError || "No provider error was saved for this failed slot. Check the n8n execution and shoot_images rows for this shoot."}</p>
                      </details>
                    )}
                    {isAdmin && !!((img as Record<string, unknown>).prompt) && (
                      <details className={styles.slotErrorDetails}>
                        <summary>Prompt</summary>
                        <p className={styles.slotError} style={{ whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: "11px" }}>{String((img as Record<string, unknown>).prompt)}</p>
                      </details>
                    )}
                  </div>
                )})}
              </div>

              {galleryImages.some((img) => img.status === "COMPLETE" && (img.download_storage_path || img.preview_storage_path)) && (
                <button className={styles.zipBtn} onClick={() => downloadZip(currentShoot)}>
                  {currentShoot.status === "COMPLETE" ? `Download All ${getShootPackageSize(currentShoot)} (ZIP)` : "Download Completed Images (ZIP)"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
