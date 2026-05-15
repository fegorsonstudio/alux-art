"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import type { User, Shoot, ShootImage, AspectRatio, Currency, ShootMode, ReferenceTag, ShootPackageSize, PackagePricing } from "@/lib/types";
import { ASPECTS, REFERENCE_TAGS, SHOOT_PACKAGES, normalizePackageSize, packagePrice } from "@/lib/types";
import styles from "./workspace.module.css";

interface UploadedRef { id: string; name: string; type: string; size: number; storageBucket: string; storagePath: string; url: string; tag?: ReferenceTag; customTag?: string; }
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
  return String(img.providerError ?? img.provider_error ?? img.error ?? "").trim();
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
      const [meRes, configRes, shootsRes, libRes, inspirationLibRes] = await Promise.all([
        fetch("/api/me"),
        fetch("/api/config"),
        fetch("/api/shoots"),
        fetch("/api/identity-library"),
        fetch("/api/inspiration-library"),
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
        }));
        setInspirationLibraryImages(imgs);
      }
    })();
  }, []);

  // SSE listener for active shoot
  const shootIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentShoot) return;
    if (currentShoot.status === "COMPLETE" || currentShoot.status === "FAILED") return;
    if ((currentShoot.status === "QUEUED" || currentShoot.status === "PROCESSING") && !resumeStartedRef.current.has(currentShoot.id)) {
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
      } else if (event.type === "stage") {
        setCurrentShoot(prev => prev ? { ...prev, pipelineStage: event.stage, progress: event.progress ?? prev.progress } : prev);
      }
    };
    es.onerror = () => es.close();
    return () => { es.close(); shootIdRef.current = null; };
  }, [currentShoot]);

  const uploadFile = useCallback(async (file: File, bucket: string, saveLib = false): Promise<UploadedRef | null> => {
    const key = `${file.name}-${file.size}`;
    setUploadIssue("");
    setUploadProgress(prev => ({ ...prev, [key]: 0 }));
    const done = () => setUploadProgress(prev => { const n = { ...prev }; delete n[key]; return n; });
    try {
      if (!user?.id) throw new Error("Sign in again before uploading");

      const imageId = crypto.randomUUID();
      const storagePath = `${user.id}/${imageId}-${sanitizeFileName(file.name)}`;
      const uploadedRef = {
        id: imageId,
        name: file.name,
        type: file.type,
        size: file.size,
        storageBucket: bucket,
        storagePath,
      };

      setUploadProgress(prev => ({ ...prev, [key]: 35 }));
      const { error: directUploadError } = await supabase.storage
        .from(bucket)
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: true,
        });
      if (directUploadError) throw new Error(directUploadError.message);

      setUploadProgress(prev => ({ ...prev, [key]: 75 }));
      const finalizeRes = await fetch("/api/upload", {
        method: "POST",
        body: new URLSearchParams({
          saveToLibrary: saveLib ? "true" : "false",
          id: uploadedRef.id,
          filename: uploadedRef.name,
          contentType: uploadedRef.type,
          size: String(uploadedRef.size),
          storageBucket: uploadedRef.storageBucket,
          storagePath: uploadedRef.storagePath,
        }),
      });

      const data = await finalizeRes.json().catch(() => null);
      if (!finalizeRes.ok || !data?.image) throw new Error(data?.error ?? `Upload finalize failed with ${finalizeRes.status}`);

      setUploadProgress(prev => ({ ...prev, [key]: 100 }));

      done();
      return data.image as UploadedRef;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      setUploadIssue(`${file.name}: ${message}`);
      setStatus({
        type: "error",
        message,
      });
      done();
      return null;
    }
  }, [supabase, user]);

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
          taggedReferences: taggedRefs.map(({ id, name, type, size, storageBucket, storagePath, tag, customTag }) => ({
            id,
            name,
            type,
            size,
            storageBucket,
            storagePath,
            tag: customTag?.trim() ? null : tag || null,
            customName: customTag?.trim() || null,
          })),
          quote, adminBypass,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setStatus({ type: "error", message: data.error }); return; }

      const shoot: Shoot = data.shoot;
      setShoots(prev => [shoot, ...prev]);
      setCurrentShoot(shoot);

      if (adminBypass) {
        setStatus({ type: "ok", message: "Generating..." });
        // Fire-and-forget: start endpoint runs in its own 300s Vercel function context.
        fetch(`/api/shoots/${shoot.id}/start`, { method: "POST" }).catch(() => {});
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
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `aluxart-slot${img.slot}-${img.kind}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const downloadZip = async (shoot: Shoot) => {
    setStatus({ type: "loading", message: "Preparing ZIP..." });
    const res = await fetch(`/api/shoots/${shoot.id}/download-zip`);
    const { url, error } = await res.json();
    if (url) { window.open(url, "_blank"); setStatus({ type: "ok", message: "ZIP ready!" }); }
    else setStatus({ type: "error", message: error ?? "ZIP failed" });
  };

  const retryImage = async (shoot: Shoot, img: ShootImage) => {
    setStatus({ type: "loading", message: `Restarting image ${img.slot}...` });
    const res = await fetch(`/api/shoots/${shoot.id}/images/${img.id}/retry`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus({ type: "error", message: data.error ?? "Retry failed" });
      return;
    }
    setStatus({ type: "ok", message: `Image ${img.slot} queued again.` });
    const refresh = await fetch(`/api/shoots/${shoot.id}`);
    if (refresh.ok) {
      const refreshed = await refresh.json();
      if (refreshed.shoot) {
        setCurrentShoot(refreshed.shoot);
        setShoots(prev => prev.map(s => s.id === refreshed.shoot.id ? refreshed.shoot : s));
      }
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
                <p className={styles.libLabel}>Saved inspiration - tap to select/deselect</p>
                <div className={styles.thumbGrid}>
                  {inspirationLibraryImages.map(img => {
                    const selected = inspirationImages.some(i => i.id === img.id);
                    return (
                      <button key={img.id} type="button" className={`${styles.thumb} ${selected ? styles.thumbSelected : ""}`}
                        onClick={() => handleAddFromInspirationLibrary(img)} aria-pressed={selected}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.url} alt={img.name} />
                        {selected && <span className={styles.thumbCheck}>OK</span>}
                      </button>
                    );
                  })}
                </div>
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
                <p className={styles.uploadCount}>OUTFIT / HAIRSTYLE / MAKEUP / LIGHTING / BACKGROUND</p>
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
              <button className={styles.adminBypassBtn} disabled={!canCreate || status.type === "loading"} onClick={() => handleCreateAndPay(true)}>
                Admin: Generate Free
              </button>
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

          {/* Recent shoots */}
          {shoots.length > 0 && (
            <div className={styles.panel}>
              <p className={styles.panelTitle}>Your Shoots</p>
              <div className={styles.shootsList}>
                {shoots.slice(0, 5).map(s => (
                  <button key={s.id} type="button" className={`${styles.shootCard} ${currentShoot?.id === s.id ? styles.shootCardActive : ""}`} onClick={() => openShootGallery(s)}>
                    <div className={styles.shootMeta}>
                      <span style={{ fontSize: "0.85rem" }}>
                        {(s as unknown as Record<string, string>).aspect_ratio || s.aspectRatio} / {s.mode} / {getShootPackageSize(s)} images
                      </span>
                      <span className={styles.shootDate}>{new Date((s as unknown as Record<string, string>).created_at || s.createdAt).toLocaleDateString()}</span>
                    </div>
                    <span className={styles.shootActions}>
                      <span className={`${styles.statusBadge} ${styles[`status${(s.status ?? "").charAt(0) + (s.status ?? "").slice(1).toLowerCase()}` as keyof typeof styles] ?? ""}`}>
                        {s.status}
                      </span>
                      <span className={styles.openGalleryLabel}>Open gallery</span>
                    </span>
                  </button>
                ))}
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
                <div className={styles.progressBar}>
                  <div className={styles.galleryFill} style={{ width: `${currentShoot.progress ?? 0}%` }} />
                </div>
              )}

              {/* Image grid */}
              <div className={styles.slotGrid}>
                {galleryImages.map((img) => {
                  const providerError = getProviderError(img);
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
                          </div>
                        ) : img.status?.toLowerCase()}
                      </span>
                    </div>
                    {img.status === "FAILED" && (
                      <div className={styles.retryPanel}>
                        <button className={styles.retryBtn} onClick={() => retryImage(currentShoot, img)}>Retry image</button>
                        <details className={styles.slotErrorDetails}>
                          <summary>Reason</summary>
                          <p className={styles.slotError}>{providerError || "No provider error was saved for this failed slot. Check the generation_events and shoot_images rows for this shoot."}</p>
                        </details>
                      </div>
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
