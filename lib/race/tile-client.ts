"use client";

import type { RoadTile } from "@/lib/race/types";

/** Polls the tile route until the streets are in (the first visit asks OpenStreetMap in the background). */
export async function fetchTile(at: { lat: number; lng: number }, deadlineMs = 4 * 60_000, lite = false): Promise<RoadTile> {
  const deadline = Date.now() + deadlineMs;
  for (;;) {
    const r = await fetch(`/api/race/tiles?lat=${at.lat}&lng=${at.lng}${lite ? "&lite=1" : ""}`, { cache: "no-store" });
    const j = await r.json();
    if (r.status === 202 && j.pending) {
      if (Date.now() > deadline) throw new Error("OpenStreetMap is taking too long. Try again in a few minutes.");
      await new Promise((res) => setTimeout(res, 5000));
      continue;
    }
    if (!r.ok) throw new Error(j.error || "Could not load the streets.");
    if (!j.roads?.length) throw new Error("No roads here yet. Try a point nearer a town.");
    return j as RoadTile;
  }
}
