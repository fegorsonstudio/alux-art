export type Currency = "NGN" | "USD";
export type ShootMode = "fast" | "advanced";
export type AspectRatio = "3:4" | "4:5" | "1:1" | "16:9" | "9:16" | "2:3";
export type ShootStatus =
  | "DRAFT" | "PENDING_PAYMENT" | "QUEUED" | "PROCESSING" | "COMPLETE" | "FAILED"
  | "BASE_LOCKING" | "BASE_REVIEW" | "BASE_REJECTED" | "REFUNDED";

export type BaseLockStatus =
  | "GENERATING" | "AUTO_APPROVED" | "PENDING_USER_APPROVAL"
  | "USER_APPROVED" | "USER_REJECTED" | "FAILED";

export interface StylingBrief {
  outfit: string;
  hair: string;
  makeup: string;
  nails: string;
  accessories: string[];
  outfit_ref_exclusions: string[];
}

export interface QualityGateResult {
  face_detected: boolean;
  face_count: number;
  identity_match_score: number;   // 0-1; >=0.85 auto, 0.70-0.85 borderline, <0.70 fail
  full_body_visible: boolean;
  background_is_clean_studio: boolean;
  no_crops: boolean;
  technical_quality_score: number; // 0-1; >=0.75 auto
  notes: string;
}

export interface CharacterBase {
  id: string;
  userId: string;
  originShootId?: string;
  cacheKey: string;
  identityImagePaths: string[];
  outfitRefPath?: string;
  hairstyleRefPath?: string;
  makeupRefPath?: string;
  nailRefPath?: string;
  accessoryRefPaths: string[];
  customTagRefs: Record<string, string>;
  identityProfile: string;
  stylingBrief: StylingBrief;
  baseStoragePath?: string;
  base4kStoragePath?: string;
  falSeed?: number;
  status: BaseLockStatus;
  qualityGateResult?: QualityGateResult;
  attemptNumber: number;
  failureReason?: string;
  userLabel?: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  // signed URLs (added server-side on demand)
  baseUrl?: string;
  base4kUrl?: string;
}
export type ImageStatus = "PENDING" | "GENERATING" | "UPSCALING" | "COMPLETE" | "FAILED";
export type ImageKind = "portrait" | "mood" | "quote";
export type ReferenceTag = "OUTFIT" | "HAIRSTYLE" | "MAKEUP" | "BACKGROUND" | "LIGHTING" | "COLOR_GRADE" | "NAIL_DESIGN";
export type ReferencePurpose = "identity" | "inspiration" | "tagged";
export type ShootPackageSize = 1 | 5 | 10;

export const PLATFORM_FEE_NGN = 15000;

export const SHOOT_PACKAGES: Record<ShootPackageSize, { imageCount: ShootPackageSize; priceMultiplier: number; label: string }> = {
  1: { imageCount: 1, priceMultiplier: 0.1, label: "1 image" },
  5: { imageCount: 5, priceMultiplier: 0.5, label: "5 images" },
  10: { imageCount: 10, priceMultiplier: 1, label: "10 images" },
};

export function normalizePackageSize(value: unknown): ShootPackageSize {
  const n = Number(value);
  if (n === 1) return 1;
  if (n === 5) return 5;
  return 10;
}

export function packagePrice(basePrice: number, packageSize: ShootPackageSize): number {
  return Math.ceil(basePrice * SHOOT_PACKAGES[packageSize].priceMultiplier);
}

export interface AspectConfig {
  width: number;
  height: number;
  label: string;
  falAspect: string;
}

export const ASPECTS: Record<AspectRatio, AspectConfig> = {
  "3:4":  { width: 3072, height: 4096, label: "Portrait 3:4",    falAspect: "portrait_3_4" },
  "4:5":  { width: 3277, height: 4096, label: "Instagram 4:5",   falAspect: "portrait_4_5" },
  "1:1":  { width: 4096, height: 4096, label: "Square 1:1",      falAspect: "square" },
  "16:9": { width: 4096, height: 2304, label: "Landscape 16:9",  falAspect: "landscape_16_9" },
  "9:16": { width: 2304, height: 4096, label: "Vertical 9:16",   falAspect: "portrait_9_16" },
  "2:3":  { width: 2731, height: 4096, label: "Classic 2:3",     falAspect: "portrait_2_3" },
};

export const REFERENCE_TAGS: ReferenceTag[] = [
  "OUTFIT", "HAIRSTYLE", "MAKEUP", "NAIL_DESIGN", "BACKGROUND", "LIGHTING", "COLOR_GRADE",
];

export const FAL_MODELS = [
  "fal-ai/nano-banana-2/edit",
  "fal-ai/flux/dev",
  "fal-ai/flux-pro/v1.1",
  "openai/gpt-image-2/edit",
];

export interface User {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  currency: Currency;
  banned?: boolean;
}

export interface IdentityImage {
  id: string;
  userId: string;
  name: string;
  type: string;
  size: number;
  storageBucket: string;
  storagePath: string;
  fingerprint?: string;
  createdAt: string;
  lastUsedAt?: string;
}

export interface ShootReference {
  id: string;
  shootId: string;
  purpose: ReferencePurpose;
  tag?: ReferenceTag;
  customName?: string;
  note?: string;
  name: string;
  type: string;
  size: number;
  storageBucket: string;
  storagePath: string;
}

export interface ShootImage {
  id: string;
  shootId: string;
  slot: number;
  kind: ImageKind;
  status: ImageStatus;
  stage?: string;
  prompt?: string;
  provider?: string;
  providerError?: string;
  configuredModel?: string;
  previewUrl?: string;
  downloadUrl?: string;
  instagramUrl?: string;
  originalDimensions?: { width: number; height: number };
  finalDimensions?: { width: number; height: number };
  upscaled?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Shoot {
  id: string;
  userId: string;
  ownerEmail: string;
  mode: ShootMode;
  aspectRatio: AspectRatio;
  currency: Currency;
  packageSize?: ShootPackageSize;
  status: ShootStatus;
  progress: number;
  pipelineStage?: string;
  quote?: { text: string; attribution: string };
  identityProfile?: string;
  shootBrief?: string;
  characterBaseId?: string;
  baseLockStatus?: BaseLockStatus;
  baseLockStartedAt?: string;
  baseLockCompletedAt?: string;
  characterBase?: CharacterBase;
  zipStatus?: "pending" | "ready" | "failed";
  zipUrl?: string;
  images: ShootImage[];
  // Story fields
  rolePrompt?: string;
  storyAssets?: StoryAssets;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface ModelSlot {
  slot: number;
  model: string;
  fallback: string;
  enabled: boolean;
}

export interface Pricing {
  ngn: number;
  usd: number;
}

export interface PackagePricing {
  imageCount: ShootPackageSize;
  label: string;
  ngn: number;
  usd: number;
}

// ── Marketplace types ────────────────────────────────────────────────────────

export type TemplateCategory =
  | "portrait" | "editorial" | "corporate" | "glamour" | "wedding"
  | "maternity" | "fantasy" | "boudoir" | "street" | "other" | "story";

// Story Photoshoot types
export type StoryType = "solo" | "duo" | "group" | "brand" | "group_brand";

export interface StoryAssetConfig {
  requiresCostar: boolean;
  requiresGroup: boolean;
  requiresBrand: boolean;
  defaultRole?: string;
  roleChips?: string[];
  sceneLabels?: string[];
  storyType?: StoryType;
}

export interface StoryAssets {
  costarRefs?: Array<{ storagePath: string; storageBucket: string; name?: string }>;
  groupPhotoRef?: { storagePath: string; storageBucket: string; name?: string };
  brandRefs?: Array<{ storagePath: string; storageBucket: string; placement?: "everywhere" | "background" | "subtle"; name?: string }>;
}

export const TEMPLATE_CATEGORIES: { value: TemplateCategory; label: string; isStory?: boolean }[] = [
  { value: "story",     label: "📖 Stories", isStory: true },
  { value: "portrait",  label: "Portrait" },
  { value: "editorial", label: "Editorial" },
  { value: "corporate", label: "Corporate" },
  { value: "glamour",   label: "Glamour" },
  { value: "wedding",   label: "Wedding" },
  { value: "maternity", label: "Maternity" },
  { value: "fantasy",   label: "Fantasy" },
  { value: "boudoir",   label: "Boudoir" },
  { value: "street",    label: "Street" },
  { value: "other",     label: "Other" },
];

export type TemplateStatus = "draft" | "published" | "suspended";
export type CouponDiscountType = "percent" | "fixed";
export type PurchaseStatus = "pending" | "success" | "failed";

export interface Creator {
  id: string;
  userId: string;
  displayName: string;
  bio?: string;
  avatarStoragePath?: string;
  avatarBucket?: string;
  avatarUrl?: string;
  instagramUrl?: string;
  websiteUrl?: string;
  paystackSubaccountCode?: string;
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
  isActive: boolean;
  templateCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Template {
  id: string;
  creatorId: string;
  creator?: Pick<Creator, "id" | "displayName" | "avatarUrl" | "templateCount">;
  title: string;
  description?: string;
  category: TemplateCategory;
  tags: string[];
  priceNgn: number;
  shootMode: ShootMode;
  aspectRatio: AspectRatio;
  packageSize: ShootPackageSize;
  status: TemplateStatus;
  purchaseCount: number;
  coverStoragePath?: string;
  coverBucket?: string;
  coverUrl?: string;
  images?: TemplateImage[];
  // Story fields
  isStory?: boolean;
  storyType?: StoryType;
  defaultRole?: string;
  roleChips?: string[];
  requiresCostar?: boolean;
  requiresGroup?: boolean;
  requiresBrand?: boolean;
  sceneLabels?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TemplateImage {
  id: string;
  templateId: string;
  storagePath: string;
  storageBucket: string;
  displayOrder: number;
  purpose: "inspiration" | "tagged";
  tag?: string;
  url?: string;
  createdAt: string;
}

export interface Coupon {
  id: string;
  code: string;
  description?: string;
  discountType: CouponDiscountType;
  discountValue: number;
  maxUses?: number;
  useCount: number;
  expiresAt?: string;
  isActive: boolean;
  createdAt: string;
}

export interface TemplatePurchase {
  id: string;
  templateId: string;
  shootId?: string;
  userId: string;
  amountNgn: number;
  platformFeeNgn: number;
  creatorPayoutNgn: number;
  couponId?: string;
  couponDiscountNgn: number;
  paystackReference?: string;
  status: PurchaseStatus;
  createdAt: string;
}

// SSE event types
export type SSEEventType =
  | "snapshot" | "stage" | "slot_update" | "slot_complete"
  | "zip_ready" | "complete" | "error"
  | "base_locking" | "base_attempt" | "base_ready"
  | "base_review_required" | "base_rerolling" | "base_approved";

export interface SSEEvent {
  type: SSEEventType;
  shoot?: Partial<Shoot>;
  image?: Partial<ShootImage>;
  progress?: number;
  stage?: string;
  zipUrl?: string;
  error?: string;
}
