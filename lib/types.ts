export type Currency = "NGN" | "USD";
export type ShootMode = "fast" | "advanced";
export type AspectRatio = "3:4" | "4:5" | "1:1" | "16:9" | "9:16" | "2:3";
export type ShootStatus =
  | "DRAFT" | "PENDING_PAYMENT" | "QUEUED" | "PROCESSING" | "COMPLETE" | "FAILED"
  | "BASE_LOCKING" | "BASE_REVIEW" | "BASE_REJECTED";

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
  background_is_white_seamless: boolean;
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
export type ReferenceTag = "OUTFIT" | "HAIRSTYLE" | "MAKEUP" | "BACKGROUND" | "LIGHTING" | "ACCESSORY" | "COLOR_GRADE" | "NAIL_DESIGN";
export type ReferencePurpose = "identity" | "inspiration" | "tagged";
export type ShootPackageSize = 5 | 10;

export const SHOOT_PACKAGES: Record<ShootPackageSize, { imageCount: ShootPackageSize; priceMultiplier: number; label: string }> = {
  5: { imageCount: 5, priceMultiplier: 0.5, label: "5 images" },
  10: { imageCount: 10, priceMultiplier: 1, label: "10 images" },
};

export function normalizePackageSize(value: unknown): ShootPackageSize {
  return Number(value) === 5 ? 5 : 10;
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
  "OUTFIT", "HAIRSTYLE", "MAKEUP", "NAIL_DESIGN", "BACKGROUND", "LIGHTING", "ACCESSORY", "COLOR_GRADE",
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
