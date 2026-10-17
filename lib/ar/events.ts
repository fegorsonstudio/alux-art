/**
 * What the viewer tells the server: a handful of counted moments, nothing
 * about the person. Each kind is sent once per page load except "photo".
 */
export type ArClientEvent = {
  type: "open" | "permission_denied" | "outside" | "activated" | "photo";
  which?: "camera" | "location" | "motion";
  d?: "0-50" | "50-200" | "200-1000" | "1000+";
  os?: "ios" | "android" | "other";
  preview?: boolean;
};

const sent = new Set<string>();

export function platformOf(): "ios" | "android" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

export function distanceBucket(m: number): ArClientEvent["d"] {
  return m < 50 ? "0-50" : m < 200 ? "50-200" : m < 1000 ? "200-1000" : "1000+";
}

export function sendArEvent(token: string, e: ArClientEvent): void {
  const key = e.type === "photo" ? "" : `${e.type}:${e.which ?? ""}`;
  if (key) { if (sent.has(key)) return; sent.add(key); }
  try {
    fetch(`/api/ar/${encodeURIComponent(token)}/event`, {
      method: "POST", keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...e, os: e.os ?? platformOf() }),
    }).catch(() => undefined);
  } catch { /* nothing to do: counts are best effort */ }
}
