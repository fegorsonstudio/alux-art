import type { Metadata } from "next";
import RaceGame from "./RaceGame";

/**
 * Bounty Run, stage 1: drive the real streets around a point (/d/race/demo).
 * Under /d/ so middleware never sends a player, who has no account, to the
 * login page. No bounty, no prize yet: this is where the look and the feel
 * get judged on a phone before anything is sold.
 *
 *   /d/race/demo                      choose: use my location / Lagos Island
 *   /d/race/demo?lat=6.45&lng=3.39    straight onto those streets
 *   &debug=1                           numbers overlay
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Bounty Run — drive your street",
  robots: { index: false, follow: false },
};

export default async function RaceDemoPage({ searchParams }: { searchParams: Promise<{ lat?: string; lng?: string; debug?: string }> }) {
  const { lat, lng, debug } = await searchParams;
  const la = Number(lat), ln = Number(lng);
  const start = Number.isFinite(la) && Number.isFinite(ln) && lat && lng ? { lat: la, lng: ln } : null;
  return <RaceGame start={start} debug={debug === "1"} mapsKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ""} />;
}
