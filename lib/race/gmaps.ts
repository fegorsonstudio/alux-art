"use client";

/**
 * Loads Google's Maps JavaScript API once, for the Street View panorama the
 * hunt drives through. The key is the website-restricted one; the race pages
 * carry their own Content-Security-Policy that allows Google's script.
 */
let loading: Promise<typeof google> | null = null;

export function loadGoogleMaps(key: string): Promise<typeof google> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.maps?.StreetViewPanorama) return Promise.resolve(window.google);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const cb = "__aluxMapsReady";
    (window as unknown as Record<string, unknown>)[cb] = () => resolve(window.google);
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=${cb}`;
    s.async = true;
    s.onerror = () => { loading = null; reject(new Error("Google Maps did not load.")); };
    document.head.appendChild(s);
    setTimeout(() => { if (!window.google?.maps) { loading = null; reject(new Error("Google Maps took too long to load.")); } }, 30_000);
  });
  return loading;
}

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
export function bearingDeg(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const φ1 = rad(aLat), φ2 = rad(bLat), Δλ = rad(bLng - aLng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
export const angleDiff = (a: number, b: number) => { let d = ((a - b) % 360 + 540) % 360 - 180; return d; };

/** A simple car seen from above, as a marker icon. */
export function carIcon(color: string, ghost = false): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44"><g opacity="${ghost ? 0.55 : 1}"><ellipse cx="22" cy="40" rx="14" ry="3" fill="rgba(0,0,0,0.25)"/><rect x="10" y="6" width="24" height="34" rx="7" fill="${color}" stroke="#1b1e22" stroke-width="2"/><rect x="13" y="12" width="18" height="9" rx="3" fill="#8fc8ff"/><rect x="13" y="26" width="18" height="7" rx="2" fill="#8fc8ff" opacity="0.8"/><rect x="8" y="10" width="4" height="7" rx="1.5" fill="#1b1e22"/><rect x="32" y="10" width="4" height="7" rx="1.5" fill="#1b1e22"/><rect x="8" y="28" width="4" height="7" rx="1.5" fill="#1b1e22"/><rect x="32" y="28" width="4" height="7" rx="1.5" fill="#1b1e22"/></g></svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

/** The prize: a hot-air balloon in the brand's colours. */
export function balloonIcon(a: string, b: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="128" viewBox="0 0 96 128"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="${a}"/><stop offset="0.5" stop-color="${b}"/><stop offset="1" stop-color="${a}"/></linearGradient></defs><path d="M48 4c-24 0-40 18-40 40 0 22 24 38 34 56h12c10-18 34-34 34-56C88 22 72 4 48 4z" fill="url(#g)" stroke="#2b2b2b" stroke-width="2"/><path d="M48 4v96M28 10c-8 14-8 48 10 86M68 10c8 14 8 48-10 86" stroke="rgba(0,0,0,0.25)" stroke-width="2" fill="none"/><rect x="38" y="104" width="20" height="14" rx="3" fill="#7a4f26" stroke="#3b2516" stroke-width="2"/><path d="M42 100l-2 4M54 100l2 4" stroke="#5a4a3a" stroke-width="2"/></svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
