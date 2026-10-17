import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import crypto from "node:crypto";
import { resolveArCampaign, derivedStatus, arLogoUrl } from "@/lib/ar/campaign";
import { getDictionary } from "@/lib/dictionaries";
import { resolveLocale, dirFor, LOCALE_COOKIE } from "@/lib/i18n";
import ArViewer, { type ArGate, type ArCampaignPublic } from "./ArViewer";

/**
 * The AR balloon page a campaign's link and QR code open (/d/ar/<token>).
 *
 * Under /d/ so middleware never sends a passer-by, who has no account, to the
 * login page. The token names one campaign; `?p=<preview token>` lets the
 * buyer and the owner see the balloons anywhere, without the location check.
 * Only the public half of the row reaches the browser.
 */

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Balloons in the sky — Alux Art",
  robots: { index: false, follow: false },
};

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export default async function ArPage({ params, searchParams }: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ p?: string; debug?: string }>;
}) {
  const { token } = await params;
  const { p, debug } = await searchParams;
  const row = await resolveArCampaign(token);

  // /d/ pages never get the locale cookie seeded by middleware, so read the
  // browser's own preference as well.
  const cookieVal = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = resolveLocale(cookieVal, (await headers()).get("accept-language"));
  const dict = await getDictionary(locale);

  let gate: ArGate = "notFound";
  let preview = false;
  let campaign: ArCampaignPublic | null = null;
  if (row) {
    preview = typeof p === "string" && p.length > 0 && safeEqual(p, row.preview_token);
    const status = derivedStatus(row);
    gate = status === "live" ? "ok"
      : status === "scheduled" ? "notStarted"
      : status === "ended" ? "ended"
      : "suspended";
    campaign = {
      brand: row.brand_name,
      tagline: row.tagline,
      logoUrl: `${arLogoUrl(row)}&width=800&format=webp`,
      colors: [row.color_primary, row.color_secondary],
      lat: row.lat,
      lng: row.lng,
      radiusM: row.radius_m,
      startsAt: new Date(row.starts_at).toISOString(),
      balloonCount: row.balloon_count,
    };
  }

  return (
    <ArViewer
      token={token}
      gate={gate}
      preview={preview}
      campaign={campaign}
      strings={dict.arViewer}
      themeLabels={{ light: dict.common.light, dark: dict.common.dark }}
      dir={dirFor(locale)}
      locale={locale}
      debug={debug === "1"}
    />
  );
}
