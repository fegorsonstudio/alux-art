import { timingSafeEqual } from "crypto";

/**
 * True when a request carries the app's own internal secret. Compared in
 * constant time, so the secret cannot be guessed a character at a time from
 * how long a wrong guess takes.
 */
export function isInternalSecret(value: string | null | undefined): boolean {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret || !value) return false;
  const a = Buffer.from(value), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The picture sizes the image model accepts. Anything else from a caller becomes 4K. */
const RESOLUTIONS = new Set(["0.5K", "1K", "2K", "4K"]);
export function safeResolution(value: unknown): string {
  return typeof value === "string" && RESOLUTIONS.has(value) ? value : "4K";
}
