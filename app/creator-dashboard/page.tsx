"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { TEMPLATE_CATEGORIES, ASPECTS } from "@/lib/types";
import type { AspectRatio } from "@/lib/types";
import styles from "./creator-dashboard.module.css";

const TEMPLATE_TAGS = ["OUTFIT", "HAIRSTYLE", "MAKEUP", "BACKGROUND", "LIGHTING", "ACCESSORY", "COLOR_GRADE"] as const;

interface TemplateRow {
  id: string;
  title: string;
  description?: string;
  category: string;
  tags?: string[];
  price_ngn: number;
  status: string;
  purchase_count: number;
  shoot_mode: string;
  aspect_ratio: string;
  package_size: number;
  cover_storage_path?: string;
  cover_bucket?: string;
  cover_url?: string | null;
  template_images: Array<{ id: string; display_order: number; purpose: string; tag?: string }>;
  created_at: string;
}

interface ShowcaseIdentityRef {
  localId: string;
  file: File;
  preview: string;
  storagePath: string;
  storageBucket: string;
  uploading: boolean;
  error?: string;
}

interface ShowcaseShootImage {
  id: string;
  slot: number;
  status: string;
  preview_url?: string;
  download_url?: string;
  added?: boolean;
}

interface ShowcaseShoot {
  id: string;
  status: string;
  template_showcase_id: string;
  shoot_images: ShowcaseShootImage[];
}

interface Stats { totalTemplates: number; publishedTemplates: number; totalSales: number; totalEarnedNgn: number; }
interface Creator { id: string; display_name: string; paystack_subaccount_code?: string; }

const SHOWCASE_PACKAGES = [
  { count: 1, label: "1 image", price: 1000 },
  { count: 5, label: "5 images", price: 5000 },
  { count: 10, label: "10 images", price: 10000 },
] as const;

const SHOT_TYPES = [
  { value: "headshot",  label: "Headshot" },
  { value: "close_up",  label: "Close-up" },
  { value: "medium",    label: "Medium" },
  { value: "full_body", label: "Full body" },
] as const;

interface UploadedImage {
  localId: string;
  file: File;
  preview: string;
  storagePath: string;
  purpose: "inspiration" | "tagged";
  tag: string;
  uploading: boolean;
  error?: string;
}

const defaultForm = () => ({
  title: "",
  description: "",
  category: "portrait",
  tags: "",
  priceNgn: "",
  shootMode: "advanced",
  aspectRatio: "4:5" as AspectRatio,
  packageSize: 10,
  status: "draft",
  coverStoragePath: "",
});

export default function CreatorDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [creator, setCreator] = useState<Creator | null>(null);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<"none" | "create" | string>("none"); // "create" or templateId
  const [form, setForm] = useState(defaultForm());
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const imgInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const formPanelRef = useRef<HTMLDivElement>(null);
  const [coverPreview, setCoverPreview] = useState("");

  // ── Showcase generation state ───────────────────────────────────────────────
  const [showcaseTemplateId, setShowcaseTemplateId] = useState<string | null>(null);
  const [showcaseIdentityRefs, setShowcaseIdentityRefs] = useState<ShowcaseIdentityRef[]>([]);
  const [showcasePackage, setShowcasePackage] = useState(1);
  const [showcaseShotType, setShowcaseShotType] = useState("headshot");
  const [showcasePaying, setShowcasePaying] = useState(false);
  const [showcaseError, setShowcaseError] = useState("");
  const [showcaseShoots, setShowcaseShoots] = useState<ShowcaseShoot[]>([]);
  const [addingImageId, setAddingImageId] = useState<string | null>(null);
  const showcaseIdInputRef = useRef<HTMLInputElement>(null);

  const loadDashboard = useCallback(async () => {
    const res = await fetch("/api/creator-dashboard");
    if (res.status === 401) { router.push("/login?redirect=/creator-dashboard"); return; }
    if (res.status === 404) { router.push("/become-creator"); return; }
    if (!res.ok) return;
    const d = await res.json();
    setCreator(d.creator);
    setTemplates(d.templates ?? []);
    setStats(d.stats);
    setLoading(false);
  }, [router]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  // Pre-fill create form when arriving from main studio via ?from_shoot=ID
  useEffect(() => {
    const shootId = searchParams.get("from_shoot");
    if (!shootId) return;
    fetch("/api/shoots")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const shoot = (d?.shoots ?? []).find((s: Record<string, unknown>) => s.id === shootId);
        if (!shoot) return;
        setPanel("create");
        setFormError("");
        setForm({
          title: "",
          description: "",
          category: "portrait",
          tags: "",
          priceNgn: "",
          shootMode: (shoot.mode as string) === "fast" ? "fast" : "advanced",
          aspectRatio: (shoot.aspect_ratio as AspectRatio) ?? "4:5",
          packageSize: [1, 5, 10].includes(Number(shoot.package_size)) ? Number(shoot.package_size) as 1 | 5 | 10 : 10,
          status: "draft",
          coverStoragePath: "",
        });
        setImages([]);
        setCoverPreview("");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll showcase shoots every 4 seconds when any are active
  useEffect(() => {
    const active = showcaseShoots.some(s => ["QUEUED", "PROCESSING", "BASE_LOCKING"].includes(s.status));
    if (!active) return;
    const id = setInterval(async () => {
      const res = await fetch("/api/shoots");
      if (!res.ok) return;
      const d = await res.json();
      const all: ShowcaseShoot[] = (d.shoots ?? []).filter((s: ShowcaseShoot) => showcaseTemplateId && s.template_showcase_id === showcaseTemplateId);
      setShowcaseShoots(all);
    }, 4000);
    return () => clearInterval(id);
  }, [showcaseShoots, showcaseTemplateId]);

  useEffect(() => {
    if (panel !== "none") {
      setTimeout(() => formPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  }, [panel]);

  const openEdit = (t: TemplateRow) => {
    setShowcaseTemplateId(null);
    setPanel(t.id);
    setFormError("");
    setForm({
      title: t.title,
      description: t.description ?? "",
      category: t.category,
      tags: (t.tags ?? []).join(", "),
      priceNgn: String(t.price_ngn),
      shootMode: t.shoot_mode,
      aspectRatio: t.aspect_ratio as AspectRatio,
      packageSize: t.package_size,
      status: t.status,
      coverStoragePath: t.cover_storage_path ?? "",
    });
    setImages([]);
    setCoverPreview(t.cover_url ?? "");
  };

  const saveShowcaseAsTemplate = () => {
    const linked = templates.find(t => t.id === showcaseTemplateId);
    setShowcaseTemplateId(null);
    setPanel("create");
    setFormError("");
    setForm({
      title: "",
      description: linked?.description ?? "",
      category: linked?.category ?? "portrait",
      tags: (linked?.tags ?? []).join(", "),
      priceNgn: "",
      shootMode: linked?.shoot_mode ?? "advanced",
      aspectRatio: (linked?.aspect_ratio ?? "4:5") as AspectRatio,
      packageSize: linked?.package_size ?? 10,
      status: "draft",
      coverStoragePath: "",
    });
    setImages([]);
    setCoverPreview("");
  };

  const openShowcase = async (templateId: string) => {
    setPanel("none");
    setShowcaseTemplateId(templateId);
    setShowcaseIdentityRefs([]);
    setShowcasePackage(1);
    setShowcaseShotType("headshot");
    setShowcaseError("");
    // Load any existing showcase shoots for this template
    const res = await fetch("/api/shoots");
    if (res.status === 401) { router.push("/login?redirect=/creator-dashboard"); return; }
    if (res.ok) {
      const d = await res.json();
      const relevant: ShowcaseShoot[] = (d.shoots ?? []).filter((s: ShowcaseShoot) => s.template_showcase_id === templateId);
      setShowcaseShoots(relevant);
    }
  };

  const uploadShowcaseIdentity = async (file: File, localId: string) => {
    setShowcaseIdentityRefs(prev => prev.map(r => r.localId === localId ? { ...r, uploading: true } : r));
    const res = await fetch("/api/upload/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size, bucket: "identity-images" }),
    });
    if (!res.ok) {
      setShowcaseIdentityRefs(prev => prev.map(r => r.localId === localId ? { ...r, uploading: false, error: "Upload failed" } : r));
      return;
    }
    const { uploadUrl, storagePath, storageBucket } = await res.json();
    const putRes = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
    if (!putRes.ok) {
      setShowcaseIdentityRefs(prev => prev.map(r => r.localId === localId ? { ...r, uploading: false, error: "Upload failed" } : r));
      return;
    }
    setShowcaseIdentityRefs(prev => prev.map(r => r.localId === localId ? { ...r, uploading: false, storagePath, storageBucket } : r));
  };

  const addShowcaseIdentityFiles = (files: FileList) => {
    const toAdd = Array.from(files).slice(0, 5 - showcaseIdentityRefs.length);
    const newRefs: ShowcaseIdentityRef[] = toAdd.map(file => {
      const localId = crypto.randomUUID();
      return { localId, file, preview: URL.createObjectURL(file), storagePath: "", storageBucket: "identity-images", uploading: false };
    });
    setShowcaseIdentityRefs(prev => [...prev, ...newRefs]);
    newRefs.forEach(r => uploadShowcaseIdentity(r.file, r.localId));
  };

  const payAndGenerate = async () => {
    setShowcaseError("");
    const uploaded = showcaseIdentityRefs.filter(r => r.storagePath);
    if (uploaded.length === 0) { setShowcaseError("Upload at least 1 identity photo first"); return; }
    if (showcaseIdentityRefs.some(r => r.uploading)) { setShowcaseError("Wait for uploads to finish"); return; }
    setShowcasePaying(true);
    const res = await fetch(`/api/templates/${showcaseTemplateId}/generate-showcase`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageCount: showcasePackage,
        identityRefs: uploaded.map(r => ({ name: r.file.name, type: r.file.type, size: r.file.size, storageBucket: r.storageBucket, storagePath: r.storagePath })),
        ...(showcasePackage === 1 ? { shotType: showcaseShotType } : {}),
      }),
    });
    const d = await res.json();
    setShowcasePaying(false);
    if (!res.ok) { setShowcaseError(d.error ?? "Failed to start showcase generation"); return; }
    window.location.href = d.authorizationUrl;
  };

  const addToGallery = async (templateId: string | null, shootImageId: string) => {
    if (!templateId) return;
    setAddingImageId(shootImageId);
    const res = await fetch(`/api/templates/${templateId}/images/from-shoot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shootImageId }),
    });
    setAddingImageId(null);
    if (!res.ok) return;
    // Mark added in local state
    setShowcaseShoots(prev => prev.map(s => ({
      ...s,
      shoot_images: s.shoot_images.map(img => img.id === shootImageId ? { ...img, added: true } : img),
    })));
    loadDashboard();
  };

  const downloadImage = async (url: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = "cover.jpg";
    a.target = "_blank";
    a.rel = "noopener";
    a.click();
  };

  const feeNgn = stats ? 15000 : 15000; // platform fee; ideally fetch from pricing_configs
  const earnPreview = form.priceNgn && Number(form.priceNgn) > feeNgn
    ? Number(form.priceNgn) - feeNgn
    : null;

  const uploadFile = async (file: File, localId: string) => {
    setImages(prev => prev.map(img => img.localId === localId ? { ...img, uploading: true } : img));
    const res = await fetch("/api/upload/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size, bucket: "template-images" }),
    });
    if (!res.ok) {
      setImages(prev => prev.map(img => img.localId === localId ? { ...img, uploading: false, error: "Upload failed" } : img));
      return;
    }
    const { uploadUrl, storagePath } = await res.json();
    const putRes = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
    if (!putRes.ok) {
      setImages(prev => prev.map(img => img.localId === localId ? { ...img, uploading: false, error: "Upload failed" } : img));
      return;
    }
    setImages(prev => prev.map(img => img.localId === localId ? { ...img, uploading: false, storagePath } : img));
  };

  const addImages = (files: FileList) => {
    if (images.length >= 8) { setFormError("Maximum 8 images per template"); return; }
    const remaining = 8 - images.length;
    const toAdd = Array.from(files).slice(0, remaining);
    const newImgs: UploadedImage[] = toAdd.map(file => {
      const localId = crypto.randomUUID();
      return { localId, file, preview: URL.createObjectURL(file), storagePath: "", purpose: "inspiration", tag: "OUTFIT", uploading: false };
    });
    setImages(prev => [...prev, ...newImgs]);
    newImgs.forEach(img => uploadFile(img.file, img.localId));
  };

  const uploadCover = async (file: File) => {
    const res = await fetch("/api/upload/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size, bucket: "template-images" }),
    });
    if (!res.ok) return;
    const { uploadUrl, storagePath } = await res.json();
    await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
    setForm(f => ({ ...f, coverStoragePath: storagePath }));
    setCoverPreview(URL.createObjectURL(file));
  };

  const saveTemplate = async () => {
    setFormError("");
    if (!form.title.trim()) { setFormError("Title is required"); return; }
    if (!form.priceNgn || Number(form.priceNgn) < 1000) { setFormError("Price must be at least ₦1,000"); return; }
    if (earnPreview === null) { setFormError(`Price must be more than ₦${feeNgn.toLocaleString()} (the platform fee)`); return; }
    if (images.some(i => i.uploading)) { setFormError("Please wait for all images to finish uploading"); return; }

    setSaving(true);
    const body = {
      title: form.title,
      description: form.description,
      category: form.category,
      tags: form.tags.split(",").map(t => t.trim()).filter(Boolean),
      priceNgn: Number(form.priceNgn),
      shootMode: form.shootMode,
      aspectRatio: form.aspectRatio,
      packageSize: form.packageSize,
      status: form.status,
      coverStoragePath: form.coverStoragePath || undefined,
    };

    let templateId: string;
    if (panel === "create") {
      const res = await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      if (!res.ok) { setFormError(d.error ?? "Failed to create template"); setSaving(false); return; }
      templateId = d.template.id;
    } else {
      const res = await fetch(`/api/templates/${panel}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      if (!res.ok) { setFormError(d.error ?? "Failed to update template"); setSaving(false); return; }
      templateId = panel;
    }

    // Save images
    const uploadedImages = images.filter(i => i.storagePath);
    for (let i = 0; i < uploadedImages.length; i++) {
      const img = uploadedImages[i];
      await fetch(`/api/templates/${templateId}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath: img.storagePath, displayOrder: i, purpose: img.purpose, tag: img.purpose === "tagged" ? img.tag : undefined }),
      });
    }

    setSaving(false);
    setPanel("none");
    setForm(defaultForm());
    setImages([]);
    setCoverPreview("");
    loadDashboard();
  };

  const toggleStatus = async (t: TemplateRow) => {
    const next = t.status === "published" ? "draft" : "published";
    await fetch(`/api/templates/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
    loadDashboard();
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm("Delete this template? This cannot be undone.")) return;
    await fetch(`/api/templates/${id}`, { method: "DELETE" });
    loadDashboard();
  };

  if (loading) return <div className={styles.loading}>Loading dashboard...</div>;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.back}>← Studio</Link>
        <h1 className={styles.title}>Creator Dashboard</h1>
        <Link href="/marketplace" className={styles.marketplaceLink}>Browse marketplace →</Link>
      </header>

      <div className={styles.main}>

      {creator && !creator.paystack_subaccount_code && (
        <div className={styles.banner}>
          Payout setup incomplete.{" "}
          <Link href="/become-creator" className={styles.bannerLink}>Complete your bank details →</Link>
        </div>
      )}

      {stats && (
        <div className={styles.statsGrid}>
          <div className={styles.stat}><span className={styles.statVal}>{stats.totalTemplates}</span><span className={styles.statLabel}>Templates</span></div>
          <div className={styles.stat}><span className={styles.statVal}>{stats.publishedTemplates}</span><span className={styles.statLabel}>Published</span></div>
          <div className={styles.stat}><span className={styles.statVal}>{stats.totalSales}</span><span className={styles.statLabel}>Sales</span></div>
          <div className={styles.stat}><span className={styles.statVal}>₦{stats.totalEarnedNgn.toLocaleString()}</span><span className={styles.statLabel}>Total Earned</span></div>
        </div>
      )}

      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>My Templates</h2>
        {panel === "none" && (
          <button type="button" className={styles.newBtn} onClick={() => { setPanel("create"); setForm(defaultForm()); setImages([]); setCoverPreview(""); }}>
            + New Template
          </button>
        )}
      </div>

      {/* Template list */}
      <div className={styles.templateList}>
        {templates.length === 0 && panel !== "create" && (
          <div className={styles.empty}>No templates yet. Create your first style above.</div>
        )}
        {templates.map(t => (
          <div key={t.id} className={`${styles.templateRow} ${panel === t.id ? styles.templateRowActive : ""}`}>
            <div className={styles.templateInfo}>
              <span className={styles.templateTitle}>{t.title}</span>
              <span className={styles.templateMeta}>{t.category} · {t.shoot_mode} · {t.aspect_ratio} · {t.package_size} images</span>
            </div>
            <div className={styles.templateRight}>
              <span className={styles.templatePrice}>₦{t.price_ngn.toLocaleString()}</span>
              <span className={styles.templateSales}>{t.purchase_count} sales</span>
              <span className={t.status === "published" ? styles.published : styles.draft}>{t.status}</span>
              <div className={styles.templateActions}>
                <button type="button" className={styles.actionBtn} onClick={() => openEdit(t)}>
                  Edit
                </button>
                <button type="button" className={styles.actionBtn} onClick={() => toggleStatus(t)}>
                  {t.status === "published" ? "Unpublish" : "Publish"}
                </button>
                <button type="button" className={`${styles.actionBtn} ${styles.actionBtnShowcase}`} onClick={() => openShowcase(t.id)}>
                  Generate images
                </button>
                <button type="button" className={styles.actionBtn} onClick={() => deleteTemplate(t.id)}>Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create / Edit panel */}
      {panel !== "none" && (
        <div className={styles.formPanel} ref={formPanelRef}>
          <div className={styles.formPanelHeader}>
            <h3 className={styles.formTitle}>{panel === "create" ? "New Template" : "Edit Template"}</h3>
            <button type="button" className={styles.closeBtn} onClick={() => setPanel("none")}>✕</button>
          </div>

          {formError && <p className={styles.formError}>{formError}</p>}

          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span className={styles.label}>Title *</span>
              <input className={styles.input} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Sunset Lagos Editorial" maxLength={80} />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Category</span>
              <select className={styles.input} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {TEMPLATE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </label>
          </div>

          <label className={styles.field}>
            <span className={styles.label}>Description</span>
            <textarea className={`${styles.input} ${styles.textarea}`} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe the vibe, setting, and aesthetic..." rows={3} maxLength={500} />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Tags (comma-separated)</span>
            <input className={styles.input} value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="lagos, studio, editorial, luxury" />
          </label>

          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span className={styles.label}>Your price (₦) *</span>
              <input className={styles.input} type="number" value={form.priceNgn} onChange={e => setForm(f => ({ ...f, priceNgn: e.target.value }))} placeholder="e.g. 25000" min={1000} />
              {earnPreview !== null
                ? <span className={styles.earnPreview}>You earn ₦{earnPreview.toLocaleString()} per sale</span>
                : form.priceNgn && <span className={styles.earnWarn}>Must be more than ₦{feeNgn.toLocaleString()} platform fee</span>
              }
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Shoot mode</span>
              <div className={styles.pills}>
                {["fast", "advanced"].map(m => (
                  <button key={m} type="button" className={`${styles.pill} ${form.shootMode === m ? styles.pillActive : ""}`} onClick={() => setForm(f => ({ ...f, shootMode: m }))}>{m}</button>
                ))}
              </div>
            </label>
          </div>

          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span className={styles.label}>Aspect ratio</span>
              <div className={styles.pills}>
                {(Object.keys(ASPECTS) as AspectRatio[]).map(ar => (
                  <button key={ar} type="button" className={`${styles.pill} ${form.aspectRatio === ar ? styles.pillActive : ""}`} onClick={() => setForm(f => ({ ...f, aspectRatio: ar }))}>{ar}</button>
                ))}
              </div>
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Package size</span>
              <div className={styles.pills}>
                {[1, 5, 10].map(s => (
                  <button key={s} type="button" className={`${styles.pill} ${form.packageSize === s ? styles.pillActive : ""}`} onClick={() => setForm(f => ({ ...f, packageSize: s }))}>{s} {s === 1 ? "image" : "images"}</button>
                ))}
              </div>
            </label>
          </div>

          {/* Cover image */}
          <div className={styles.field}>
            <span className={styles.label}>Cover image</span>
            <div className={styles.coverUpload} onClick={() => coverInputRef.current?.click()} role="button" tabIndex={0} onKeyDown={e => e.key === "Enter" && coverInputRef.current?.click()}>
              {coverPreview
                ? <img src={coverPreview} alt="Cover" className={styles.coverPreview} />
                : <span className={styles.coverPlaceholder}>Click to upload cover image</span>
              }
            </div>
            <input type="file" accept="image/*" ref={coverInputRef} className={styles.hidden} onChange={e => { const f = e.target.files?.[0]; if (f) uploadCover(f); }} />
          </div>

          {/* Reference images */}
          <div className={styles.field}>
            <span className={styles.label}>Reference images ({images.length}/8)</span>
            <div className={styles.imagesGrid}>
              {images.map((img, i) => (
                <div key={img.localId} className={styles.imgItem}>
                  <img src={img.preview} alt="" className={styles.imgPreview} />
                  {img.uploading && <div className={styles.imgOverlay}>Uploading...</div>}
                  {img.error && <div className={styles.imgError}>{img.error}</div>}
                  <select
                    className={styles.imgPurpose}
                    value={img.purpose}
                    onChange={e => setImages(prev => prev.map((im, j) => j === i ? { ...im, purpose: e.target.value as "inspiration" | "tagged" } : im))}
                  >
                    <option value="inspiration">Inspiration</option>
                    <option value="tagged">Tagged</option>
                  </select>
                  {img.purpose === "tagged" && (
                    <select
                      className={styles.imgTag}
                      value={img.tag}
                      onChange={e => setImages(prev => prev.map((im, j) => j === i ? { ...im, tag: e.target.value } : im))}
                    >
                      {TEMPLATE_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  )}
                  <button type="button" className={styles.imgRemove} onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
              {images.length < 8 && (
                <button type="button" className={styles.addImgBtn} onClick={() => imgInputRef.current?.click()}>
                  + Add image
                </button>
              )}
            </div>
            <input type="file" accept="image/*" multiple ref={imgInputRef} className={styles.hidden} onChange={e => { if (e.target.files) addImages(e.target.files); e.target.value = ""; }} />
          </div>

          <div className={styles.formActions}>
            <div className={styles.pills}>
              <button type="button" className={`${styles.pill} ${form.status === "draft" ? styles.pillActive : ""}`} onClick={() => setForm(f => ({ ...f, status: "draft" }))}>Save as draft</button>
              <button type="button" className={`${styles.pill} ${form.status === "published" ? styles.pillActive : ""}`} onClick={() => setForm(f => ({ ...f, status: "published" }))}>Publish</button>
            </div>
            <button type="button" className={styles.saveBtn} onClick={saveTemplate} disabled={saving}>
              {saving ? "Saving..." : panel === "create" ? "Create template" : "Save changes"}
            </button>
          </div>
        </div>
      )}

      {/* ── Showcase panel ── */}
      {showcaseTemplateId && (
        <div className={styles.showcasePanel}>
          <div className={styles.formPanelHeader}>
            <h3 className={styles.formTitle}>Generate Showcase Images</h3>
            <button type="button" className={styles.closeBtn} onClick={() => setShowcaseTemplateId(null)}>✕</button>
          </div>

          <p className={styles.showcaseHint}>
            Upload photos of your model, pick a package, and pay ₦1,000 per image to generate showcase photos for this template.
          </p>

          {showcaseError && <p className={styles.formError}>{showcaseError}</p>}

          {/* Identity upload */}
          <div className={styles.field}>
            <span className={styles.label}>Model identity photos ({showcaseIdentityRefs.length}/5)</span>
            <div className={styles.imagesGrid}>
              {showcaseIdentityRefs.map(ref => (
                <div key={ref.localId} className={styles.imgItem}>
                  <img src={ref.preview} alt="" className={styles.imgPreview} />
                  {ref.uploading && <div className={styles.imgOverlay}>Uploading...</div>}
                  {ref.error && <div className={styles.imgError}>{ref.error}</div>}
                  <button type="button" className={styles.imgRemove} onClick={() => setShowcaseIdentityRefs(prev => prev.filter(r => r.localId !== ref.localId))}>✕</button>
                </div>
              ))}
              {showcaseIdentityRefs.length < 5 && (
                <button type="button" className={styles.addImgBtn} onClick={() => showcaseIdInputRef.current?.click()}>
                  + Add photo
                </button>
              )}
            </div>
            <input type="file" accept="image/*" multiple ref={showcaseIdInputRef} className={styles.hidden} onChange={e => { if (e.target.files) addShowcaseIdentityFiles(e.target.files); e.target.value = ""; }} />
          </div>

          {/* Package picker */}
          <div className={styles.field}>
            <span className={styles.label}>Package</span>
            <div className={styles.pills}>
              {SHOWCASE_PACKAGES.map(pkg => (
                <button key={pkg.count} type="button" className={`${styles.pill} ${showcasePackage === pkg.count ? styles.pillActive : ""}`} onClick={() => setShowcasePackage(pkg.count)}>
                  {pkg.label} — ₦{pkg.price.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          {showcasePackage === 1 && (
            <div className={styles.shotTypeSection}>
              <span className={styles.label}>Shot type</span>
              <div className={styles.shotTypeGrid}>
                {SHOT_TYPES.map(s => (
                  <button
                    key={s.value}
                    type="button"
                    className={`${styles.shotTypeBtn} ${showcaseShotType === s.value ? styles.shotTypeBtnActive : ""}`}
                    onClick={() => setShowcaseShotType(s.value)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button type="button" className={styles.saveBtn} onClick={payAndGenerate} disabled={showcasePaying || showcaseIdentityRefs.some(r => r.uploading)}>
            {showcasePaying ? "Redirecting to payment..." : `Pay ₦${(showcasePackage * 1000).toLocaleString()} & Generate`}
          </button>

          <button type="button" className={styles.saveAsTemplateBtn} onClick={saveShowcaseAsTemplate}>
            Save as new template instead
          </button>

          {/* Existing showcase shoots for this template */}
          {showcaseShoots.length > 0 && (
            <div className={styles.showcaseShoots}>
              <span className={styles.label}>Generated shoots</span>
              {showcaseShoots.map(shoot => (
                <div key={shoot.id} className={styles.showcaseShoot}>
                  <div className={styles.showcaseShootHeader}>
                    <span className={styles.showcaseShootStatus}>{shoot.status}</span>
                    <span className={styles.showcaseShootId}>{shoot.id.slice(0, 8)}</span>
                  </div>
                  <div className={styles.showcaseImageGrid}>
                    {(shoot.shoot_images ?? []).filter(img => img.status === "COMPLETE").map(img => (
                      <div key={img.id} className={styles.showcaseImageItem}>
                        {img.preview_url
                          ? <img src={img.preview_url} alt={`Slot ${img.slot}`} className={styles.showcaseImg} />
                          : <div className={styles.showcaseImgPlaceholder}>Image ready</div>
                        }
                        <div className={styles.showcaseImageActions}>
                          <button
                            type="button"
                            className={styles.showcaseActionBtn}
                            onClick={() => addToGallery(showcaseTemplateId, img.id)}
                            disabled={addingImageId === img.id || img.added}
                          >
                            {img.added ? "Added" : addingImageId === img.id ? "Adding..." : "Add to gallery"}
                          </button>
                          {(img.download_url || img.preview_url) && (
                            <button type="button" className={styles.showcaseActionBtn} onClick={() => downloadImage(img.download_url || img.preview_url!)}>
                              Download
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {shoot.status !== "COMPLETE" && shoot.status !== "FAILED" && (
                      <div className={styles.showcaseGenerating}>
                        Generating... ({(shoot.shoot_images ?? []).filter(i => i.status === "COMPLETE").length}/{shoot.shoot_images?.length ?? 0} done)
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      </div>
    </div>
  );
}
