export type Currency = "NGN" | "USD";
export type ShootMode = "fast" | "advanced";
export type AspectRatio = "3:4" | "4:5" | "1:1" | "16:9" | "9:16" | "2:3";
export type ShootStatus = "DRAFT" | "PENDING_PAYMENT" | "QUEUED" | "PROCESSING" | "COMPLETE" | "FAILED";
export type ImageStatus = "PENDING" | "GENERATING" | "UPSCALING" | "COMPLETE" | "FAILED";
export type ImageKind = "portrait" | "mood" | "quote";
export type ReferenceTag = "OUTFIT" | "HAIRSTYLE" | "MAKEUP" | "BACKGROUND" | "LIGHTING" | "ACCESSORY" | "COLOR_GRADE";
export type ReferencePurpose = "identity" | "inspiration" | "tagged";

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
  "OUTFIT", "HAIRSTYLE", "MAKEUP", "BACKGROUND", "LIGHTING", "ACCESSORY", "COLOR_GRADE",
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
  status: ShootStatus;
  progress: number;
  pipelineStage?: string;
  quote?: { text: string; attribution: string };
  identityProfile?: string;
  shootBrief?: string;
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

// SSE event types
export type SSEEventType =
  | "snapshot"
  | "stage"
  | "slot_update"
  | "slot_complete"
  | "zip_ready"
  | "complete"
  | "error";

export interface SSEEvent {
  type: SSEEventType;
  shoot?: Partial<Shoot>;
  image?: Partial<ShootImage>;
  progress?: number;
  stage?: string;
  zipUrl?: string;
  error?: string;
}
