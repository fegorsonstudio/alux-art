"use client";

import { angleDiff, bearingDeg, distanceM } from "./gmaps";

/**
 * Pictures placed over the Street View panorama at real-world positions:
 * the prize balloon, the other hunters, the ghost and our traffic. Google's
 * own markers were unreliable in the panorama, so this draws plain <img>
 * elements in a layer of ours and asks Google only where a lat/lng lands on
 * the screen (an OverlayView's projection, which the panorama supports).
 * Sizes follow the projection too: a thing w metres wide is drawn w times
 * the on-screen size of one metre at that spot.
 */

export type Placement = {
  url: string;
  wM: number;            // width in metres
  hM: number;            // height in metres
  liftM?: number;        // how far above the ground its bottom edge floats
  minPx?: number;        // never smaller than this (height), e.g. a far-off beacon
  maxPx?: number;
  label?: string;
  opacity?: number;
};

type Item = { img: HTMLImageElement; tag: HTMLSpanElement; url: string; shown: boolean };

export class SpriteLayer {
  private items = new Map<string, Item>();
  private overlay: google.maps.OverlayView;
  private ready = false;

  constructor(private g: typeof google, private pano: google.maps.StreetViewPanorama, private host: HTMLElement) {
    const self = this;
    class O extends g.maps.OverlayView {
      onAdd() { self.ready = true; }
      draw() { self.ready = true; }
      onRemove() { self.ready = false; }
    }
    this.overlay = new O();
    this.overlay.setMap(pano);
  }

  /** Pixels on screen for one metre at this spot, and the spot itself; null when not projectable yet. */
  private project(lat: number, lng: number, bearing: number): { x: number; y: number; pxPerM: number } | null {
    if (!this.ready) return null;
    const pr = this.overlay.getProjection();
    if (!pr) return null;
    const p0 = pr.fromLatLngToContainerPixel(new this.g.maps.LatLng(lat, lng));
    if (!p0) return null;
    // One metre sideways (perpendicular to the line of sight) at the same distance.
    const side = ((bearing + 90) * Math.PI) / 180;
    const lat1 = lat + Math.cos(side) / 110_540, lng1 = lng + Math.sin(side) / (111_320 * Math.cos((lat * Math.PI) / 180));
    const p1 = pr.fromLatLngToContainerPixel(new this.g.maps.LatLng(lat1, lng1));
    if (!p1) return null;
    return { x: p0.x, y: p0.y, pxPerM: Math.hypot(p1.x - p0.x, p1.y - p0.y) };
  }

  private item(id: string): Item {
    let it = this.items.get(id);
    if (it) return it;
    const img = document.createElement("img");
    img.alt = "";
    img.draggable = false;
    img.style.cssText = "position:absolute;left:0;top:0;transform-origin:50% 100%;will-change:transform;display:none;pointer-events:none;image-rendering:auto;";
    const tag = document.createElement("span");
    tag.style.cssText = "position:absolute;left:0;top:0;display:none;transform:translate(-50%,-100%);padding:2px 7px;border-radius:999px;background:rgba(10,20,24,0.65);color:#fff;font-size:11px;font-weight:700;white-space:nowrap;pointer-events:none;";
    this.host.appendChild(img);
    this.host.appendChild(tag);
    it = { img, tag, url: "", shown: false };
    this.items.set(id, it);
    return it;
  }

  /** Put (or move) a picture at a world position; hidden when behind the player or off screen. */
  place(id: string, lat: number, lng: number, p: Placement): { dist: number; bearing: number } {
    const here = this.pano.getPosition();
    const it = this.item(id);
    if (!here) { this.hide(id); return { dist: Infinity, bearing: 0 }; }
    const vLat = here.lat(), vLng = here.lng();
    const dist = distanceM(vLat, vLng, lat, lng);
    const bearing = bearingDeg(vLat, vLng, lat, lng);
    const heading = this.pano.getPov().heading;
    if (Math.abs(angleDiff(bearing, heading)) > 95) { this.hide(id); return { dist, bearing }; }
    const pr = this.project(lat, lng, bearing);
    if (!pr) { this.hide(id); return { dist, bearing }; }
    const W = this.host.clientWidth, H = this.host.clientHeight;
    let h = p.hM * pr.pxPerM, w = p.wM * pr.pxPerM;
    if (p.minPx && h < p.minPx) { w *= p.minPx / h; h = p.minPx; }
    if (p.maxPx && h > p.maxPx) { w *= p.maxPx / h; h = p.maxPx; }
    const y = pr.y - (p.liftM ?? 0) * pr.pxPerM;
    if (pr.x < -w || pr.x > W + w || y < -h || y > H + h) { this.hide(id); return { dist, bearing }; }
    if (it.url !== p.url) { it.url = p.url; it.img.src = p.url; }
    it.img.style.width = `${w}px`;
    it.img.style.height = `${h}px`;
    it.img.style.transform = `translate3d(${pr.x - w / 2}px, ${y - h}px, 0)`;
    it.img.style.opacity = String(p.opacity ?? 1);
    it.img.style.zIndex = String(Math.max(1, Math.round(5000 - dist)));
    if (!it.shown) { it.img.style.display = "block"; it.shown = true; }
    if (p.label) {
      it.tag.textContent = p.label;
      it.tag.style.transform = `translate3d(${pr.x}px, ${y - h - 4}px, 0) translate(-50%, -100%)`;
      it.tag.style.zIndex = String(Math.max(1, Math.round(5000 - dist)) + 1);
      it.tag.style.display = "block";
    } else it.tag.style.display = "none";
    return { dist, bearing };
  }

  hide(id: string) {
    const it = this.items.get(id);
    if (!it || !it.shown) return;
    it.img.style.display = "none";
    it.tag.style.display = "none";
    it.shown = false;
  }

  remove(id: string) {
    const it = this.items.get(id);
    if (!it) return;
    it.img.remove(); it.tag.remove();
    this.items.delete(id);
  }

  destroy() {
    for (const id of [...this.items.keys()]) this.remove(id);
    this.overlay.setMap(null);
  }
}
