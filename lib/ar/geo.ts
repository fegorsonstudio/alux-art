/**
 * Distance, bearing and the geofence for the AR viewer. Pure functions plus
 * one small class around watchPosition; nothing here touches the DOM beyond
 * navigator.geolocation.
 */

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

/** Metres between two points on the ground. */
export function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Compass bearing from a to b, 0..360 clockwise from north. */
export function bearingDeg(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const φ1 = rad(aLat), φ2 = rad(bLat), Δλ = rad(bLng - aLng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Index 0..7 into "N,NE,E,SE,S,SW,W,NW". */
export function compassIndex(deg: number): number {
  return Math.round((((deg % 360) + 360) % 360) / 45) % 8;
}

export type GeoState = {
  fix: boolean;
  distanceM: number;
  accuracyM: number;
  bearingDeg: number;
  inside: boolean;
  stale: boolean;
  error?: "denied" | "unavailable" | "timeout";
};

type Fix = { lat: number; lng: number; acc: number; at: number };

/**
 * Watches the phone's position and says whether it is inside the circle.
 *
 * GPS wobbles, more so near buildings, so the answer is smoothed: the last
 * 20 s of fixes are averaged (better fixes count for more), it takes two
 * fixes inside to enter, and once inside it takes a clear step outside plus
 * ten seconds to leave. Without that the camera would flicker on and off at
 * the edge of the circle.
 */
export class GeofenceTracker {
  private fixes: Fix[] = [];
  private watchId: number | null = null;
  private inside = false;
  private insideHits = 0;
  private outsideSince = 0;
  private staleTimer: ReturnType<typeof setInterval> | null = null;
  private lastFixAt = 0;
  private retriedLowAccuracy = false;

  constructor(
    private target: { lat: number; lng: number; radiusM: number },
    private onChange: (s: GeoState) => void,
  ) {}

  start() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      this.onChange(this.state({ error: "unavailable" }));
      return;
    }
    this.watch(true);
    this.staleTimer = setInterval(() => {
      if (this.lastFixAt && Date.now() - this.lastFixAt > 20_000) this.onChange(this.state({ stale: true }));
    }, 5_000);
  }

  stop() {
    if (this.watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
    if (this.staleTimer) clearInterval(this.staleTimer);
    this.staleTimer = null;
  }

  private watch(highAccuracy: boolean) {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = navigator.geolocation.watchPosition(
      (p) => this.onFix(p),
      (e) => {
        if (e.code === e.PERMISSION_DENIED) this.onChange(this.state({ error: "denied" }));
        else if (e.code === e.TIMEOUT && !this.retriedLowAccuracy) { this.retriedLowAccuracy = true; this.watch(false); }
        else if (e.code === e.TIMEOUT) this.onChange(this.state({ error: "timeout" }));
        else this.onChange(this.state({ error: "unavailable" }));
      },
      { enableHighAccuracy: highAccuracy, maximumAge: 2_000, timeout: 15_000 },
    );
  }

  private onFix(p: GeolocationPosition) {
    const now = Date.now();
    this.lastFixAt = now;
    const acc = Math.max(1, p.coords.accuracy || 50);
    // A very poor fix is only kept when nothing better has arrived for a while.
    const recentGood = this.fixes.some((f) => f.acc <= 150 && now - f.at < 15_000);
    if (acc > 150 && recentGood) return;
    this.fixes.push({ lat: p.coords.latitude, lng: p.coords.longitude, acc, at: now });
    this.fixes = this.fixes.filter((f) => now - f.at <= 20_000).slice(-6);

    let wsum = 0, lat = 0, lng = 0, best = Infinity;
    for (const f of this.fixes) {
      const w = 1 / (f.acc * f.acc);
      wsum += w; lat += f.lat * w; lng += f.lng * w;
      if (f.acc < best) best = f.acc;
    }
    lat /= wsum; lng /= wsum;

    const d = haversineM(lat, lng, this.target.lat, this.target.lng);
    const r = this.target.radiusM;
    if (!this.inside) {
      if (d <= r + Math.min(best, 50)) this.insideHits++; else this.insideHits = 0;
      if (this.insideHits >= 2) { this.inside = true; this.outsideSince = 0; }
    } else if (d > r + best + 30) {
      if (!this.outsideSince) this.outsideSince = now;
      if (now - this.outsideSince > 10_000) { this.inside = false; this.insideHits = 0; this.outsideSince = 0; }
    } else {
      this.outsideSince = 0;
    }
    this.onChange(this.state({
      fix: true, distanceM: d, accuracyM: best,
      bearingDeg: bearingDeg(lat, lng, this.target.lat, this.target.lng),
      inside: this.inside, stale: false,
    }));
  }

  private state(partial: Partial<GeoState>): GeoState {
    return { fix: false, distanceM: 0, accuracyM: 0, bearingDeg: 0, inside: this.inside, stale: false, ...partial };
  }
}

/** "320 m" or "1.2 km". */
export function formatDistance(m: number, locale: string): string {
  if (m < 1000) return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.max(0, m))} m`;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(m / 1000)} km`;
}
