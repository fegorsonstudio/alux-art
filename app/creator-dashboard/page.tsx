"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { TEMPLATE_CATEGORIES, ASPECTS, packagePrice } from "@/lib/types";
import type { AspectRatio } from "@/lib/types";
import { THEMES, FONTS } from "@/lib/storefront-themes";
import styles from "./creator-dashboard.module.css";
import ImagePreview from "@/components/ImagePreview";
import { resizeIfNeeded } from "@/lib/resize-image";
import CollageEditor, { type CollageImage } from "./CollageEditor";
import { Analytics } from "@/lib/analytics";
import TemplateShareCard from "@/components/TemplateShareCard";

const TEMPLATE_TAGS = ["OUTFIT", "HAIRSTYLE", "MAKEUP", "NAIL_DESIGN", "BACKGROUND", "LIGHTING", "ACCESSORY", "WIG", "GOWN", "COLLAR_MALE", "COLLAR_FEMALE"] as const;
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
  template_images: Array<{ id: string; display_order: number; purpose: string; tag?: string; note?: string | null; custom_name?: string | null; note_hidden?: boolean | null; storage_path?: string; storage_bucket?: string; signed_url?: string | null }>;
  created_at: string;
  is_story?: boolean;
  story_type?: string | null;
  default_role?: string | null;
  role_chips?: string[];
  scenes?: StoryScene[];
  background_options?: Array<{ id: string; name: string; kind: "photo" | "text"; description?: string; imagePath?: string; imageBucket?: string }> | null;
  option_groups?: Array<{ id: string; type: string; label: string; options: Array<{ id: string; name: string; kind: "photo" | "text"; description?: string; imagePath?: string; imageBucket?: string }> }> | null;
  flag_shot?: { enabled?: boolean; imagePath?: string; imageBucket?: string } | null;
  trend_slots?: {
    mugshot?: { enabled?: boolean; imagePath?: string; imageBucket?: string } | null;
    bowl?: { enabled?: boolean; imagePath?: string; imageBucket?: string } | null;
    viral?: { enabled?: boolean; imagePath?: string; imageBucket?: string } | null;
  } | null;
  pose_options?: Array<{ id: string; name: string; description?: string; imagePath: string; imageBucket?: string }> | null;
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
interface Creator { id: string; display_name: string; username?: string | null; paystack_subaccount_code?: string; theme?: string; font_family?: string; status?: string | null; }

// Client-side proxy URL builder — mirrors lib/r2.ts's r2ProxyUrl exactly, but
// that file is `import "server-only"` so it can't be imported here directly.
function mediaUrl(bucket: string, path: string): string {
  return `/api/media?b=${encodeURIComponent(bucket)}&p=${encodeURIComponent(path)}`;
}

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
  noteHidden: boolean;
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

interface StoryScene {
  slot: number;
  title: string;
  description: string;
  environment: string;
  wardrobe: string;
  coCharacter: string;
}

const defaultScene = (slot: number): StoryScene => ({
  slot, title: "", description: "", environment: "", wardrobe: "", coCharacter: "",
});

// Buyer background options (call_to_bar templates)
interface BackgroundOptionDraft {
  id: string;               // uuid; existing option id when fromDb
  name: string;
  kind: "photo" | "text";
  description: string;
  imagePath: string;        // storage path once uploaded
  preview: string;          // object URL or signed URL
  uploading: boolean;
  fromDb?: boolean;
  error?: string;
}

const MAX_BG_OPTIONS = 6;

// Buyer choice groups — pick-one-per-group styling options (all categories).
// Props are multi-select: buyers pick as many as they want (or none).
type ChoiceGroupType = "outfit" | "hairstyle" | "makeup" | "nails" | "shoes" | "accessory" | "color_grade" | "props";
const GROUP_TYPE_META: Record<ChoiceGroupType, { tag: string; label: string }> = {
  outfit:      { tag: "OUTFIT",      label: "Outfit" },
  hairstyle:   { tag: "HAIRSTYLE",   label: "Hairstyle" },
  makeup:      { tag: "MAKEUP",      label: "Makeup" },
  nails:       { tag: "NAIL_DESIGN", label: "Nails" },
  shoes:       { tag: "ACCESSORY",   label: "Shoes" },
  accessory:   { tag: "ACCESSORY",   label: "Accessory" },
  color_grade: { tag: "COLOR_GRADE", label: "Color grade" },
  props:       { tag: "ACCESSORY",   label: "Props" },
};
const MAX_CHOICE_GROUPS = 6;
const MAX_GROUP_OPTIONS = 6;

interface ChoiceOptionDraft {
  id: string;
  name: string;
  kind: "photo" | "text";
  description: string;
  imagePath: string;
  preview: string;
  uploading: boolean;
  fromDb?: boolean;
  error?: string;
}

interface ChoiceGroupDraft {
  id: string;
  type: ChoiceGroupType;
  label: string;
  options: ChoiceOptionDraft[];
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
  isStory: false,
  storyType: "solo" as "solo" | "duo" | "group" | "brand",
  defaultRole: "",
  roleChipsInput: "",
});

function CreatorDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [creator, setCreator] = useState<Creator | null>(null);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [panel, setPanel] = useState<"none" | "create" | string>("none"); // "create" or templateId
  const [form, setForm] = useState(defaultForm());
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [sampleImages, setSampleImages] = useState<SampleImageItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const imgInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const sampleImgInputRef = useRef<HTMLInputElement>(null);
  const formPanelRef = useRef<HTMLDivElement>(null);
  const [coverPreview, setCoverPreview] = useState("");
  const pendingTagRef = useRef<string>("inspiration");
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [storyScenes, setStoryScenes] = useState<StoryScene[]>([defaultScene(1)]);
  const [backgroundOptions, setBackgroundOptions] = useState<BackgroundOptionDraft[]>([]);
  const [choiceGroups, setChoiceGroups] = useState<ChoiceGroupDraft[]>([]);
  // Flag shot (Call to Bar)
  const [flagShotEnabled, setFlagShotEnabled] = useState(false);
  const [flagShotImagePath, setFlagShotImagePath] = useState("");
  const [flagShotPreview, setFlagShotPreview] = useState("");
  const [flagShotUploading, setFlagShotUploading] = useState(false);
  const [flagShotIsNew, setFlagShotIsNew] = useState(false);

  // Trend slots (Trending category): mugshot board + business bowl plates.
  // One state record per slot, same lifecycle as the flag shot.
  interface TrendSlotDraft { enabled: boolean; imagePath: string; preview: string; uploading: boolean; isNew: boolean }
  const emptyTrendSlot = (): TrendSlotDraft => ({ enabled: false, imagePath: "", preview: "", uploading: false, isNew: false });
  const [trendMugshot, setTrendMugshot] = useState<TrendSlotDraft>(emptyTrendSlot());
  const [trendBowl, setTrendBowl] = useState<TrendSlotDraft>(emptyTrendSlot());
  const [trendViral, setTrendViral] = useState<TrendSlotDraft>(emptyTrendSlot());

  // Signature poses (pose-mimic templates, any category): a variety pool the
  // planner randomly draws from (no repeats per shoot) — buyers never pick.
  interface PoseOptionDraft { id: string; name: string; description: string; imagePath: string; preview: string; uploading: boolean; fromDb?: boolean }
  const [poseOptions, setPoseOptions] = useState<PoseOptionDraft[]>([]);

  // Asset library picker (reuse photos from previous templates, or import
  // from the cross-creator community library for custom-slot plates)
  type LibraryTarget = "group" | "background" | "pose" | "trend-mugshot" | "trend-bowl" | "trend-viral" | "flag";
  const [libraryPicker, setLibraryPicker] = useState<{ target: LibraryTarget; groupId?: string } | null>(null);
  const [libraryFilter, setLibraryFilter] = useState<string>("all");
  const [libraryTab, setLibraryTab] = useState<"mine" | "community">("mine");
  const [communitySetups, setCommunitySetups] = useState<Array<{ id: string; kind: string; name: string; imageUrl: string; creatorName: string; isMine: boolean }>>([]);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [communityImporting, setCommunityImporting] = useState<string | null>(null);

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
  const [qrTemplateId, setQrTemplateId] = useState<string | null>(null);
  const [platformFeeNgn, setPlatformFeeNgn] = useState(15000);
  const [showCollageEditor, setShowCollageEditor] = useState(false);
  const [storefrontOpen, setStorefrontOpen] = useState(false);
  const [storefrontTheme, setStorefrontTheme] = useState("alux");
  const [storefrontFont, setStorefrontFont] = useState("default");
  const [storefrontSaving, setStorefrontSaving] = useState(false);
  const [storefrontSaved, setStorefrontSaved] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid" | "saving" | "saved">("idle");
  const [usernameMsg, setUsernameMsg] = useState("");
  const usernameCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showcaseIdInputRef = useRef<HTMLInputElement>(null);

  const loadDashboard = useCallback(async () => {
    try {
      const res = await fetch("/api/creator-dashboard");
      if (res.status === 401) { router.push("/login?redirect=/creator-dashboard"); return; }
      if (res.status === 404) { router.push("/become-creator"); return; }
      if (!res.ok) { setLoadError(true); setLoading(false); return; }
      const d = await res.json();
      setCreator(d.creator);
      setUsernameInput(d.creator.username ?? "");
      setTemplates(d.templates ?? []);
      setStats(d.stats);
      setLoading(false);
      Analytics.creatorDashboard();
    } catch {
      setLoadError(true);
      setLoading(false);
    }
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
          isStory: false,
          storyType: "solo" as const,
          defaultRole: "",
          roleChipsInput: "",
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
    // Always hydrate the editor from a fresh server read. The templates list may be
    // stale (a dashboard tab left open across saves elsewhere), and Save overwrites
    // the template with whatever was hydrated — stale data here silently wipes
    // scenes/background options/settings on the next save.
    try {
      const res = await fetch(`/api/templates/${t.id}`);
      if (res.ok) {
        const d = await res.json();
        if (d.template) t = { ...t, ...d.template, cover_url: t.cover_url };
      }
    } catch { /* fall back to the list row */ }

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
      isStory: t.is_story === true,
      storyType: (["solo", "duo", "group", "brand"].includes(String(t.story_type ?? "")) ? t.story_type : "solo") as "solo" | "duo" | "group" | "brand",
      defaultRole: t.default_role ?? "",
      roleChipsInput: (t.role_chips ?? []).join(", "),
    });
    if (Array.isArray(t.scenes) && t.scenes.length > 0) {
      setStoryScenes(t.scenes.map((s, i) => ({ ...defaultScene(i + 1), ...s })));
    } else {
      setStoryScenes([defaultScene(1)]);
    }
    // Hydrate background options; join previews from template_images by storage_path
    const bgImgs = t.template_images ?? [];
    setBackgroundOptions((Array.isArray(t.background_options) ? t.background_options : []).map((o) => ({
      id: o.id,
      name: o.name ?? "",
      kind: o.kind === "text" ? "text" as const : "photo" as const,
      description: o.description ?? "",
      imagePath: o.imagePath ?? "",
      preview: o.imagePath ? (bgImgs.find(img => img.storage_path === o.imagePath)?.signed_url ?? "") : "",
      uploading: false,
      fromDb: true,
    })));
    // Hydrate flag shot
    const fs = t.flag_shot ?? null;
    setFlagShotEnabled(!!fs?.enabled);
    setFlagShotImagePath(fs?.imagePath ?? "");
    setFlagShotIsNew(false);
    setFlagShotPreview(fs?.imagePath ? (bgImgs.find(img => img.storage_path === fs.imagePath)?.signed_url ?? "") : "");
    // Hydrate trend slots
    const hydrateTrend = (p?: { enabled?: boolean; imagePath?: string } | null) => ({
      enabled: !!p?.enabled,
      imagePath: p?.imagePath ?? "",
      preview: p?.imagePath ? (bgImgs.find(img => img.storage_path === p.imagePath)?.signed_url ?? "") : "",
      uploading: false,
      isNew: false,
    });
    setTrendMugshot(hydrateTrend(t.trend_slots?.mugshot));
    setTrendBowl(hydrateTrend(t.trend_slots?.bowl));
    setTrendViral(hydrateTrend(t.trend_slots?.viral));
    // Hydrate signature poses
    setPoseOptions((Array.isArray(t.pose_options) ? t.pose_options : []).map(p => ({
      id: p.id,
      name: p.name,
      description: p.description ?? "",
      imagePath: p.imagePath,
      preview: mediaUrl(p.imageBucket ?? "template-images", p.imagePath),
      uploading: false,
      fromDb: true,
    })));
    // Hydrate choice groups the same way
    setChoiceGroups((Array.isArray(t.option_groups) ? t.option_groups : []).map((g) => ({
      id: g.id,
      type: (g.type in GROUP_TYPE_META ? g.type : "outfit") as ChoiceGroupType,
      label: g.label ?? GROUP_TYPE_META[(g.type in GROUP_TYPE_META ? g.type : "outfit") as ChoiceGroupType].label,
      options: (g.options ?? []).map((o) => ({
        id: o.id,
        name: o.name ?? "",
        kind: o.kind === "text" ? "text" as const : "photo" as const,
        description: o.description ?? "",
        imagePath: o.imagePath ?? "",
        preview: o.imagePath ? (bgImgs.find(img => img.storage_path === o.imagePath)?.signed_url ?? "") : "",
        uploading: false,
        fromDb: true,
      })),
    })));
    setCoverPreview(t.cover_url ?? "");
    // Use already-loaded template_images (signed URLs included from dashboard API)
    // Background-option and choice-group photos are managed in their own editors —
    // keep them out of the generic workflow list
    const bgOptionPaths = new Set([
      ...(Array.isArray(t.background_options) ? t.background_options : []).map(o => o.imagePath).filter(Boolean),
      ...(Array.isArray(t.option_groups) ? t.option_groups : []).flatMap(g => (g.options ?? []).map(o => o.imagePath)).filter(Boolean),
      ...(t.flag_shot?.imagePath ? [t.flag_shot.imagePath] : []),
      ...(t.trend_slots?.mugshot?.imagePath ? [t.trend_slots.mugshot.imagePath] : []),
      ...(t.trend_slots?.bowl?.imagePath ? [t.trend_slots.bowl.imagePath] : []),
      ...(t.trend_slots?.viral?.imagePath ? [t.trend_slots.viral.imagePath] : []),
    ]);
    const imgs = t.template_images ?? [];
    const existingImages: UploadedImage[] = imgs
      .filter(img => img.storage_path && (img.purpose === "inspiration" || img.purpose === "tagged") && !bgOptionPaths.has(img.storage_path))
      .map(img => ({
        localId: img.id,
        preview: img.signed_url ?? "",
        storagePath: img.storage_path ?? "",
        purpose: img.purpose as "inspiration" | "tagged",
        tag: img.tag ?? "OUTFIT",
        customName: img.custom_name ?? "",
        note: img.note ?? "",
        noteHidden: img.note_hidden === true,
        uploading: false,
        fromDb: true,
      }));
    setImages(existingImages);
    const existingSamples: SampleImageItem[] = imgs
      .filter(img => img.storage_path && img.purpose === "sample")
      .map(img => ({
        localId: img.id,
        preview: img.signed_url ?? "",
        storagePath: img.storage_path ?? "",
        uploading: false,
        fromDb: true,
      }));
    setSampleImages(existingSamples);
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
      isStory: false,
      storyType: "solo" as const,
      defaultRole: "",
      roleChipsInput: "",
    });
    setImages([]);
    setCoverPreview("");
    setBackgroundOptions([]); setChoiceGroups([]); setFlagShotEnabled(false); setFlagShotImagePath(""); setFlagShotPreview(""); setFlagShotIsNew(false); setTrendMugshot(emptyTrendSlot()); setTrendBowl(emptyTrendSlot()); setTrendViral(emptyTrendSlot()); setPoseOptions([]);
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
    const f = await resizeIfNeeded(file);
    const res = await fetch("/api/upload/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: f.name, contentType: f.type, size: f.size, bucket: "identity-images" }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg = errBody?.error ?? `Upload failed (${res.status})`;
      setShowcaseIdentityRefs(prev => prev.map(r => r.localId === localId ? { ...r, uploading: false, error: msg } : r));
      return;
    }
    const { uploadUrl, storagePath, storageBucket } = await res.json();
    const putRes = await fetch(uploadUrl, { method: "PUT", body: f, headers: { "Content-Type": f.type } });
    if (!putRes.ok) {
      setShowcaseIdentityRefs(prev => prev.map(r => r.localId === localId ? { ...r, uploading: false, error: `R2 PUT failed (${putRes.status})` } : r));
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
    if (d.bypass && d.callbackUrl) {
      window.location.href = d.callbackUrl;
    } else {
      window.location.href = d.authorizationUrl;
    }
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
    const f = await resizeIfNeeded(file);
    const form = new FormData();
    form.append("file", f, f.name);
    form.append("bucket", "template-images");
    const res = await fetch("/api/upload/file", { method: "POST", body: form });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg = errBody?.error ?? `Upload failed (${res.status})`;
      setImages(prev => prev.map(img => img.localId === localId ? { ...img, uploading: false, error: msg } : img));
      return;
    }
    const { storagePath } = await res.json();
    setImages(prev => prev.map(img => img.localId === localId ? { ...img, uploading: false, storagePath } : img));
  };

  const replaceImage = async (file: File, localId: string) => {
    setImages(prev => prev.map(img => img.localId === localId ? { ...img, uploading: true, error: undefined } : img));
    const f = await resizeIfNeeded(file);
    const form = new FormData();
    form.append("file", f, f.name);
    form.append("bucket", "template-images");
    const uploadRes = await fetch("/api/upload/file", { method: "POST", body: form });
    if (!uploadRes.ok) {
      const errBody = await uploadRes.json().catch(() => ({}));
      const msg = errBody?.error ?? `Upload failed (${uploadRes.status})`;
      setImages(prev => prev.map(img => img.localId === localId ? { ...img, uploading: false, error: msg } : img));
      return;
    }
    const { storagePath } = await uploadRes.json();
    const target = images.find(i => i.localId === localId);
    if (target?.fromDb && panel !== "create") {
      const patchRes = await fetch(`/api/templates/${panel}/images`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId: localId, storagePath }),
      });
      if (!patchRes.ok) {
        setImages(prev => prev.map(img => img.localId === localId ? { ...img, uploading: false, error: "Replace failed" } : img));
        return;
      }
    }
    const newPreview = URL.createObjectURL(file);
    setImages(prev => prev.map(img => img.localId === localId ? { ...img, uploading: false, storagePath, preview: newPreview } : img));
  };

  const addImages = (files: FileList) => {
    if (images.length >= 20) { setFormError("Maximum 20 images per template"); return; }
    const remaining = 20 - images.length;
    const toAdd = Array.from(files).slice(0, remaining);
    const purpose: "inspiration" | "tagged" = pendingTagRef.current === "inspiration" ? "inspiration" : "tagged";
    const tag = (pendingTagRef.current === "inspiration" || pendingTagRef.current === "__tagged__") ? "OUTFIT" : pendingTagRef.current;
    const newImgs: UploadedImage[] = toAdd.map(file => {
      const localId = crypto.randomUUID();
      return { localId, file, preview: URL.createObjectURL(file), storagePath: "", purpose, tag, customName: "", note: "", noteHidden: false, uploading: false };
    });
    setImages(prev => [...prev, ...newImgs]);
    newImgs.forEach(img => uploadFile(img.file!, img.localId));
  };

  const uploadSampleFile = async (file: File, localId: string) => {
    setSampleImages(prev => prev.map(s => s.localId === localId ? { ...s, uploading: true } : s));
    const f = await resizeIfNeeded(file);
    const form = new FormData();
    form.append("file", f, f.name);
    form.append("bucket", "template-images");
    const res = await fetch("/api/upload/file", { method: "POST", body: form });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg = errBody?.error ?? `Upload failed (${res.status})`;
      setSampleImages(prev => prev.map(s => s.localId === localId ? { ...s, uploading: false, error: msg } : s));
      return;
    }
    const { storagePath } = await res.json();
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

  const uploadBackgroundOptionFile = async (file: File, optionId: string) => {
    setBackgroundOptions(prev => prev.map(o => o.id === optionId ? { ...o, uploading: true, error: undefined } : o));
    const f = await resizeIfNeeded(file);
    const fd = new FormData();
    fd.append("file", f, f.name);
    fd.append("bucket", "template-images");
    const res = await fetch("/api/upload/file", { method: "POST", body: fd });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      setBackgroundOptions(prev => prev.map(o => o.id === optionId ? { ...o, uploading: false, error: errBody?.error ?? "Upload failed" } : o));
      return;
    }
    const { storagePath } = await res.json();
    setBackgroundOptions(prev => prev.map(o => o.id === optionId ? { ...o, uploading: false, imagePath: storagePath, preview: URL.createObjectURL(file) } : o));
  };

  const uploadChoiceOptionFile = async (file: File, groupId: string, optionId: string) => {
    const setOpt = (patch: Partial<ChoiceOptionDraft>) =>
      setChoiceGroups(prev => prev.map(g => g.id === groupId
        ? { ...g, options: g.options.map(o => o.id === optionId ? { ...o, ...patch } : o) }
        : g));
    setOpt({ uploading: true, error: undefined });
    const f = await resizeIfNeeded(file);
    const fd = new FormData();
    fd.append("file", f, f.name);
    fd.append("bucket", "template-images");
    const res = await fetch("/api/upload/file", { method: "POST", body: fd });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      setOpt({ uploading: false, error: errBody?.error ?? "Upload failed" });
      return;
    }
    const { storagePath } = await res.json();
    setOpt({ uploading: false, imagePath: storagePath, preview: URL.createObjectURL(file) });
  };

  const uploadFlagShotFile = async (file: File) => {
    setFlagShotUploading(true);
    const f = await resizeIfNeeded(file);
    const fd = new FormData();
    fd.append("file", f, f.name);
    fd.append("bucket", "template-images");
    const res = await fetch("/api/upload/file", { method: "POST", body: fd });
    if (!res.ok) { setFlagShotUploading(false); setFormError("Flag image upload failed"); return; }
    const { storagePath } = await res.json();
    setFlagShotImagePath(storagePath);
    setFlagShotPreview(URL.createObjectURL(file));
    setFlagShotIsNew(true);
    setFlagShotUploading(false);
  };

  const uploadTrendPlateFile = async (file: File, which: "mugshot" | "bowl" | "viral") => {
    const set = which === "mugshot" ? setTrendMugshot : which === "bowl" ? setTrendBowl : setTrendViral;
    set(s => ({ ...s, uploading: true }));
    const f = await resizeIfNeeded(file);
    const fd = new FormData();
    fd.append("file", f, f.name);
    fd.append("bucket", "template-images");
    const res = await fetch("/api/upload/file", { method: "POST", body: fd });
    if (!res.ok) { set(s => ({ ...s, uploading: false })); setFormError("Plate image upload failed"); return; }
    const { storagePath } = await res.json();
    set(s => ({ ...s, imagePath: storagePath, preview: URL.createObjectURL(file), isNew: true, uploading: false }));
  };

  const uploadPoseOptionFile = async (file: File, poseId: string) => {
    setPoseOptions(prev => prev.map(p => p.id === poseId ? { ...p, uploading: true } : p));
    const f = await resizeIfNeeded(file);
    const fd = new FormData();
    fd.append("file", f, f.name);
    fd.append("bucket", "template-images");
    const res = await fetch("/api/upload/file", { method: "POST", body: fd });
    if (!res.ok) {
      setPoseOptions(prev => prev.map(p => p.id === poseId ? { ...p, uploading: false } : p));
      setFormError("Pose image upload failed");
      return;
    }
    const { storagePath } = await res.json();
    setPoseOptions(prev => prev.map(p => p.id === poseId ? { ...p, imagePath: storagePath, preview: URL.createObjectURL(file), uploading: false, fromDb: false } : p));
  };

  // ── Asset library — every photo option used on any of this creator's templates ──
  interface LibraryAsset { imagePath: string; imageBucket: string; name: string; type: string; preview: string; sourceTitle: string; description?: string }
  const MAX_POSE_OPTIONS = 30;
  const libraryAssets: LibraryAsset[] = (() => {
    const seen = new Set<string>();
    const out: LibraryAsset[] = [];
    for (const t of templates) {
      const imgs = t.template_images ?? [];
      const thumb = (p?: string) => (p ? imgs.find(i => i.storage_path === p)?.signed_url ?? "" : "");
      for (const g of (Array.isArray(t.option_groups) ? t.option_groups : [])) {
        for (const o of (g.options ?? [])) {
          if (o.kind !== "photo" || !o.imagePath || seen.has(o.imagePath)) continue;
          seen.add(o.imagePath);
          out.push({ imagePath: o.imagePath, imageBucket: o.imageBucket ?? "template-images", name: o.name, type: g.type in GROUP_TYPE_META ? g.type : "accessory", preview: thumb(o.imagePath), sourceTitle: t.title, description: o.description });
        }
      }
      for (const o of (Array.isArray(t.background_options) ? t.background_options : [])) {
        if (o.kind !== "photo" || !o.imagePath || seen.has(o.imagePath)) continue;
        seen.add(o.imagePath);
        out.push({ imagePath: o.imagePath, imageBucket: o.imageBucket ?? "template-images", name: o.name, type: "background", preview: thumb(o.imagePath), sourceTitle: t.title, description: o.description });
      }
      // Custom-slot plates and signature poses don't need a template_images row —
      // template-images is a public bucket, so the proxy URL renders directly.
      const plate = (p: { enabled?: boolean; imagePath?: string; imageBucket?: string } | null | undefined, type: string, label: string) => {
        if (!p?.enabled || !p.imagePath || seen.has(p.imagePath)) return;
        seen.add(p.imagePath);
        out.push({ imagePath: p.imagePath, imageBucket: p.imageBucket ?? "template-images", name: label, type, preview: mediaUrl(p.imageBucket ?? "template-images", p.imagePath), sourceTitle: t.title });
      };
      plate(t.flag_shot, "flag_plate", "Flag scene");
      plate(t.trend_slots?.mugshot, "mugshot_plate", "Mugshot board");
      plate(t.trend_slots?.bowl, "bowl_plate", "Business bowl");
      plate(t.trend_slots?.viral, "viral_plate", "Viral pose");
      for (const p of (Array.isArray(t.pose_options) ? t.pose_options : [])) {
        if (!p.imagePath || seen.has(p.imagePath)) continue;
        seen.add(p.imagePath);
        out.push({ imagePath: p.imagePath, imageBucket: p.imageBucket ?? "template-images", name: p.name, type: "pose", preview: mediaUrl(p.imageBucket ?? "template-images", p.imagePath), sourceTitle: t.title, description: p.description });
      }
    }
    return out.filter(a => a.preview);
  })();

  const addLibraryAsset = (asset: LibraryAsset) => {
    if (!libraryPicker) return;
    if (libraryPicker.target === "background") {
      setBackgroundOptions(prev => {
        if (prev.length >= MAX_BG_OPTIONS || prev.some(o => o.imagePath === asset.imagePath)) return prev;
        return [...prev, { id: crypto.randomUUID(), name: asset.name, kind: "photo" as const, description: asset.description ?? "", imagePath: asset.imagePath, preview: asset.preview, uploading: false }];
      });
    } else if (libraryPicker.target === "group" && libraryPicker.groupId) {
      setChoiceGroups(prev => prev.map(g => {
        if (g.id !== libraryPicker.groupId) return g;
        if (g.options.length >= MAX_GROUP_OPTIONS || g.options.some(o => o.imagePath === asset.imagePath)) return g;
        return { ...g, options: [...g.options, { id: crypto.randomUUID(), name: asset.name, kind: "photo" as const, description: asset.description ?? "", imagePath: asset.imagePath, preview: asset.preview, uploading: false }] };
      }));
    } else if (libraryPicker.target === "pose") {
      setPoseOptions(prev => {
        if (prev.length >= MAX_POSE_OPTIONS || prev.some(o => o.imagePath === asset.imagePath)) return prev;
        return [...prev, { id: crypto.randomUUID(), name: asset.name, description: asset.description ?? "", imagePath: asset.imagePath, preview: asset.preview, uploading: false }];
      });
    } else if (libraryPicker.target === "flag") {
      setFlagShotImagePath(asset.imagePath); setFlagShotPreview(asset.preview); setFlagShotIsNew(false); setFlagShotEnabled(true);
    } else if (libraryPicker.target === "trend-mugshot") {
      setTrendMugshot(s => ({ ...s, imagePath: asset.imagePath, preview: asset.preview, isNew: false, enabled: true }));
    } else if (libraryPicker.target === "trend-bowl") {
      setTrendBowl(s => ({ ...s, imagePath: asset.imagePath, preview: asset.preview, isNew: false, enabled: true }));
    } else if (libraryPicker.target === "trend-viral") {
      setTrendViral(s => ({ ...s, imagePath: asset.imagePath, preview: asset.preview, isNew: false, enabled: true }));
    }
  };

  // ── Community library (cross-creator setup sharing) ──────────────────────────
  const fetchCommunitySetups = async () => {
    setCommunityLoading(true);
    const res = await fetch("/api/creator-dashboard/shared-setups");
    if (res.ok) {
      const { setups } = await res.json();
      setCommunitySetups(setups);
    }
    setCommunityLoading(false);
  };

  const importCommunitySetup = async (setup: { id: string; name: string }) => {
    setCommunityImporting(setup.id);
    const res = await fetch("/api/creator-dashboard/shared-setups/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: setup.id }),
    });
    setCommunityImporting(null);
    if (!res.ok) { setFormError("Failed to import community setup"); return; }
    const { storagePath, storageBucket, name } = await res.json();
    addLibraryAsset({ imagePath: storagePath, imageBucket: storageBucket, name: name || setup.name, type: "", preview: mediaUrl(storageBucket, storagePath), sourceTitle: "" });
    setLibraryPicker(null);
  };

  const SLOT_KIND_BY_TARGET: Record<string, "flag" | "mugshot" | "bowl" | "viral"> = {
    flag: "flag", "trend-mugshot": "mugshot", "trend-bowl": "bowl", "trend-viral": "viral",
  };

  const publishSlotToCommunity = async (target: "flag" | "trend-mugshot" | "trend-bowl" | "trend-viral", imagePath: string, defaultName: string) => {
    const name = window.prompt("Name this setup for the community library:", defaultName);
    if (!name || !name.trim()) return;
    const res = await fetch("/api/creator-dashboard/shared-setups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: SLOT_KIND_BY_TARGET[target], name: name.trim(), storagePath: imagePath, storageBucket: "template-images" }),
    });
    if (!res.ok) { setFormError("Failed to publish to community"); return; }
    window.alert("Published! Other creators can now find this in the Community tab.");
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

    // Background option validation (call_to_bar only)
    const bgOptionsActive = true; // background options are available for all categories
    if (bgOptionsActive) {
      if (backgroundOptions.some(o => o.uploading)) { setFormError("Please wait for background photos to finish uploading"); return; }
      for (const o of backgroundOptions) {
        if (!o.name.trim()) { setFormError("Every background option needs a name"); return; }
        if (o.kind === "photo" && !o.imagePath) { setFormError(`Background option "${o.name}" needs a photo`); return; }
        if (o.kind === "text" && !o.description.trim()) { setFormError(`Background option "${o.name}" needs a description`); return; }
      }
    }

    // Choice group validation
    if (choiceGroups.some(g => g.options.some(o => o.uploading))) { setFormError("Please wait for choice option photos to finish uploading"); return; }
    for (const g of choiceGroups) {
      if (g.options.length === 0) { setFormError(`The "${g.label}" group needs at least one option (or remove the group)`); return; }
      for (const o of g.options) {
        if (!o.name.trim()) { setFormError(`Every option in "${g.label}" needs a name`); return; }
        if (o.kind === "photo" && !o.imagePath) { setFormError(`"${o.name}" in "${g.label}" needs a photo`); return; }
        if (o.kind === "text" && !o.description.trim()) { setFormError(`"${o.name}" in "${g.label}" needs a description`); return; }
      }
    }

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
      coverStoragePath: form.coverStoragePath || coverFromGallery || undefined,
      isStory: form.isStory,
      storyType: form.isStory ? form.storyType : null,
      defaultRole: form.isStory ? form.defaultRole.trim() || null : null,
      roleChips: form.isStory ? form.roleChipsInput.split(",").map(c => c.trim()).filter(Boolean).slice(0, 6) : [],
      scenes: form.isStory ? storyScenes : [],
      backgroundOptions: bgOptionsActive
        ? backgroundOptions.map(o => ({
            id: o.id,
            name: o.name.trim(),
            kind: o.kind,
            description: o.kind === "text" ? o.description.trim() : undefined,
            imagePath: o.kind === "photo" ? o.imagePath : undefined,
          }))
        : [],
      optionGroups: choiceGroups.map(g => ({
        id: g.id,
        type: g.type,
        label: g.label.trim() || GROUP_TYPE_META[g.type].label,
        options: g.options.map(o => ({
          id: o.id,
          name: o.name.trim(),
          kind: o.kind,
          description: o.description.trim() || undefined,
          imagePath: o.kind === "photo" ? o.imagePath : undefined,
        })),
      })),
      // Flag shot (Call to Bar or Trending). Send null to clear when disabled or missing a plate.
      flagShot: (form.category === "call_to_bar" || form.category === "trending") && flagShotEnabled && flagShotImagePath
        ? { enabled: true, imagePath: flagShotImagePath }
        : null,
      // Trend slots (Trending category only). Null clears when disabled/missing plates.
      trendSlots: form.category === "trending" && ((trendMugshot.enabled && trendMugshot.imagePath) || (trendBowl.enabled && trendBowl.imagePath) || (trendViral.enabled && trendViral.imagePath))
        ? {
            mugshot: trendMugshot.enabled && trendMugshot.imagePath ? { enabled: true, imagePath: trendMugshot.imagePath } : null,
            bowl: trendBowl.enabled && trendBowl.imagePath ? { enabled: true, imagePath: trendBowl.imagePath } : null,
            viral: trendViral.enabled && trendViral.imagePath ? { enabled: true, imagePath: trendViral.imagePath } : null,
          }
        : null,
      // Signature poses — planner draws randomly from this pool, works on any category.
      poseOptions: poseOptions.length > 0
        ? poseOptions.map(p => ({ id: p.id, name: p.name.trim(), description: p.description.trim() || undefined, imagePath: p.imagePath }))
        : null,
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

    // Save NEW workflow images (inspiration + tagged)
    const existingWorkflowCount = images.filter(i => i.fromDb).length;
    const uploadedImages = images.filter(i => i.storagePath && !i.fromDb);
    for (let i = 0; i < uploadedImages.length; i++) {
      const img = uploadedImages[i];
      const imgRes = await fetch(`/api/templates/${templateId}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storagePath: img.storagePath,
          displayOrder: existingWorkflowCount + i,
          purpose: img.purpose,
          tag: img.purpose === "tagged" ? img.tag : undefined,
          customName: img.purpose === "tagged" ? (img.customName?.trim() || undefined) : undefined,
          note: img.note?.trim() || undefined,
          noteHidden: img.purpose === "tagged" ? img.noteHidden : undefined,
        }),
      });
      if (!imgRes.ok) {
        const errData = await imgRes.json().catch(() => ({}));
        setFormError(errData.error ?? "Failed to save image — please try again");
        setSaving(false);
        return;
      }
    }
    // PATCH fromDb images with any updated tag/note
    const fromDbImages = images.filter(i => i.fromDb);
    for (const img of fromDbImages) {
      const patchRes = await fetch(`/api/templates/${templateId}/images`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId: img.localId, tag: img.tag, customName: img.customName?.trim() || null, note: img.note?.trim() || null, noteHidden: img.noteHidden }),
      });
      if (!patchRes.ok) {
        const errData = await patchRes.json().catch(() => ({}));
        setFormError(errData.error ?? "Failed to update image metadata — please try again");
        setSaving(false);
        return;
      }
    }

    // Save template_images rows for NEW photo background options (fromDb ones already have rows)
    if (bgOptionsActive) {
      const newBgPhotoOptions = backgroundOptions.filter(o => o.kind === "photo" && o.imagePath && !o.fromDb);
      for (const o of newBgPhotoOptions) {
        const bgRes = await fetch(`/api/templates/${templateId}/images`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storagePath: o.imagePath,
            displayOrder: 0,
            purpose: "tagged",
            tag: "BACKGROUND",
            customName: o.name.trim(),
          }),
        });
        if (!bgRes.ok) {
          const errData = await bgRes.json().catch(() => ({}));
          setFormError(errData.error ?? "Failed to save background option image — please try again");
          setSaving(false);
          return;
        }
      }
    }

    // Save template_images rows for NEW choice-group photo options
    for (const g of choiceGroups) {
      for (const o of g.options.filter(o => o.kind === "photo" && o.imagePath && !o.fromDb)) {
        const optRes = await fetch(`/api/templates/${templateId}/images`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storagePath: o.imagePath,
            displayOrder: 0,
            purpose: "tagged",
            tag: GROUP_TYPE_META[g.type].tag,
            customName: o.name.trim(),
            note: o.description.trim() || undefined,
          }),
        });
        if (!optRes.ok) {
          const errData = await optRes.json().catch(() => ({}));
          setFormError(errData.error ?? `Failed to save "${o.name}" image — please try again`);
          setSaving(false);
          return;
        }
      }
    }

    // Save the flag-shot plate as a FLAG_SCENE tagged image (only when it's a new upload)
    if ((form.category === "call_to_bar" || form.category === "trending") && flagShotEnabled && flagShotImagePath && flagShotIsNew) {
      const flagRes = await fetch(`/api/templates/${templateId}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storagePath: flagShotImagePath,
          displayOrder: 0,
          purpose: "tagged",
          tag: "FLAG_SCENE",
          customName: "Flag scene",
        }),
      });
      if (!flagRes.ok) {
        const errData = await flagRes.json().catch(() => ({}));
        setFormError(errData.error ?? "Failed to save flag scene image — please try again");
        setSaving(false);
        return;
      }
      setFlagShotIsNew(false);
    }

    // Save trend-slot plates as tagged images (only when newly uploaded)
    if (form.category === "trending") {
      const plates: Array<{ draft: TrendSlotDraft; set: typeof setTrendMugshot; tag: string; label: string }> = [
        { draft: trendMugshot, set: setTrendMugshot, tag: "MUGSHOT_BOARD", label: "Mugshot board" },
        { draft: trendBowl, set: setTrendBowl, tag: "BOWL_PROP", label: "Business bowl" },
        { draft: trendViral, set: setTrendViral, tag: "VIRAL_LOOK", label: "Viral chair pose" },
      ];
      for (const p of plates) {
        if (!(p.draft.enabled && p.draft.imagePath && p.draft.isNew)) continue;
        const res = await fetch(`/api/templates/${templateId}/images`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storagePath: p.draft.imagePath,
            displayOrder: 0,
            purpose: "tagged",
            tag: p.tag,
            customName: p.label,
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          setFormError(errData.error ?? `Failed to save ${p.label} image — please try again`);
          setSaving(false);
          return;
        }
        p.set(s => ({ ...s, isNew: false }));
      }
    }

    // Save new sample images (existing fromDb ones are already in DB; deletions are done in real-time)
    const existingSampleCount = sampleImages.filter(s => s.fromDb).length;
    const newSamples = sampleImages.filter(s => s.storagePath && !s.fromDb);
    for (let i = 0; i < newSamples.length; i++) {
      const sampleRes = await fetch(`/api/templates/${templateId}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath: newSamples[i].storagePath, displayOrder: existingSampleCount + i, purpose: "sample" }),
      });
      if (!sampleRes.ok) {
        const errData = await sampleRes.json().catch(() => ({}));
        setFormError(errData.error ?? "Failed to save gallery image — please try again");
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setPanel("none");
    setForm(defaultForm());
    setImages([]);
    setSampleImages([]);
    setCoverPreview("");
    setStoryScenes([defaultScene(1)]);
    setBackgroundOptions([]); setChoiceGroups([]); setFlagShotEnabled(false); setFlagShotImagePath(""); setFlagShotPreview(""); setFlagShotIsNew(false); setTrendMugshot(emptyTrendSlot()); setTrendBowl(emptyTrendSlot()); setTrendViral(emptyTrendSlot()); setPoseOptions([]);
    loadDashboard();
  };

  const handleUsernameChange = (val: string) => {
    const clean = val.toLowerCase().replace(/[^a-z0-9_-]/g, "");
    setUsernameInput(clean);
    setUsernameStatus("idle");
    setUsernameMsg("");
    if (usernameCheckRef.current) clearTimeout(usernameCheckRef.current);
    if (!clean || clean === creator?.username) return;
    if (clean.length < 3) { setUsernameStatus("invalid"); setUsernameMsg("At least 3 characters"); return; }
    setUsernameStatus("checking");
    usernameCheckRef.current = setTimeout(async () => {
      const r = await fetch(`/api/creators/check-username?q=${encodeURIComponent(clean)}`);
      const d = await r.json();
      if (d.available) { setUsernameStatus("available"); setUsernameMsg("Available"); }
      else { setUsernameStatus("taken"); setUsernameMsg(d.reason ?? "Already taken"); }
    }, 500);
  };

  const saveUsername = async () => {
    if (usernameStatus !== "available") return;
    setUsernameStatus("saving");
    const r = await fetch("/api/creator-dashboard/username", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: usernameInput }),
    });
    const d = await r.json();
    if (r.ok) {
      setCreator(c => c ? { ...c, username: d.username } : c);
      setUsernameStatus("saved");
      setUsernameMsg(`aluxartandframes.shop/creators/${d.username}`);
    } else {
      setUsernameStatus("taken");
      setUsernameMsg(d.error ?? "Could not save");
    }
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
    const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? `Delete failed (${res.status})`);
      return;
    }
    loadDashboard();
  };

  if (loading) return <div className={styles.loading}>Loading dashboard...</div>;
  if (loadError) return (
    <div className={styles.loading} style={{ flexDirection: "column", gap: 12 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>Failed to load dashboard</p>
      <p style={{ margin: 0, fontSize: "0.85rem", opacity: 0.7 }}>Check your connection and try again.</p>
      <button onClick={() => { setLoadError(false); setLoading(true); loadDashboard(); }} style={{ marginTop: 8, padding: "8px 20px", borderRadius: 8, border: "none", background: "#2f8e9a", color: "#fff", cursor: "pointer", fontWeight: 600 }}>Retry</button>
    </div>
  );

  if (creator?.status === "pending") {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <Link href="/marketplace" className={styles.back}>← Marketplace</Link>
          <h1 className={styles.title}>Creator Dashboard</h1>
        </header>
        <div className={styles.main}>
          <div style={{ maxWidth: 520, margin: "60px auto", textAlign: "center", padding: "0 24px" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(213, 163, 60, 0.12)", border: "2px solid rgba(213, 163, 60, 0.4)", color: "#8a6000", fontSize: "1.4rem", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontWeight: 700 }}>⏳</div>
            <h2 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#263235", margin: "0 0 12px" }}>Application under review</h2>
            <p style={{ fontSize: "0.875rem", color: "#4e7076", lineHeight: 1.6, margin: "0 0 24px" }}>
              Your creator application has been received. We review every application carefully and aim to respond within 48 hours. You&apos;ll receive an email once a decision has been made.
            </p>
            <Link href="/marketplace" style={{ display: "inline-block", background: "rgba(67, 159, 169, 0.08)", border: "1px solid rgba(67, 159, 169, 0.24)", borderRadius: 8, color: "#2f8e9a", fontSize: "0.875rem", fontWeight: 600, padding: "10px 20px", textDecoration: "none" }}>
              Browse the marketplace →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (creator?.status === "declined") {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <Link href="/marketplace" className={styles.back}>← Marketplace</Link>
          <h1 className={styles.title}>Creator Dashboard</h1>
        </header>
        <div className={styles.main}>
          <div style={{ maxWidth: 520, margin: "60px auto", textAlign: "center", padding: "0 24px" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(167, 70, 60, 0.08)", border: "2px solid rgba(167, 70, 60, 0.3)", color: "#a7463c", fontSize: "1.2rem", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontWeight: 700 }}>✕</div>
            <h2 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#263235", margin: "0 0 12px" }}>Application not approved</h2>
            <p style={{ fontSize: "0.875rem", color: "#4e7076", lineHeight: 1.6, margin: "0 0 24px" }}>
              Unfortunately your creator application was not approved at this time. If you believe this is a mistake or would like to discuss further, please reach out to us at{" "}
              <a href="mailto:aluxartandframes@gmail.com" style={{ color: "#2f8e9a" }}>aluxartandframes@gmail.com</a>.
            </p>
            <Link href="/marketplace" style={{ display: "inline-block", background: "rgba(67, 159, 169, 0.08)", border: "1px solid rgba(67, 159, 169, 0.24)", borderRadius: 8, color: "#2f8e9a", fontSize: "0.875rem", fontWeight: 600, padding: "10px 20px", textDecoration: "none" }}>
              Browse the marketplace →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/studio" className={styles.back}>← Studio</Link>
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

      {/* Username / profile URL */}
      <div className={styles.storefrontSection}>
        <button type="button" className={styles.storefrontToggle} onClick={() => {}}>
          <span>Your Profile URL</span>
        </button>
        <div className={styles.storefrontContent}>
          <div className={styles.storefrontGroup}>
            <span className={styles.label}>Custom username</span>
            <p style={{ fontSize: "0.8rem", color: "#7aafb4", margin: "0 0 10px" }}>
              {creator?.username
                ? <>Your link: <strong>aluxartandframes.shop/creators/{creator.username}</strong></>
                : "Set a username so people can find you at a clean URL."}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ position: "relative", flex: 1 }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#7aafb4", fontSize: "0.85rem", pointerEvents: "none" }}>@</span>
                <input
                  value={usernameInput}
                  onChange={e => handleUsernameChange(e.target.value)}
                  placeholder="yourname"
                  maxLength={30}
                  style={{
                    width: "100%",
                    paddingLeft: 28,
                    paddingRight: 12,
                    paddingTop: 10,
                    paddingBottom: 10,
                    borderRadius: 8,
                    border: `1px solid ${usernameStatus === "available" ? "#2f8e9a" : usernameStatus === "taken" || usernameStatus === "invalid" ? "#a7463c" : "rgba(67,159,169,0.28)"}`,
                    background: "rgba(255,255,255,0.78)",
                    fontSize: "0.9rem",
                    fontFamily: "inherit",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <button
                type="button"
                onClick={saveUsername}
                disabled={usernameStatus !== "available"}
                style={{
                  padding: "10px 18px",
                  borderRadius: 8,
                  border: "1px solid rgba(67,159,169,0.3)",
                  background: usernameStatus === "available" ? "#2f8e9a" : "rgba(255,255,255,0.6)",
                  color: usernameStatus === "available" ? "#fff" : "#7aafb4",
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  cursor: usernameStatus === "available" ? "pointer" : "not-allowed",
                  whiteSpace: "nowrap",
                  fontFamily: "inherit",
                }}
              >
                {usernameStatus === "saving" ? "Saving..." : usernameStatus === "saved" ? "Saved!" : "Save"}
              </button>
            </div>
            {usernameMsg && (
              <p style={{
                fontSize: "0.78rem",
                marginTop: 6,
                color: usernameStatus === "available" || usernameStatus === "saved" ? "#177767" : usernameStatus === "checking" ? "#7aafb4" : "#a7463c",
              }}>
                {usernameStatus === "checking" ? "Checking..." : usernameMsg}
              </p>
            )}
          </div>
        </div>
      </div>

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
                  href={`/creators/${creator.username ?? creator.id}`}
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
          <button type="button" className={styles.newBtn} onClick={() => { setPanel("create"); setForm(defaultForm()); setImages([]); setSampleImages([]); setCoverPreview(""); setStoryScenes([defaultScene(1)]); setBackgroundOptions([]); setChoiceGroups([]); setFlagShotEnabled(false); setFlagShotImagePath(""); setFlagShotPreview(""); setFlagShotIsNew(false); setTrendMugshot(emptyTrendSlot()); setTrendBowl(emptyTrendSlot()); setTrendViral(emptyTrendSlot()); setPoseOptions([]); }}>
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
                {/* Primary row — Edit + Generate Images */}
                <div className={styles.actPrimary}>
                  <button type="button" className={styles.actionBtn} onClick={() => openEdit(t)}>
                    Edit
                  </button>
                  <button type="button" className={`${styles.actionBtn} ${styles.actionBtnShowcase}`} onClick={() => openShowcase(t.id)}>
                    Generate images
                  </button>
                </div>
                {/* Secondary row — icon-only on mobile */}
                <div className={styles.actSecondary}>
                  <button type="button" className={styles.actionBtn} onClick={() => toggleStatus(t)}
                    title={t.status === "published" ? "Unpublish" : "Publish"}>
                    <span className={styles.btnText}>{t.status === "published" ? "Unpublish" : "Publish"}</span>
                    <svg className={styles.btnIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      {t.status === "published"
                        ? <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22" />
                        : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>}
                    </svg>
                  </button>
                  <button type="button" className={styles.actionBtn} onClick={() => deleteTemplate(t.id)} title="Delete">
                    <span className={styles.btnText}>Delete</span>
                    <svg className={styles.btnIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                    </svg>
                  </button>
                  <button type="button" className={styles.actionBtn} onClick={() => copyLink(t.id)} title="Copy link">
                    <span className={styles.btnText}>{copiedId === t.id ? "Copied!" : "Copy link"}</span>
                    <svg className={styles.btnIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                    </svg>
                  </button>
                  <button type="button" className={styles.actionBtn} onClick={() => setQrTemplateId(t.id)} title="QR Code">
                    <span className={styles.btnText}>QR Code</span>
                    <svg className={styles.btnIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
                      <rect x="14" y="14" width="3" height="3" rx="0.5" fill="currentColor" stroke="none" />
                      <rect x="18" y="14" width="3" height="3" rx="0.5" fill="currentColor" stroke="none" />
                      <rect x="14" y="18" width="3" height="3" rx="0.5" fill="currentColor" stroke="none" />
                      <rect x="18" y="18" width="3" height="3" rx="0.5" fill="currentColor" stroke="none" />
                    </svg>
                  </button>
                </div>
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
                {/* "story" is a marketplace browse tab, not a savable category (the API rejects
                    it); story templates use the "This template is a Story" checkbox instead. */}
                {TEMPLATE_CATEGORIES.filter(c => !c.isStory).map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
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
                      <ImagePreview src={img.preview} alt="" className={styles.imgPreview} />
                      {img.uploading && <div className={styles.imgOverlay}>Uploading...</div>}
                      {img.error && <div className={styles.imgError}>{img.error}</div>}
                      {img.fromDb && <div className={styles.imgDbBadge}>saved</div>}
                      <button type="button" className={styles.imgRemove} onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}>✕</button>
                    </div>
                  ))}
                  {images.length < 8 && (
                    <button type="button" className={styles.addImgBtn} onClick={() => { pendingTagRef.current = "inspiration"; imgInputRef.current?.click(); }}>
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
                              <ImagePreview src={img.preview} alt="" className={styles.imgPreview} />
                              {img.uploading && <div className={styles.imgOverlay}>Uploading...</div>}
                              {img.error && <div className={styles.imgError}>{img.error}</div>}
                              {img.fromDb && <div className={styles.imgDbBadge}>saved</div>}
                              <button type="button" className={styles.imgRemove} onClick={async () => {
                                if (img.fromDb && panel !== "create") {
                                  await fetch(`/api/templates/${panel}/images`, {
                                    method: "DELETE",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ imageId: img.localId }),
                                  });
                                }
                                setImages(prev => prev.filter((_, j) => j !== i));
                              }}>✕</button>
                            </div>
                          );
                        })}
                        {images.length < 20 && (
                          <button type="button" className={styles.addImgBtn} onClick={() => { pendingTagRef.current = "inspiration"; imgInputRef.current?.click(); }}>
                            + Add inspiration
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}

              </>
            )}

            {/* Tagged references — always visible so creator can edit/delete regardless of shoot mode */}
            {(form.shootMode === "advanced" || images.some(img => img.purpose === "tagged")) && (
              <div className={styles.advancedRefSection}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span className={styles.advancedRefLabel}>Tagged references <span className={styles.advancedRefNote}>— upload images and tag each one (optional)</span></span>
                  {images.some(img => img.purpose === "tagged") && panel !== "create" && (
                    <button
                      type="button"
                      style={{ fontSize: "0.75rem", color: "#e44", background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap" }}
                      onClick={async () => {
                        if (!confirm("Delete ALL tagged references for this template? This cannot be undone.")) return;
                        await fetch(`/api/templates/${panel}/images`, {
                          method: "DELETE",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ clearAll: true }),
                        });
                        setImages(prev => prev.filter(img => img.purpose !== "tagged"));
                      }}
                    >
                      Clear all
                    </button>
                  )}
                </div>
                {images.filter(img => img.purpose === "tagged").map(img => (
                  <div key={img.localId} className={styles.taggedRefCard}>
                    <div className={styles.taggedRefTop}>
                      <button
                        type="button"
                        className={styles.taggedRefThumbBtn}
                        onClick={() => { setReplacingId(img.localId); replaceInputRef.current?.click(); }}
                        title="Click to replace image"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <ImagePreview src={img.preview} alt="" className={styles.taggedRefThumb} />
                        <span className={styles.taggedRefReplaceOverlay}>Replace</span>
                      </button>
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
                        />
                        <textarea
                          className={styles.noteInput}
                          value={img.note}
                          onChange={e => setImages(prev => prev.map(x => x.localId === img.localId ? { ...x, note: e.target.value } : x))}
                          placeholder="Styling note (optional)..."
                          rows={2}
                        />
                        {img.note.trim() && (
                          <button
                            type="button"
                            className={img.noteHidden ? styles.noteHiddenBtn : styles.noteVisibleBtn}
                            onClick={() => setImages(prev => prev.map(x => x.localId === img.localId ? { ...x, noteHidden: !x.noteHidden } : x))}
                          >
                            {img.noteHidden ? "Note hidden from buyer" : "Hide note from buyer"}
                          </button>
                        )}
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
                {images.filter(img => img.purpose === "tagged").length < 20 && (
                  <button
                    type="button"
                    className={`${styles.addImgBtn} ${styles.addImgBtnSm}`}
                    onClick={() => { pendingTagRef.current = "__tagged__"; imgInputRef.current?.click(); }}
                  >
                    + Add reference
                  </button>
                )}
              </div>
            )}

            <input type="file" accept="image/*" multiple ref={imgInputRef} className={styles.hidden} onChange={e => { if (e.target.files) addImages(e.target.files); e.target.value = ""; }} />
            <input type="file" accept="image/*" ref={replaceInputRef} className={styles.hidden} onChange={e => { const f = e.target.files?.[0]; if (f && replacingId) replaceImage(f, replacingId); e.target.value = ""; setReplacingId(null); }} />
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
                  <ImagePreview src={item.preview} alt="" className={styles.imgPreview} />
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
            {sampleImages.length >= 2 && (
              <button
                type="button"
                className={styles.collageCoverBtn}
                onClick={() => setShowCollageEditor(true)}
              >
                Create collage cover from gallery
              </button>
            )}
          </div>

          {/* Story builder */}
          <div className={styles.field}>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={form.isStory}
                onChange={e => setForm(f => ({ ...f, isStory: e.target.checked }))}
              />
              <span className={styles.label}>This template is a Story</span>
            </label>
            {form.isStory && (
              <div className={styles.storyBuilder}>
                <div className={styles.fieldRow}>
                  <span className={styles.label}>Story type</span>
                  <div className={styles.pills}>
                    {(["solo", "duo", "group", "brand"] as const).map(t => (
                      <button
                        key={t}
                        type="button"
                        className={`${styles.pill} ${form.storyType === t ? styles.pillActive : ""}`}
                        onClick={() => setForm(f => ({ ...f, storyType: t }))}
                      >
                        {t === "solo" ? "Solo" : t === "duo" ? "Duo (co-star)" : t === "group" ? "Group" : "Brand Ad"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.fieldRow}>
                  <label className={styles.label}>Default role</label>
                  <input
                    type="text"
                    className={styles.input}
                    placeholder='e.g. "the fan in the stands"'
                    maxLength={100}
                    value={form.defaultRole}
                    onChange={e => setForm(f => ({ ...f, defaultRole: e.target.value }))}
                  />
                  <p className={styles.fieldHint}>Pre-fills the &quot;I&apos;m the ___&quot; prompt for buyers. Leave blank to let them write freely.</p>
                </div>

                <div className={styles.fieldRow}>
                  <label className={styles.label}>Role chips (comma-separated, max 6)</label>
                  <input
                    type="text"
                    className={styles.input}
                    placeholder='e.g. "the referee, a photographer, a journalist"'
                    value={form.roleChipsInput}
                    onChange={e => setForm(f => ({ ...f, roleChipsInput: e.target.value }))}
                  />
                  <p className={styles.fieldHint}>Quick-pick options shown to buyers when selecting their role.</p>
                </div>

                <div className={styles.fieldRow}>
                  <div className={styles.storySceneHeader}>
                    <span className={styles.label}>Scenes ({storyScenes.length})</span>
                    {storyScenes.length < 10 && (
                      <button
                        type="button"
                        className={styles.addSceneBtn}
                        onClick={() => setStoryScenes(prev => [...prev, defaultScene(prev.length + 1)])}
                      >
                        + Add scene
                      </button>
                    )}
                  </div>
                  <p className={styles.fieldHint}>Each scene = one generated image. Scene 1 is always used for 1-image packages.</p>

                  {storyScenes.map((scene, idx) => (
                    <div key={idx} className={styles.sceneCard}>
                      <div className={styles.sceneCardHeader}>
                        <span className={styles.sceneNum}>Scene {idx + 1}</span>
                        <div className={styles.sceneActions}>
                          {idx > 0 && (
                            <button
                              type="button"
                              className={styles.sceneMove}
                              title="Move up"
                              onClick={() => setStoryScenes(prev => {
                                const next = [...prev];
                                [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                                return next.map((s, i) => ({ ...s, slot: i + 1 }));
                              })}
                            >↑</button>
                          )}
                          {idx < storyScenes.length - 1 && (
                            <button
                              type="button"
                              className={styles.sceneMove}
                              title="Move down"
                              onClick={() => setStoryScenes(prev => {
                                const next = [...prev];
                                [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                                return next.map((s, i) => ({ ...s, slot: i + 1 }));
                              })}
                            >↓</button>
                          )}
                          {storyScenes.length > 1 && (
                            <button
                              type="button"
                              className={styles.sceneRemove}
                              onClick={() => setStoryScenes(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, slot: i + 1 })))}
                            >✕</button>
                          )}
                        </div>
                      </div>
                      <div className={styles.sceneFields}>
                        <input
                          type="text"
                          className={styles.input}
                          placeholder="Scene title (e.g. Arrival at the Stadium)"
                          maxLength={80}
                          value={scene.title}
                          onChange={e => setStoryScenes(prev => prev.map((s, i) => i === idx ? { ...s, title: e.target.value } : s))}
                        />
                        <textarea
                          className={styles.textarea}
                          placeholder="Scene description — what happens here?"
                          rows={2}
                          value={scene.description}
                          onChange={e => setStoryScenes(prev => prev.map((s, i) => i === idx ? { ...s, description: e.target.value } : s))}
                        />
                        <input
                          type="text"
                          className={styles.input}
                          placeholder="Environment (e.g. packed stadium gates, golden hour)"
                          value={scene.environment}
                          onChange={e => setStoryScenes(prev => prev.map((s, i) => i === idx ? { ...s, environment: e.target.value } : s))}
                        />
                        <input
                          type="text"
                          className={styles.input}
                          placeholder="Wardrobe (e.g. team jersey, casual jeans)"
                          value={scene.wardrobe}
                          onChange={e => setStoryScenes(prev => prev.map((s, i) => i === idx ? { ...s, wardrobe: e.target.value } : s))}
                        />
                        {form.storyType === "duo" && (
                          <input
                            type="text"
                            className={styles.input}
                            placeholder="Co-character description (e.g. rival player in opposing team jersey)"
                            value={scene.coCharacter}
                            onChange={e => setStoryScenes(prev => prev.map((s, i) => i === idx ? { ...s, coCharacter: e.target.value } : s))}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Buyer background options (all categories) */}
          {true && (
            <div className={styles.field}>
              <div className={styles.storySceneHeader}>
                <span className={styles.label}>Buyer background options ({backgroundOptions.length}/{MAX_BG_OPTIONS})</span>
                <div style={{ display: "flex", gap: 8 }}>
                  {backgroundOptions.length < MAX_BG_OPTIONS && libraryAssets.length > 0 && (
                    <button
                      type="button"
                      className={styles.addSceneBtn}
                      onClick={() => { setLibraryFilter("background"); setLibraryPicker({ target: "background" }); }}
                    >
                      📚 Add from library
                    </button>
                  )}
                  {backgroundOptions.length < MAX_BG_OPTIONS && (
                    <button
                      type="button"
                      className={styles.addSceneBtn}
                      onClick={() => setBackgroundOptions(prev => [...prev, {
                        id: crypto.randomUUID(), name: "", kind: "photo", description: "",
                        imagePath: "", preview: "", uploading: false,
                      }])}
                    >
                      + Add option
                    </button>
                  )}
                </div>
              </div>
              <p className={styles.fieldHint}>
                Add at least 2 options to let buyers split their package across backgrounds
                (e.g. 5 images on Studio Canvas, 5 in a Law Library). A photo option is replicated
                exactly; a text option is built by the AI from your description.
              </p>

              {backgroundOptions.map((opt, idx) => (
                <div key={opt.id} className={styles.sceneCard}>
                  <div className={styles.sceneCardHeader}>
                    <span className={styles.sceneNum}>Background {idx + 1}</span>
                    <div className={styles.sceneActions}>
                      <button
                        type="button"
                        className={styles.sceneRemove}
                        onClick={() => setBackgroundOptions(prev => prev.filter(o => o.id !== opt.id))}
                      >✕</button>
                    </div>
                  </div>
                  <div className={styles.sceneFields}>
                    <input
                      type="text"
                      className={styles.input}
                      placeholder='Option name shown to buyers (e.g. "Studio Canvas", "Law Library")'
                      maxLength={40}
                      value={opt.name}
                      onChange={e => setBackgroundOptions(prev => prev.map(o => o.id === opt.id ? { ...o, name: e.target.value } : o))}
                    />
                    <div className={styles.pills}>
                      <button
                        type="button"
                        className={`${styles.pill} ${opt.kind === "photo" ? styles.pillActive : ""}`}
                        onClick={() => setBackgroundOptions(prev => prev.map(o => o.id === opt.id ? { ...o, kind: "photo" } : o))}
                      >
                        Photo reference
                      </button>
                      <button
                        type="button"
                        className={`${styles.pill} ${opt.kind === "text" ? styles.pillActive : ""}`}
                        onClick={() => setBackgroundOptions(prev => prev.map(o => o.id === opt.id ? { ...o, kind: "text" } : o))}
                      >
                        Text description
                      </button>
                    </div>
                    {opt.kind === "photo" ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {opt.preview && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={opt.preview} alt={opt.name || "background"} style={{ width: 56, height: 70, objectFit: "cover", borderRadius: 6 }} />
                        )}
                        <label className={styles.addSceneBtn} style={{ cursor: "pointer" }}>
                          {opt.uploading ? "Uploading..." : opt.imagePath ? "Replace photo" : "Upload photo"}
                          <input
                            type="file"
                            accept="image/*"
                            style={{ display: "none" }}
                            onChange={e => { const f = e.target.files?.[0]; if (f) uploadBackgroundOptionFile(f, opt.id); e.target.value = ""; }}
                          />
                        </label>
                        {opt.error && <span style={{ color: "#e5484d", fontSize: "0.78rem" }}>{opt.error}</span>}
                      </div>
                    ) : (
                      <textarea
                        className={styles.textarea}
                        placeholder='Describe the environment (e.g. "a stately law library with mahogany shelves, leather-bound volumes, warm brass lamps")'
                        rows={2}
                        maxLength={300}
                        value={opt.description}
                        onChange={e => setBackgroundOptions(prev => prev.map(o => o.id === opt.id ? { ...o, description: e.target.value } : o))}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Buyer choice groups — pick-one styling options (all categories) */}
          <div className={styles.field}>
            <div className={styles.storySceneHeader}>
              <span className={styles.label}>Buyer choice groups ({choiceGroups.length}/{MAX_CHOICE_GROUPS})</span>
              {choiceGroups.length < MAX_CHOICE_GROUPS && (
                <button
                  type="button"
                  className={styles.addSceneBtn}
                  onClick={() => setChoiceGroups(prev => [...prev, {
                    id: crypto.randomUUID(), type: "outfit", label: "Outfit", options: [],
                  }])}
                >
                  + Add group
                </button>
              )}
            </div>
            <p className={styles.fieldHint}>
              Offer multiple outfits, hairstyles, makeup looks, etc. on one template. The buyer picks
              ONE option per group and it is used consistently across their whole shoot. Groups with a
              single option apply automatically without showing a picker.
            </p>

            {choiceGroups.map((group, gIdx) => (
              <div key={group.id} className={styles.sceneCard}>
                <div className={styles.sceneCardHeader}>
                  <span className={styles.sceneNum}>Group {gIdx + 1} — {group.label}</span>
                  <div className={styles.sceneActions}>
                    <button
                      type="button"
                      className={styles.sceneRemove}
                      onClick={() => setChoiceGroups(prev => prev.filter(g => g.id !== group.id))}
                    >✕</button>
                  </div>
                </div>
                <div className={styles.sceneFields}>
                  <div className={styles.pills}>
                    {(Object.keys(GROUP_TYPE_META) as ChoiceGroupType[]).map(t => (
                      <button
                        key={t}
                        type="button"
                        className={`${styles.pill} ${group.type === t ? styles.pillActive : ""}`}
                        onClick={() => setChoiceGroups(prev => prev.map(g => g.id === group.id
                          ? { ...g, type: t, label: (!g.label || g.label === GROUP_TYPE_META[g.type].label) ? GROUP_TYPE_META[t].label : g.label }
                          : g))}
                      >
                        {GROUP_TYPE_META[t].label}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    className={styles.input}
                    placeholder="Group label shown to buyers (e.g. Outfit, Shoes, Film Look)"
                    maxLength={40}
                    value={group.label}
                    onChange={e => setChoiceGroups(prev => prev.map(g => g.id === group.id ? { ...g, label: e.target.value } : g))}
                  />

                  {group.options.map(opt => (
                    <div key={opt.id} style={{ border: "1px solid rgba(127,127,127,0.25)", borderRadius: 8, padding: "8px 10px", display: "grid", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input
                          type="text"
                          className={styles.input}
                          placeholder='Option name (e.g. "Emerald Gown")'
                          maxLength={40}
                          value={opt.name}
                          onChange={e => setChoiceGroups(prev => prev.map(g => g.id === group.id
                            ? { ...g, options: g.options.map(o => o.id === opt.id ? { ...o, name: e.target.value } : o) }
                            : g))}
                        />
                        <button
                          type="button"
                          className={styles.sceneRemove}
                          onClick={() => setChoiceGroups(prev => prev.map(g => g.id === group.id
                            ? { ...g, options: g.options.filter(o => o.id !== opt.id) }
                            : g))}
                        >✕</button>
                      </div>
                      <div className={styles.pills}>
                        <button
                          type="button"
                          className={`${styles.pill} ${opt.kind === "photo" ? styles.pillActive : ""}`}
                          onClick={() => setChoiceGroups(prev => prev.map(g => g.id === group.id
                            ? { ...g, options: g.options.map(o => o.id === opt.id ? { ...o, kind: "photo" } : o) }
                            : g))}
                        >
                          Photo reference
                        </button>
                        <button
                          type="button"
                          className={`${styles.pill} ${opt.kind === "text" ? styles.pillActive : ""}`}
                          onClick={() => setChoiceGroups(prev => prev.map(g => g.id === group.id
                            ? { ...g, options: g.options.map(o => o.id === opt.id ? { ...o, kind: "text" } : o) }
                            : g))}
                        >
                          Text description
                        </button>
                      </div>
                      {opt.kind === "photo" ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {opt.preview && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={opt.preview} alt={opt.name || "option"} style={{ width: 56, height: 70, objectFit: "cover", borderRadius: 6 }} />
                          )}
                          <label className={styles.addSceneBtn} style={{ cursor: "pointer" }}>
                            {opt.uploading ? "Uploading..." : opt.imagePath ? "Replace photo" : "Upload photo"}
                            <input
                              type="file"
                              accept="image/*"
                              style={{ display: "none" }}
                              onChange={e => { const f = e.target.files?.[0]; if (f) uploadChoiceOptionFile(f, group.id, opt.id); e.target.value = ""; }}
                            />
                          </label>
                          {opt.error && <span style={{ color: "#e5484d", fontSize: "0.78rem" }}>{opt.error}</span>}
                        </div>
                      ) : (
                        <textarea
                          className={styles.textarea}
                          placeholder='Describe this option (e.g. "sleek low bun with a deep side part")'
                          rows={2}
                          maxLength={300}
                          value={opt.description}
                          onChange={e => setChoiceGroups(prev => prev.map(g => g.id === group.id
                            ? { ...g, options: g.options.map(o => o.id === opt.id ? { ...o, description: e.target.value } : o) }
                            : g))}
                        />
                      )}
                    </div>
                  ))}

                  {group.options.length < MAX_GROUP_OPTIONS && (
                    <div style={{ display: "flex", gap: 8 }}>
                      {libraryAssets.length > 0 && (
                        <button
                          type="button"
                          className={styles.addSceneBtn}
                          onClick={() => { setLibraryFilter(group.type in GROUP_TYPE_META ? group.type : "all"); setLibraryPicker({ target: "group", groupId: group.id }); }}
                        >
                          📚 Add from library
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.addSceneBtn}
                        onClick={() => setChoiceGroups(prev => prev.map(g => g.id === group.id
                          ? { ...g, options: [...g.options, { id: crypto.randomUUID(), name: "", kind: "photo", description: "", imagePath: "", preview: "", uploading: false }] }
                          : g))}
                      >
                        + Add option
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Viral skyscraper flag shot — Call to Bar or Trending */}
          {(form.category === "call_to_bar" || form.category === "trending") && (
            <div className={styles.field}>
              <div className={styles.storySceneHeader}>
                <span className={styles.label}>Viral skyscraper flag shot</span>
                <button
                  type="button"
                  className={`${styles.pill} ${flagShotEnabled ? styles.pillActive : ""}`}
                  onClick={() => setFlagShotEnabled(v => !v)}
                >
                  {flagShotEnabled ? "Enabled" : "Enable"}
                </button>
              </div>
              <p className={styles.fieldHint}>
                Offers buyers the viral rooftop-antenna flag shot. It replaces the LAST image in
                their package (a 10-image shoot becomes 9 portraits + 1 flag shot). The buyer types
                their own short flag text at checkout. Upload one clean empty-flag plate here — a
                photo of the mast, black flag, and skyline with NO people.{" "}
                {form.category === "call_to_bar"
                  ? "The model composites the buyer in full wig and gown onto it and renders their text on the flag."
                  : "The model composites the buyer in their shoot's regular outfit (no wig/gown) onto it and renders their text on the flag."}
              </p>

              {flagShotEnabled && (
                <div className={styles.sceneCard}>
                  <div className={styles.sceneFields}>
                    <span className={styles.fieldHint}>Empty-flag plate (mast + black flag + skyline, no people)</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      {flagShotPreview && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={flagShotPreview} alt="flag scene" style={{ width: 80, height: 100, objectFit: "cover", borderRadius: 6 }} />
                      )}
                      <label className={styles.addSceneBtn} style={{ cursor: "pointer" }}>
                        {flagShotUploading ? "Uploading..." : flagShotImagePath ? "Replace plate" : "Upload plate"}
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={e => { const f = e.target.files?.[0]; if (f) uploadFlagShotFile(f); e.target.value = ""; }}
                        />
                      </label>
                      {libraryAssets.length > 0 && (
                        <button type="button" className={styles.addSceneBtn} onClick={() => { setLibraryFilter("flag_plate"); setLibraryTab("mine"); setLibraryPicker({ target: "flag" }); }}>
                          📚 Add from library
                        </button>
                      )}
                      <button type="button" className={styles.addSceneBtn} onClick={() => { setLibraryTab("community"); fetchCommunitySetups(); setLibraryPicker({ target: "flag" }); }}>
                        🌐 Community
                      </button>
                      {flagShotImagePath && (
                        <button type="button" className={styles.addSceneBtn} onClick={() => publishSlotToCommunity("flag", flagShotImagePath, "Flag scene")}>
                          Share to community
                        </button>
                      )}
                    </div>
                    {!flagShotImagePath && (
                      <span style={{ color: "#e5849d", fontSize: "0.78rem" }}>
                        The flag shot stays off until you upload a plate.
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Asset library picker overlay */}
          {libraryPicker && (
            <div
              style={{
                position: "fixed", inset: 0, zIndex: 300, background: "rgba(10,16,20,0.55)",
                display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
              }}
              onClick={() => setLibraryPicker(null)}
            >
              <div
                style={{
                  background: "var(--panel-bg, #101820)", color: "inherit", borderRadius: 14,
                  maxWidth: 720, width: "100%", maxHeight: "80vh", overflowY: "auto",
                  padding: 18, border: "1px solid rgba(127,127,127,0.3)",
                }}
                onClick={e => e.stopPropagation()}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <span className={styles.label}>Asset library</span>
                  <button type="button" className={styles.sceneRemove} onClick={() => setLibraryPicker(null)}>✕</button>
                </div>
                <div className={styles.pills} style={{ marginBottom: 12 }}>
                  <button type="button" className={`${styles.pill} ${libraryTab === "mine" ? styles.pillActive : ""}`} onClick={() => setLibraryTab("mine")}>My library</button>
                  <button type="button" className={`${styles.pill} ${libraryTab === "community" ? styles.pillActive : ""}`} onClick={() => { setLibraryTab("community"); if (communitySetups.length === 0) fetchCommunitySetups(); }}>🌐 Community</button>
                </div>

                {libraryTab === "mine" ? (
                  <>
                    <div className={styles.pills} style={{ marginBottom: 12, flexWrap: "wrap" }}>
                      {["all", ...Array.from(new Set(libraryAssets.map(a => a.type)))].map(t => (
                        <button
                          key={t}
                          type="button"
                          className={`${styles.pill} ${libraryFilter === t ? styles.pillActive : ""}`}
                          onClick={() => setLibraryFilter(t)}
                        >
                          {t === "all" ? "All" : t === "background" ? "Background" : t === "pose" ? "Poses" : t.endsWith("_plate") ? t.replace("_plate", "").replace(/^\w/, c => c.toUpperCase()) : (GROUP_TYPE_META[t as ChoiceGroupType]?.label ?? t)}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10 }}>
                      {libraryAssets
                        .filter(a => libraryFilter === "all" || a.type === libraryFilter)
                        .map(a => (
                          <button
                            key={a.imagePath}
                            type="button"
                            title={`${a.name} — from "${a.sourceTitle}"`}
                            onClick={() => { addLibraryAsset(a); setLibraryPicker(null); }}
                            style={{
                              display: "flex", flexDirection: "column", gap: 4, background: "none",
                              border: "1px solid rgba(127,127,127,0.3)", borderRadius: 8, padding: 6, cursor: "pointer",
                            }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={a.preview} alt={a.name} style={{ width: "100%", height: 110, objectFit: "cover", borderRadius: 6 }} />
                            <span style={{ fontSize: "0.72rem", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                            <span style={{ fontSize: "0.6rem", opacity: 0.55, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.sourceTitle}</span>
                          </button>
                        ))}
                      {libraryAssets.filter(a => libraryFilter === "all" || a.type === libraryFilter).length === 0 && (
                        <p className={styles.fieldHint}>No saved assets of this type yet.</p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <p className={styles.fieldHint} style={{ marginBottom: 10 }}>
                      Setups other creators have shared. Importing copies the file into your own library — deleting
                      the original elsewhere never breaks your template.
                    </p>
                    {communityLoading ? (
                      <p className={styles.fieldHint}>Loading…</p>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10 }}>
                        {communitySetups
                          .filter(s => !SLOT_KIND_BY_TARGET[libraryPicker.target] || s.kind === SLOT_KIND_BY_TARGET[libraryPicker.target])
                          .map(s => (
                            <button
                              key={s.id}
                              type="button"
                              title={`${s.name} — by ${s.creatorName}`}
                              disabled={communityImporting === s.id}
                              onClick={() => importCommunitySetup(s)}
                              style={{
                                display: "flex", flexDirection: "column", gap: 4, background: "none",
                                border: "1px solid rgba(127,127,127,0.3)", borderRadius: 8, padding: 6,
                                cursor: communityImporting === s.id ? "wait" : "pointer",
                              }}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={s.imageUrl} alt={s.name} style={{ width: "100%", height: 110, objectFit: "cover", borderRadius: 6 }} />
                              <span style={{ fontSize: "0.72rem", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{communityImporting === s.id ? "Importing…" : s.name}</span>
                              <span style={{ fontSize: "0.6rem", opacity: 0.55, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>by {s.creatorName}</span>
                            </button>
                          ))}
                        {communitySetups.filter(s => !SLOT_KIND_BY_TARGET[libraryPicker.target] || s.kind === SLOT_KIND_BY_TARGET[libraryPicker.target]).length === 0 && (
                          <p className={styles.fieldHint}>Nothing shared for this slot type yet.</p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Trend slots — Trending category only */}
          {form.category === "trending" && (
            <div className={styles.field}>
              <span className={styles.label}>Trend slots</span>
              <p className={styles.fieldHint}>
                Optional viral shots buyers can add at checkout. Each enabled slot replaces the LAST
                image(s) of their package. Upload one clean plate per slot (no people in it).
              </p>

              {([
                { key: "mugshot" as const, draft: trendMugshot, set: setTrendMugshot, libTarget: "trend-mugshot" as const, title: "Mugshot shot", hint: "Buyer holds the forensics board in front of the height chart; their NAME / OFFENSE / DATE are written on the board in red handwriting. Upload the clean board + height-chart plate." },
                { key: "bowl" as const, draft: trendBowl, set: setTrendBowl, libTarget: "trend-bowl" as const, title: "Business-on-my-head shot", hint: "Buyer uploads their product (piled comically high in the bowl) or logo (branded on the bowl) and carries it on their head. Upload the clean empty bowl plate." },
                { key: "viral" as const, draft: trendViral, set: setTrendViral, libTarget: "trend-viral" as const, title: "Viral chair pose (always included)", hint: "EVERY buyer automatically gets one image recreating the viral seated chair pose exactly — tan suit, coat draped over shoulders, crossed legs. Upload the original viral photo as the reference." },
              ]).map(slot => (
                <div key={slot.key} className={styles.sceneCard}>
                  <div className={styles.sceneCardHeader}>
                    <span className={styles.sceneNum}>{slot.title}</span>
                    <button
                      type="button"
                      className={`${styles.pill} ${slot.draft.enabled ? styles.pillActive : ""}`}
                      onClick={() => slot.set(s => ({ ...s, enabled: !s.enabled }))}
                    >
                      {slot.draft.enabled ? "Enabled" : "Enable"}
                    </button>
                  </div>
                  {slot.draft.enabled && (
                    <div className={styles.sceneFields}>
                      <span className={styles.fieldHint}>{slot.hint}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        {slot.draft.preview && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={slot.draft.preview} alt={slot.title} style={{ width: 80, height: 100, objectFit: "cover", borderRadius: 6 }} />
                        )}
                        <label className={styles.addSceneBtn} style={{ cursor: "pointer" }}>
                          {slot.draft.uploading ? "Uploading..." : slot.draft.imagePath ? "Replace plate" : "Upload plate"}
                          <input
                            type="file"
                            accept="image/*"
                            style={{ display: "none" }}
                            onChange={e => { const f = e.target.files?.[0]; if (f) uploadTrendPlateFile(f, slot.key); e.target.value = ""; }}
                          />
                        </label>
                        {libraryAssets.length > 0 && (
                          <button type="button" className={styles.addSceneBtn} onClick={() => { setLibraryFilter(slot.key === "mugshot" ? "mugshot_plate" : slot.key === "bowl" ? "bowl_plate" : "viral_plate"); setLibraryTab("mine"); setLibraryPicker({ target: slot.libTarget }); }}>
                            📚 Add from library
                          </button>
                        )}
                        <button type="button" className={styles.addSceneBtn} onClick={() => { setLibraryTab("community"); fetchCommunitySetups(); setLibraryPicker({ target: slot.libTarget }); }}>
                          🌐 Community
                        </button>
                        {slot.draft.imagePath && (
                          <button type="button" className={styles.addSceneBtn} onClick={() => publishSlotToCommunity(slot.libTarget, slot.draft.imagePath, slot.title)}>
                            Share to community
                          </button>
                        )}
                      </div>
                      {!slot.draft.imagePath && (
                        <span style={{ color: "#e5849d", fontSize: "0.78rem" }}>
                          This slot stays off until you upload its plate.
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Signature poses — any category */}
          <div className={styles.field}>
            <span className={styles.label}>Signature poses ({poseOptions.length}/{MAX_POSE_OPTIONS})</span>
            <p className={styles.fieldHint}>
              Upload named pose/mannerism references (e.g. someone&apos;s signature poses) — build a big
              variety pool. Every shoot automatically gets a random, non-repeating mix from this pool, one
              distinct pose per portrait. Buyers never pick — wardrobe, background, and identity stay theirs.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {poseOptions.map(p => (
                <div key={p.id} className={styles.sceneCard}>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                    {p.preview && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.preview} alt={p.name} style={{ width: 70, height: 88, objectFit: "cover", borderRadius: 6 }} />
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 180 }}>
                      <input
                        className={styles.input}
                        placeholder="Pose name, e.g. Power stance"
                        value={p.name}
                        maxLength={40}
                        onChange={e => setPoseOptions(prev => prev.map(x => x.id === p.id ? { ...x, name: e.target.value } : x))}
                      />
                      <input
                        className={styles.input}
                        placeholder="Optional note for this pose"
                        value={p.description}
                        maxLength={200}
                        onChange={e => setPoseOptions(prev => prev.map(x => x.id === p.id ? { ...x, description: e.target.value } : x))}
                      />
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <label className={styles.addSceneBtn} style={{ cursor: "pointer" }}>
                          {p.uploading ? "Uploading..." : p.imagePath ? "Replace photo" : "Upload photo"}
                          <input
                            type="file"
                            accept="image/*"
                            style={{ display: "none" }}
                            onChange={e => { const f = e.target.files?.[0]; if (f) uploadPoseOptionFile(f, p.id); e.target.value = ""; }}
                          />
                        </label>
                        <button type="button" className={styles.sceneRemove} onClick={() => setPoseOptions(prev => prev.filter(x => x.id !== p.id))}>Remove</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {poseOptions.length < MAX_POSE_OPTIONS && (
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                {libraryAssets.some(a => a.type === "pose") && (
                  <button type="button" className={styles.addSceneBtn} onClick={() => { setLibraryFilter("pose"); setLibraryTab("mine"); setLibraryPicker({ target: "pose" }); }}>
                    📚 Add from library
                  </button>
                )}
                <button
                  type="button"
                  className={styles.addSceneBtn}
                  onClick={() => setPoseOptions(prev => [...prev, { id: crypto.randomUUID(), name: "", description: "", imagePath: "", preview: "", uploading: false }])}
                >
                  + Add pose
                </button>
              </div>
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
                  <ImagePreview src={ref.preview} alt="" className={styles.imgPreview} />
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
                          ? <ImagePreview src={img.preview_url} alt={`Slot ${img.slot}`} className={styles.showcaseImg} />
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
      {qrTemplateId && (() => {
        const t = templates.find(x => x.id === qrTemplateId);
        if (!t) return null;
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 200, overflowY: "auto" }}
            onClick={() => setQrTemplateId(null)}>
            <div onClick={e => e.stopPropagation()}>
              <TemplateShareCard
                templateUrl={`https://aluxartandframes.shop/marketplace/${t.id}`}
                creatorUsername={creator?.display_name ?? "AluxArt"}
                coverUrl={t.cover_url ?? null}
                includeCover={true}
                onClose={() => setQrTemplateId(null)}
              />
            </div>
          </div>
        );
      })()}

      {showCollageEditor && (
        <CollageEditor
          templateId={panel === "create" ? "" : panel}
          images={sampleImages
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
