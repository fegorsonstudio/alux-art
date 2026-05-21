"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { TEMPLATE_CATEGORIES, ASPECTS, packagePrice } from "@/lib/types";
import type { AspectRatio } from "@/lib/types";
import { THEMES, FONTS } from "@/lib/storefront-themes";
import styles from "./creator-dashboard.module.css";
import CollageEditor, { type CollageImage } from "./CollageEditor";

const TEMPLATE_TAGS = ["OUTFIT", "HAIRSTYLE", "MAKEUP", "NAIL_DESIGN", "BACKGROUND", "LIGHTING", "ACCESSORY"] as const;
type TemplateTag = typeof TEMPLATE_TAGS[number];

interface TemplateRow {
  id: string;
  title: string;
  description?: string;
  category: string;
  tags?: string[];
  price_ngn: number;
  price_1_ngn?: number | null;
  price_5_ngn?: number | null;
  status: string;
  purchase_count: number;
  shoot_mode: string;
  aspect_ratio: string;
  package_size: number;
  cover_storage_path?: string;
  cover_bucket?: string;
  cover_url?: string | null;
  template_images: Array<{ id: string; display_order: number; purpose: string; tag?: string; note?: string | null; storage_path?: string; storage_bucket?: string; signed_url?: string | null }>;
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
interface Creator { id: string; display_name: string; paystack_subaccount_code?: string; theme?: string; font_family?: string; }

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
  file?: File;
  preview: string;
  storagePath: string;
  purpose: "inspiration" | "tagged";
  tag: string;
  customName: string;
  note: string;
  uploading: boolean;
  fromDb?: boolean;
  error?: string;
}

interface SampleImageItem {
  localId: string;   // db id when fromDb
  preview: string;
  storagePath: string;
  uploading: boolean;
  fromDb?: boolean;
  error?: string;
}

const defaultForm = () => ({
  title: "",
  description: "",
  category: "portrait",
  tags: "",
  priceNgn: "",
  price1Ngn: "",
  price5Ngn: "",
  shootMode: "advanced",
  aspectRatio: "4:5" as AspectRatio,
  packageSize: 10,
  status: "draft",
  coverStoragePath: "",
});

function CreatorDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [creator, setCreator] = useState<Creator | null>(null);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<"none" | "create" | string>("none"); // "create" or templateId
  const [form, setForm] = useState(defaultForm());
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [sampleImages, setSampleImages] = useState<SampleImageItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const imgInputRef = useRef<HTMLInputElement>(null);
  const sampleImgInputRef = useRef<HTMLInputElement>(null);
  const formPanelRef = useRef<HTMLDivElement>(null);
  const [coverPreview, setCoverPreview] = useState("");
  const [pendingTag, setPendingTag] = useState<string>("inspiration");

  // ── Showcase generation state ───────────────────────────────────────────────
  const [showcaseTemplateId, setShowcaseTemplateId] = useState<string | null>(null);
  const [showcaseIdentityRefs, setShowcaseIdentityRefs] = useState<ShowcaseIdentityRef[]>([]);
  const [showcasePackage, setShowcasePackage] = useState(1);
  const [showcaseShotType, setShowcaseShotType] = useState("headshot");
  const [showcasePaying, setShowcasePaying] = useState(false);
  const [showcaseError, setShowcaseError] = useState("");
  const [showcaseShoots, setShowcaseShoots] = useState<ShowcaseShoot[]>([]);
  const [addingImageId, setAddingImageId] = useState<string | null>(null);
  const [galleryAdded, setGalleryAdded] = useState<Map<string, string>>(new Map());
  const [settingCover, setSettingCover] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [platformFeeNgn, setPlatformFeeNgn] = useState(15000);
  const [showCollageEditor, setShowCollageEditor] = useState(false);
  const [storefrontOpen, setStorefrontOpen] = useState(false);
  const [storefrontTheme, setStorefrontTheme] = useState("alux");
  const [storefrontFont, setStorefrontFont] = useState("default");
  const [storefrontSaving, setStorefrontSaving] = useState(false);
  const [storefrontSaved, setStorefrontSaved] = useState(false);
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

  useEffect(() => {
    fetch("/api/config")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.platformFeeNgn) setPlatformFeeNgn(d.platformFeeNgn); })
      .catch(() => {});
  }, []);

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
          price1Ngn: "",
          price5Ngn: "",
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

  // Open edit panel for a template created via "Turn into template" flow
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId) return;
    (async () => {
      const res = await fetch(`/api/templates/${editId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.template) openEdit(data.template);
    })();
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
    if (!loading && panel !== "none") {
      setTimeout(() => formPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    }
  }, [panel, loading]);

  useEffect(() => {
    if (creator) {
      setStorefrontTheme(creator.theme ?? "alux");
      setStorefrontFont(creator.font_family ?? "default");
    }
  }, [creator]);

  const openEdit = async (t: TemplateRow) => {
    setShowcaseTemplateId(null);
    setPanel(t.id);
    setFormError("");
    setForm({
      title: t.title,
      description: t.description ?? "",
      category: t.category,
      tags: (t.tags ?? []).join(", "),
      priceNgn: t.price_ngn > 0 ? String(t.price_ngn) : "",
      price1Ngn: t.price_1_ngn != null ? String(t.price_1_ngn) : "",
      price5Ngn: t.price_5_ngn != null ? String(t.price_5_ngn) : "",
      shootMode: t.shoot_mode,
      aspectRatio: t.aspect_ratio as AspectRatio,
      packageSize: t.package_size,
      status: t.status,
      coverStoragePath: t.cover_storage_path ?? "",
    });
    setImages([]);
    setSampleImages([]);
    setCoverPreview(t.cover_url ?? "");
    // Fetch full template with signed URLs for reference images
    const res = await fetch(`/api/templates/${t.id}`);
    if (res.ok) {
      const data = await res.json();
      const imgs = (data.template?.template_images ?? []) as Array<{
        id: string; storage_path: string; storage_bucket: string;
        display_order: number; purpose: string; tag?: string; custom_name?: string | null; note?: string | null; signed_url?: string | null;
      }>;
      const existingImages: UploadedImage[] = imgs
        .filter(img => img.storage_path && img.signed_url && (img.purpose === "inspiration" || img.purpose === "tagged"))
        .map(img => ({
          localId: img.id,
          preview: img.signed_url!,
          storagePath: img.storage_path,
          purpose: img.purpose as "inspiration" | "tagged",
          tag: img.tag ?? "OUTFIT",
          customName: img.custom_name ?? "",
          note: img.note ?? "",
          uploading: false,
          fromDb: true,
        }));
      setImages(existingImages);
      const existingSamples: SampleImageItem[] = imgs
        .filter(img => img.storage_path && img.signed_url && img.purpose === "sample")
        .map(img => ({
          localId: img.id,
          preview: img.signed_url!,
          storagePath: img.storage_path,
          uploading: false,
          fromDb: true,
        }));
      setSampleImages(existingSamples);
    }
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
      price1Ngn: "",
      price5Ngn: "",
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
    const data = await res.json();
    if (data.image?.storagePath) {
      setGalleryAdded(prev => new Map(prev).set(shootImageId, data.image.storagePath));
    }
    setShowcaseShoots(prev => prev.map(s => ({
      ...s,
      shoot_images: s.shoot_images.map(img => img.id === shootImageId ? { ...img, added: true } : img),
    })));
    loadDashboard();
  };

  const copyLink = (id: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/marketplace/${id}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const setAsCover = async (templateId: string | null, storagePath: string, imageId: string) => {
    if (!templateId) return;
    setSettingCover(imageId);
    await fetch(`/api/templates/${templateId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coverStoragePath: storagePath }),
    });
    setSettingCover(null);
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

  const feeNgn = platformFeeNgn;

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
    const purpose: "inspiration" | "tagged" = pendingTag === "inspiration" ? "inspiration" : "tagged";
    const tag = (pendingTag === "inspiration" || pendingTag === "__tagged__") ? "OUTFIT" : pendingTag;
    const newImgs: UploadedImage[] = toAdd.map(file => {
      const localId = crypto.randomUUID();
      return { localId, file, preview: URL.createObjectURL(file), storagePath: "", purpose, tag, customName: "", note: "", uploading: false };
    });
    setImages(prev => [...prev, ...newImgs]);
    newImgs.forEach(img => uploadFile(img.file!, img.localId));
  };

  const uploadSampleFile = async (file: File, localId: string) => {
    setSampleImages(prev => prev.map(s => s.localId === localId ? { ...s, uploading: true } : s));
    const res = await fetch("/api/upload/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size, bucket: "template-images" }),
    });
    if (!res.ok) {
      setSampleImages(prev => prev.map(s => s.localId === localId ? { ...s, uploading: false, error: "Upload failed" } : s));
      return;
    }
    const { uploadUrl, storagePath } = await res.json();
    const putRes = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
    if (!putRes.ok) {
      setSampleImages(prev => prev.map(s => s.localId === localId ? { ...s, uploading: false, error: "Upload failed" } : s));
      return;
    }
    setSampleImages(prev => prev.map(s => s.localId === localId ? { ...s, uploading: false, storagePath } : s));
  };

  const addSampleFiles = (files: FileList) => {
    const remaining = 10 - sampleImages.length;
    if (remaining <= 0) return;
    const toAdd = Array.from(files).slice(0, remaining);
    const newItems: SampleImageItem[] = toAdd.map(file => {
      const localId = crypto.randomUUID();
      return { localId, preview: URL.createObjectURL(file), storagePath: "", uploading: false };
    });
    setSampleImages(prev => [...prev, ...newItems]);
    newItems.forEach((item, idx) => uploadSampleFile(toAdd[idx], item.localId));
  };

  const removeSampleImage = async (item: SampleImageItem, templateId: string | null) => {
    if (item.fromDb && templateId && templateId !== "create") {
      await fetch(`/api/templates/${templateId}/images`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId: item.localId }),
      });
    }
    setSampleImages(prev => prev.filter(s => s.localId !== item.localId));
  };

  const saveTemplate = async () => {
    setFormError("");
    if (!form.title.trim()) { setFormError("Title is required"); return; }
    if (!form.priceNgn || Number(form.priceNgn) <= feeNgn) {
      setFormError(`10-image price must be more than ₦${feeNgn.toLocaleString()} (the platform fee)`);
      return;
    }
    if (form.price1Ngn && Number(form.price1Ngn) <= packagePrice(feeNgn, 1)) {
      setFormError(`1-image price must be more than ₦${packagePrice(feeNgn, 1).toLocaleString()}`);
      return;
    }
    if (form.price5Ngn && Number(form.price5Ngn) <= packagePrice(feeNgn, 5)) {
      setFormError(`5-image price must be more than ₦${packagePrice(feeNgn, 5).toLocaleString()}`);
      return;
    }
    if (images.some(i => i.uploading)) { setFormError("Please wait for all images to finish uploading"); return; }
    if (sampleImages.some(s => s.uploading)) { setFormError("Please wait for all sample images to finish uploading"); return; }

    setSaving(true);
    // First gallery image is automatically the marketplace card thumbnail.
    const coverFromGallery = sampleImages[0]?.storagePath;
    const body = {
      title: form.title,
      description: form.description,
      category: form.category,
      tags: form.tags.split(",").map(t => t.trim()).filter(Boolean),
      priceNgn: Number(form.priceNgn),
      price1Ngn: form.price1Ngn ? Number(form.price1Ngn) : null,
      price5Ngn: form.price5Ngn ? Number(form.price5Ngn) : null,
      shootMode: form.shootMode,
      aspectRatio: form.aspectRatio,
      packageSize: form.packageSize,
      status: form.status,
      coverStoragePath: coverFromGallery || form.coverStoragePath || undefined,
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

    // Save NEW images
    const uploadedImages = images.filter(i => i.storagePath && !i.fromDb);
    for (let i = 0; i < uploadedImages.length; i++) {
      const img = uploadedImages[i];
      await fetch(`/api/templates/${templateId}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storagePath: img.storagePath,
          displayOrder: i,
          purpose: img.purpose,
          tag: img.purpose === "tagged" ? img.tag : undefined,
          customName: img.purpose === "tagged" ? (img.customName?.trim() || undefined) : undefined,
          note: img.note?.trim() || undefined,
        }),
      });
    }
    // PATCH fromDb images with any updated tag/note
    const fromDbImages = images.filter(i => i.fromDb);
    for (const img of fromDbImages) {
      await fetch(`/api/templates/${templateId}/images`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId: img.localId, tag: img.tag, customName: img.customName?.trim() || null, note: img.note?.trim() || null }),
      });
    }

    // Save new sample images (existing fromDb ones are already in DB; deletions are done in real-time)
    const newSamples = sampleImages.filter(s => s.storagePath && !s.fromDb);
    for (let i = 0; i < newSamples.length; i++) {
      await fetch(`/api/templates/${templateId}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath: newSamples[i].storagePath, displayOrder: i, purpose: "sample" }),
      });
    }

    setSaving(false);
    setPanel("none");
    setForm(defaultForm());
    setImages([]);
    setSampleImages([]);
    setCoverPreview("");
    loadDashboard();
  };

  const saveStorefront = async () => {
    setStorefrontSaving(true);
    await fetch("/api/creator/storefront", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: storefrontTheme, fontFamily: storefrontFont }),
    });
    setStorefrontSaving(false);
    setStorefrontSaved(true);
    setTimeout(() => setStorefrontSaved(false), 2000);
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

      {/* Storefront settings */}
      <div className={styles.storefrontSection}>
        <button type="button" className={styles.storefrontToggle} onClick={() => setStorefrontOpen(o => !o)}>
          <span>Storefront Settings</span>
          <span>{storefrontOpen ? "▲" : "▼"}</span>
        </button>
        {storefrontOpen && (
          <div className={styles.storefrontContent}>
            <div className={styles.storefrontGroup}>
              <span className={styles.label}>Theme</span>
              <div className={styles.themeGrid}>
                {THEMES.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    className={`${styles.themeCard} ${storefrontTheme === t.value ? styles.themeCardActive : ""}`}
                    onClick={() => setStorefrontTheme(t.value)}
                  >
                    <div className={styles.themePreview} style={{ background: t.previewBg }} />
                    <div className={styles.themeAccentDot} style={{ background: t.previewAccent }} />
                    <div className={styles.themeCardLabel}>{t.label}</div>
                    <div className={styles.themeCardDesc}>{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.storefrontGroup}>
              <span className={styles.label}>Font pairing</span>
              <div className={styles.fontList}>
                {FONTS.map(f => (
                  <button
                    key={f.value}
                    type="button"
                    className={`${styles.fontItem} ${storefrontFont === f.value ? styles.fontItemActive : ""}`}
                    onClick={() => setStorefrontFont(f.value)}
                  >
                    <span className={styles.fontItemLabel}>{f.label}</span>
                    <span className={styles.fontItemDesc}>{f.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.storefrontActions}>
              {creator && (
                <a
                  href={`/creators/${creator.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.storefrontPreviewLink}
                >
                  Preview storefront ↗
                </a>
              )}
              <button
                type="button"
                className={styles.storefrontSaveBtn}
                onClick={saveStorefront}
                disabled={storefrontSaving}
              >
                {storefrontSaved ? "Saved!" : storefrontSaving ? "Saving..." : "Save storefront"}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>My Templates</h2>
        {panel === "none" && (
          <button type="button" className={styles.newBtn} onClick={() => { setPanel("create"); setForm(defaultForm()); setImages([]); setSampleImages([]); setCoverPreview(""); }}>
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
                <button type="button" className={styles.actionBtn} onClick={() => copyLink(t.id)}>
                  {copiedId === t.id ? "Copied!" : "Copy link"}
                </button>
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
              <span className={styles.label}>10-image price (₦) *</span>
              <input className={styles.input} type="number" value={form.priceNgn} onChange={e => setForm(f => ({ ...f, priceNgn: e.target.value }))} placeholder="e.g. 25000" min={1000} />
              {form.priceNgn && Number(form.priceNgn) > feeNgn
                ? <span className={styles.earnPreview}>You earn ₦{(Number(form.priceNgn) - feeNgn).toLocaleString()} per sale</span>
                : form.priceNgn && <span className={styles.earnWarn}>Must be more than ₦{feeNgn.toLocaleString()} platform fee</span>
              }
            </label>

            <label className={styles.field}>
              <span className={styles.label}>1-image price (₦) <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span></span>
              <input className={styles.input} type="number" value={form.price1Ngn} onChange={e => setForm(f => ({ ...f, price1Ngn: e.target.value }))} placeholder={`e.g. ${packagePrice(feeNgn, 1) + 500}`} min={1} />
              {form.price1Ngn && Number(form.price1Ngn) > packagePrice(feeNgn, 1)
                ? <span className={styles.earnPreview}>You earn ₦{(Number(form.price1Ngn) - packagePrice(feeNgn, 1)).toLocaleString()}</span>
                : form.price1Ngn && <span className={styles.earnWarn}>Must be more than ₦{packagePrice(feeNgn, 1).toLocaleString()}</span>
              }
            </label>
          </div>

          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span className={styles.label}>5-image price (₦) <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span></span>
              <input className={styles.input} type="number" value={form.price5Ngn} onChange={e => setForm(f => ({ ...f, price5Ngn: e.target.value }))} placeholder={`e.g. ${packagePrice(feeNgn, 5) + 2500}`} min={1} />
              {form.price5Ngn && Number(form.price5Ngn) > packagePrice(feeNgn, 5)
                ? <span className={styles.earnPreview}>You earn ₦{(Number(form.price5Ngn) - packagePrice(feeNgn, 5)).toLocaleString()}</span>
                : form.price5Ngn && <span className={styles.earnWarn}>Must be more than ₦{packagePrice(feeNgn, 5).toLocaleString()}</span>
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

          {/* Reference images — mode-aware */}
          <div className={styles.field}>
            <span className={styles.label}>Reference images ({images.length}/8)</span>

            {form.shootMode === "fast" ? (
              <>
                <p className={styles.fieldHint}>Upload the look / inspiration image that defines the outfit, setting, and mood.</p>
                <div className={styles.imagesGrid}>
                  {images.map((img, i) => (
                    <div key={img.localId} className={styles.imgItem}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.preview} alt="" className={styles.imgPreview} />
                      {img.uploading && <div className={styles.imgOverlay}>Uploading...</div>}
                      {img.error && <div className={styles.imgError}>{img.error}</div>}
                      {img.fromDb && <div className={styles.imgDbBadge}>saved</div>}
                      <button type="button" className={styles.imgRemove} onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}>✕</button>
                    </div>
                  ))}
                  {images.length < 8 && (
                    <button type="button" className={styles.addImgBtn} onClick={() => { setPendingTag("inspiration"); imgInputRef.current?.click(); }}>
                      + Add
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className={styles.fieldHint}>Advanced mode: add a main inspiration image, then optional override references for specific elements. Buyers&apos; portraits will use these references to match each category.</p>

                {/* Inspiration */}
                {(() => {
                  const insps = images.filter(img => img.purpose === "inspiration");
                  return (
                    <div className={styles.advancedRefSection}>
                      <span className={styles.advancedRefLabel}>Inspiration <span className={styles.advancedRefNote}>— main look, outfit &amp; mood (required)</span></span>
                      <div className={styles.imagesGrid}>
                        {insps.map(img => {
                          const i = images.findIndex(x => x.localId === img.localId);
                          return (
                            <div key={img.localId} className={styles.imgItem}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={img.preview} alt="" className={styles.imgPreview} />
                              {img.uploading && <div className={styles.imgOverlay}>Uploading...</div>}
                              {img.error && <div className={styles.imgError}>{img.error}</div>}
                              {img.fromDb && <div className={styles.imgDbBadge}>saved</div>}
                              <button type="button" className={styles.imgRemove} onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}>✕</button>
                            </div>
                          );
                        })}
                        {insps.length === 0 && images.length < 8 && (
                          <button type="button" className={styles.addImgBtn} onClick={() => { setPendingTag("inspiration"); imgInputRef.current?.click(); }}>
                            + Add inspiration
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Tagged references — inline tag pills + note per image */}
                <div className={styles.advancedRefSection}>
                  <span className={styles.advancedRefLabel}>Tagged references <span className={styles.advancedRefNote}>— upload images and tag each one (optional)</span></span>
                  {images.filter(img => img.purpose === "tagged").map(img => (
                    <div key={img.localId} className={styles.taggedRefCard}>
                      <div className={styles.taggedRefTop}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.preview} alt="" className={styles.taggedRefThumb} />
                        <div className={styles.taggedRefRight}>
                          <div className={styles.tagPills}>
                            {TEMPLATE_TAGS.map(t => (
                              <button
                                key={t}
                                type="button"
                                className={`${styles.tagPill} ${img.tag === t ? styles.tagPillActive : ""}`}
                                onClick={() => setImages(prev => prev.map(x => x.localId === img.localId ? { ...x, tag: t } : x))}
                              >
                                {t.replace("_", " ")}
                              </button>
                            ))}
                          </div>
                          <input
                            type="text"
                            className={styles.noteInput}
                            value={img.customName}
                            onChange={e => setImages(prev => prev.map(x => x.localId === img.localId ? { ...x, customName: e.target.value } : x))}
                            placeholder="Reference name (optional)..."
                            maxLength={80}
                          />
                          <textarea
                            className={styles.noteInput}
                            value={img.note}
                            onChange={e => setImages(prev => prev.map(x => x.localId === img.localId ? { ...x, note: e.target.value } : x))}
                            placeholder="Styling note (optional)..."
                            rows={2}
                            maxLength={200}
                          />
                        </div>
                        <button
                          type="button"
                          className={styles.taggedRefRemove}
                          onClick={async () => {
                            if (img.fromDb) {
                              await fetch(`/api/templates/${panel}/images`, {
                                method: "DELETE",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ imageId: img.localId }),
                              });
                            }
                            setImages(prev => prev.filter(x => x.localId !== img.localId));
                          }}
                        >✕</button>
                      </div>
                      {img.uploading && <div className={styles.taggedRefStatus}>Uploading...</div>}
                      {img.error && <div className={styles.taggedRefError}>{img.error}</div>}
                    </div>
                  ))}
                  {images.length < 8 && (
                    <button
                      type="button"
                      className={`${styles.addImgBtn} ${styles.addImgBtnSm}`}
                      onClick={() => { setPendingTag("__tagged__"); imgInputRef.current?.click(); }}
                    >
                      + Add reference
                    </button>
                  )}
                </div>
              </>
            )}

            <input type="file" accept="image/*" multiple ref={imgInputRef} className={styles.hidden} onChange={e => { if (e.target.files) addImages(e.target.files); e.target.value = ""; }} />
          </div>

          {/* Gallery images — public showcase; first image = marketplace card thumbnail */}
          <div className={styles.field}>
            <span className={styles.label}>Gallery images ({sampleImages.length}/10)</span>
            <p className={styles.fieldHint}>
              Upload up to 10 images shown in the public gallery. The first image is used as the template thumbnail on the marketplace listing. Workflow reference images are kept private from buyers.
            </p>
            <div className={styles.imagesGrid}>
              {sampleImages.map((item, idx) => (
                <div key={item.localId} className={styles.imgItem}>
                  {idx === 0 && <div className={styles.imgDbBadge} style={{ background: "var(--accent, #2d9)" }}>cover</div>}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.preview} alt="" className={styles.imgPreview} />
                  {item.uploading && <div className={styles.imgOverlay}>Uploading...</div>}
                  {item.error && <div className={styles.imgError}>{item.error}</div>}
                  {item.fromDb && idx !== 0 && <div className={styles.imgDbBadge}>saved</div>}
                  <button
                    type="button"
                    className={styles.imgRemove}
                    onClick={() => removeSampleImage(item, panel === "create" ? null : panel)}
                  >✕</button>
                </div>
              ))}
              {sampleImages.length < 10 && (
                <button type="button" className={styles.addImgBtn} onClick={() => sampleImgInputRef.current?.click()}>
                  + Add image
                </button>
              )}
            </div>
            <input
              type="file"
              accept="image/*"
              multiple
              ref={sampleImgInputRef}
              className={styles.hidden}
              onChange={e => { if (e.target.files) addSampleFiles(e.target.files); e.target.value = ""; }}
            />
            {images.length >= 2 && (
              <button
                type="button"
                className={styles.collageCoverBtn}
                onClick={() => setShowCollageEditor(true)}
              >
                Create collage cover from workflow refs
              </button>
            )}
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
                          {galleryAdded.has(img.id) && (
                            <button
                              type="button"
                              className={styles.showcaseActionBtn}
                              onClick={() => setAsCover(showcaseTemplateId, galleryAdded.get(img.id)!, img.id)}
                              disabled={settingCover === img.id}
                            >
                              {settingCover === img.id ? "Setting..." : "Set as cover"}
                            </button>
                          )}
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

      {/* Collage cover editor modal */}
      {showCollageEditor && (
        <CollageEditor
          templateId={panel === "create" ? "" : panel}
          images={images
            .filter(img => img.storagePath || img.fromDb)
            .map((img): CollageImage => ({ id: img.localId, url: img.preview }))}
          onSave={(storagePath, previewUrl) => {
            setForm(f => ({ ...f, coverStoragePath: storagePath }));
            setCoverPreview(previewUrl);
            setShowCollageEditor(false);
          }}
          onClose={() => setShowCollageEditor(false)}
        />
      )}
    </div>
  );
}

export default function CreatorDashboardPage() {
  return (
    <Suspense>
      <CreatorDashboard />
    </Suspense>
  );
}
