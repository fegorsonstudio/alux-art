/**
 * Instagram, Facebook and TikTok open links inside their own browser, where
 * the camera is unreliable and the share sheet is missing. Same detection
 * and escape hatch as the download page (app/d/[token]/route.ts).
 */
export function detectInApp(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Instagram|FBAN|FBAV|FB_IAB|FBIOS|Line\/|TikTok|musical_ly|Snapchat/i.test(navigator.userAgent || "");
}

/** A URL that opens the real browser, or null when there is no known trick. */
export function escapeUrl(): string | null {
  if (typeof location === "undefined") return null;
  const ua = navigator.userAgent || "";
  const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const here = location.host + location.pathname + location.search;
  if (ios) return `x-safari-https://${here}`;
  if (android) return `intent://${here}#Intent;scheme=https;end`;
  return null;
}
