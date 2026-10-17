import type { Metadata } from "next";
import { resolveArCampaign, derivedStatus, arLogoUrl } from "@/lib/ar/campaign";
import { bountyCounts } from "@/lib/race/bounty";
import BountyRace from "./BountyRace";

/**
 * A bounty: race the real streets to a brand's balloons for a prize code
 * (/d/race/<campaign token>). Under /d/ so nobody is sent to a login page.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Bounty Run",
  robots: { index: false, follow: false },
};

export default async function BountyPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ debug?: string }> }) {
  const { token } = await params;
  const { debug } = await searchParams;
  const row = await resolveArCampaign(token);
  if (!row) return <BountyRace token={token} bounty={null} status="notFound" mapsKey="" debug={false} />;
  const counts = await bountyCounts(row.id);
  return (
    <BountyRace
      token={token}
      status={derivedStatus(row)}
      bounty={{
        brand: row.brand_name,
        tagline: row.tagline,
        logoUrl: `${arLogoUrl(row)}&width=400&format=webp`,
        colors: [row.color_primary, row.color_secondary],
        prizeLabel: row.prize_label,
        prizesLeft: counts.prizesLeft,
        prizes: counts.prizes,
        races: counts.races,
        lat: row.lat,
        lng: row.lng,
      }}
      mapsKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ""}
      debug={debug === "1"}
    />
  );
}
