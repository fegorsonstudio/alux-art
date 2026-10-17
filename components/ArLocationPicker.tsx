"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Where the balloons appear: a map with one draggable pin and the circle
 * people have to stand inside. OpenStreetMap tiles (the site's CSP already
 * allows images from any https host), bundled Leaflet, no API key.
 *
 * A circle marker rather than Leaflet's default pin: the default pin is an
 * image whose path the bundler rewrites, and it comes out broken.
 *
 * Loaded with next/dynamic and ssr:false — Leaflet needs `window`.
 */
export default function ArLocationPicker(props: {
  value: { lat: number; lng: number } | null;
  radiusM: number;
  onChange: (v: { lat: number; lng: number }) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const pin = useRef<L.CircleMarker | null>(null);
  const ring = useRef<L.Circle | null>(null);
  const onChange = useRef(props.onChange);
  onChange.current = props.onChange;

  useEffect(() => {
    if (!box.current || map.current) return;
    const start: L.LatLngExpression = props.value ? [props.value.lat, props.value.lng] : [6.5244, 3.3792];
    const m = L.map(box.current, { center: start, zoom: 15, zoomControl: true, attributionControl: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    const style = { color: "#2f8e9a", fillColor: "#55cdbc", fillOpacity: 0.9, weight: 3 };
    const p = L.circleMarker(start, { ...style, radius: 10, bubblingMouseEvents: false }).addTo(m);
    const r = L.circle(start, { radius: props.radiusM, color: "#2f8e9a", fillColor: "#2f8e9a", fillOpacity: 0.12, weight: 2 }).addTo(m);
    const place = (ll: L.LatLng) => {
      p.setLatLng(ll); r.setLatLng(ll);
      onChange.current({ lat: Number(ll.lat.toFixed(6)), lng: Number(ll.lng.toFixed(6)) });
    };
    m.on("click", (e: L.LeafletMouseEvent) => place(e.latlng));
    // Drag the pin: Leaflet's circle markers do not drag by themselves.
    let dragging = false;
    p.on("mousedown", () => { dragging = true; m.dragging.disable(); });
    m.on("mousemove", (e: L.LeafletMouseEvent) => { if (dragging) { p.setLatLng(e.latlng); r.setLatLng(e.latlng); } });
    m.on("mouseup", (e: L.LeafletMouseEvent) => { if (dragging) { dragging = false; m.dragging.enable(); place(e.latlng); } });
    map.current = m; pin.current = p; ring.current = r;
    if (props.value) onChange.current(props.value);
    // Inside a panel that was hidden when the map was made, sizes are wrong until told.
    setTimeout(() => m.invalidateSize(), 50);
    return () => { m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { ring.current?.setRadius(props.radiusM); }, [props.radiusM]);

  useEffect(() => {
    if (!props.value || !pin.current || !ring.current || !map.current) return;
    const ll = L.latLng(props.value.lat, props.value.lng);
    if (pin.current.getLatLng().equals(ll, 1e-7)) return;
    pin.current.setLatLng(ll); ring.current.setLatLng(ll);
    map.current.panTo(ll);
  }, [props.value]);

  return <div ref={box} style={{ height: 260, borderRadius: 10, overflow: "hidden", border: "1px solid rgba(127,127,127,0.25)" }} />;
}
