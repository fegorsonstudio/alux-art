"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchTile } from "@/lib/race/tile-client";
import RaceCanvas from "@/components/race/RaceCanvas";
import type { RoadTile } from "@/lib/race/types";
import styles from "./race.module.css";

/**
 * The drive-my-street demo: pick a place, load its streets, drive. The game
 * itself is components/race/RaceCanvas, shared with the bounty hunt.
 */

type Phase = "locate" | "loading" | "ready" | "error";
const LAGOS_ISLAND = { lat: 6.4541, lng: 3.3947 };

export { fetchTile } from "@/lib/race/tile-client";

export default function RaceGame(props: { start: { lat: number; lng: number } | null; debug: boolean; mapsKey: string }) {
  const [phase, setPhase] = useState<Phase>(props.start ? "loading" : "locate");
  const [error, setError] = useState<string | null>(null);
  const [tile, setTile] = useState<RoadTile | null>(null);
  const [locating, setLocating] = useState(false);

  const load = useCallback(async (at: { lat: number; lng: number }) => {
    setPhase("loading");
    setError(null);
    try {
      setTile(await fetchTile(at));
      setPhase("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the streets.");
      setPhase("error");
    }
  }, []);

  useEffect(() => { if (props.start) load(props.start); }, [props.start, load]);

  const useMyLocation = () => {
    if (!navigator.geolocation) { setError("This browser cannot share your location."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setLocating(false); load({ lat: p.coords.latitude, lng: p.coords.longitude }); },
      () => { setLocating(false); setError("Location was refused. You can still drive Lagos Island."); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };

  return (
    <div className={styles.app} data-phase={phase} data-roads={tile?.roads.length ?? 0}>
      {phase !== "ready" && (
        <main className={styles.panelWrap}>
          <section className={styles.panel}>
            <p className={styles.kicker}>Bounty Run</p>
            <h1 className={styles.title}>Drive your street</h1>
            {phase === "loading" && <p className={styles.msg}>Preparing your streets… the first time at a new place takes up to a minute.</p>}
            {error && <p className={`${styles.msg} ${styles.error}`}>{error}</p>}
            {phase !== "loading" && (
              <>
                <button type="button" className={styles.primary} onClick={useMyLocation} disabled={locating}>{locating ? "Finding you…" : "Use my location"}</button>
                <button type="button" className={styles.quiet} onClick={() => load(LAGOS_ISLAND)}>Drive Lagos Island</button>
              </>
            )}
            <p className={styles.note}>Steer with the wheel, go and stop with the pedals, N is nitro. At a junction, hold the wheel left or right to choose the turn.</p>
          </section>
        </main>
      )}
      {phase === "ready" && tile && (
        <RaceCanvas tile={tile} start={null} finish={null} mapsKey={props.mapsKey} debug={props.debug} />
      )}
    </div>
  );
}
