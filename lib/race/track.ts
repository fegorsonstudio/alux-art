"use client";

/**
 * The geometry of a recorded road: the GPS samples logged while the video
 * was filmed, turned into "how far along the road" (metres) for any moment
 * of the video, and back into a position and heading for any distance. Used
 * by the race (speed, finish, poses for the other hunters) and the minimap.
 * A recording with no usable GPS gets a straight synthetic line so the game
 * still works; only the map and the rivals' positions are then approximate.
 */

export type TrackSample = [number, number, number]; // seconds, lat, lng

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
export function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
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

export class TrackGeom {
  readonly t: number[] = [];
  readonly lat: number[] = [];
  readonly lng: number[] = [];
  readonly s: number[] = [];      // cumulative metres at each sample
  readonly length: number;
  readonly duration: number;
  readonly synthetic: boolean;

  constructor(samples: TrackSample[], durationS: number, lengthHint: number, origin: { lat: number; lng: number }) {
    this.duration = Math.max(1, durationS);
    // Keep the samples that make sense: in order, no jumps faster than 45 m/s.
    const keep: TrackSample[] = [];
    for (const smp of samples) {
      const last = keep[keep.length - 1];
      if (last) {
        const dt = smp[0] - last[0];
        if (dt <= 0) continue;
        if (haversineM(last[1], last[2], smp[1], smp[2]) / dt > 45) continue;
      }
      keep.push(smp);
    }
    let length = 0;
    for (let i = 1; i < keep.length; i++) length += haversineM(keep[i - 1][1], keep[i - 1][2], keep[i][1], keep[i][2]);
    if (keep.length >= 2 && length >= 30) {
      this.synthetic = false;
      let acc = 0;
      for (let i = 0; i < keep.length; i++) {
        if (i > 0) acc += haversineM(keep[i - 1][1], keep[i - 1][2], keep[i][1], keep[i][2]);
        this.t.push(keep[i][0]); this.lat.push(keep[i][1]); this.lng.push(keep[i][2]); this.s.push(acc);
      }
      // The video may run on past the last fix (or start before the first): extend at the edge speed.
      if (this.t[this.t.length - 1] < this.duration - 0.5) {
        const n = this.t.length, v = n >= 2 ? (this.s[n - 1] - this.s[n - 2]) / Math.max(0.5, this.t[n - 1] - this.t[n - 2]) : 8;
        const extra = v * (this.duration - this.t[n - 1]);
        const h = n >= 2 ? bearingDeg(this.lat[n - 2], this.lng[n - 2], this.lat[n - 1], this.lng[n - 1]) : 0;
        const p = offset(this.lat[n - 1], this.lng[n - 1], h, extra);
        this.t.push(this.duration); this.lat.push(p.lat); this.lng.push(p.lng); this.s.push(acc + extra);
      }
      if (this.t[0] > 0.5) { this.t.unshift(0); this.lat.unshift(this.lat[0]); this.lng.unshift(this.lng[0]); this.s.unshift(0); }
      this.length = this.s[this.s.length - 1];
    } else {
      // No usable GPS: a straight line north from the first fix (or the prize), at the length the server estimated.
      this.synthetic = true;
      const start = keep[0] ? { lat: keep[0][1], lng: keep[0][2] } : origin;
      const len = Math.max(50, lengthHint || this.duration * 8);
      const end = offset(start.lat, start.lng, 0, len);
      this.t.push(0, this.duration); this.lat.push(start.lat, end.lat); this.lng.push(start.lng, end.lng); this.s.push(0, len);
      this.length = len;
    }
  }

  /** Metres along the road at a moment of the video. */
  sAt(time: number): number {
    const t = Math.max(0, Math.min(this.duration, time));
    const i = this.indexAt(t);
    if (i >= this.t.length - 1) return this.s[this.s.length - 1];
    const f = (t - this.t[i]) / Math.max(1e-6, this.t[i + 1] - this.t[i]);
    return this.s[i] + (this.s[i + 1] - this.s[i]) * f;
  }

  /** Ground speed (m/s) of the recording around a moment, smoothed over ±2 s. */
  speedAt(time: number): number {
    const a = this.sAt(time - 2), b = this.sAt(time + 2);
    const ta = Math.max(0, time - 2), tb = Math.min(this.duration, time + 2);
    return tb > ta ? (b - a) / (tb - ta) : 0;
  }

  /** Position and heading at a distance along the road. */
  posAt(dist: number): { lat: number; lng: number; heading: number } {
    const s = Math.max(0, Math.min(this.length, dist));
    let i = 0;
    while (i < this.s.length - 2 && this.s[i + 1] < s) i++;
    const j = Math.min(this.s.length - 1, i + 1);
    const f = (s - this.s[i]) / Math.max(1e-6, this.s[j] - this.s[i]);
    const lat = this.lat[i] + (this.lat[j] - this.lat[i]) * f, lng = this.lng[i] + (this.lng[j] - this.lng[i]) * f;
    const heading = bearingDeg(this.lat[i], this.lng[i], this.lat[j], this.lng[j]);
    return { lat, lng, heading };
  }

  /** The distance along the road nearest a position (for the other hunters' poses). */
  sOf(lat: number, lng: number): number {
    let best = 0, bd = Infinity;
    for (let i = 0; i < this.lat.length - 1; i++) {
      const ax = this.lng[i], az = this.lat[i], bx = this.lng[i + 1], bz = this.lat[i + 1];
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-12;
      const u = Math.max(0, Math.min(1, ((lng - ax) * dx + (lat - az) * dz) / l2));
      const px = ax + dx * u, pz = az + dz * u;
      const d = haversineM(lat, lng, pz, px);
      if (d < bd) { bd = d; best = this.s[i] + (this.s[i + 1] - this.s[i]) * u; }
    }
    return best;
  }

  private indexAt(t: number): number {
    let lo = 0, hi = this.t.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (this.t[mid] <= t) lo = mid; else hi = mid - 1; }
    return lo;
  }
}

/** A point `m` metres from (lat, lng) on compass heading `h`. */
export function offset(lat: number, lng: number, h: number, m: number): { lat: number; lng: number } {
  const b = rad(h);
  return { lat: lat + (m * Math.cos(b)) / 110_540, lng: lng + (m * Math.sin(b)) / (111_320 * Math.cos(rad(lat))) };
}
