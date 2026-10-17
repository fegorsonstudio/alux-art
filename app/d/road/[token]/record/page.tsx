import type { Metadata } from "next";
import { resolveArCampaign, derivedStatus, arLogoUrl } from "@/lib/ar/campaign";
import Recorder from "./Recorder";

/**
 * Record a road for a bounty (/d/road/<campaign token>/record): the phone's
 * camera films the road while the GPS is logged; the server turns it into a
 * playable road on the hunt page. Under /d/ so nobody is sent to a login page.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Record a road",
  robots: { index: false, follow: false },
};

export default async function RecordRoadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const row = await resolveArCampaign(token);
  if (!row) return <Recorder token={token} status="notFound" brand={null} />;
  return (
    <Recorder
      token={token}
      status={derivedStatus(row)}
      brand={{ name: row.brand_name, logoUrl: `${arLogoUrl(row)}&width=400&format=webp`, colors: [row.color_primary, row.color_secondary] }}
    />
  );
}
