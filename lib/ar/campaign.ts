import "server-only";
import sql from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";
import { r2ProxyUrl } from "@/lib/r2";

/**
 * AR balloon campaigns: the rows behind /d/ar/<token>.
 *
 * A campaign is bought on the marketplace as an `ar_experience` shoot and
 * written by lib/ar/fulfil.ts. The public page, the buyer's studio block and
 * the admin list all read through here so the "is it live?" rule lives in one
 * place: `status` is only the owner's suspend switch; scheduled / live / ended
 * come from the dates.
 */

export type ArCampaignRow = {
  id: string;
  shoot_id: string;
  user_id: string;
  token: string;
  preview_token: string;
  status: "active" | "suspended";
  brand_name: string;
  tagline: string;
  logo_bucket: string;
  logo_path: string;
  color_primary: string;
  color_secondary: string;
  lat: number;
  lng: number;
  radius_m: number;
  balloon_count: number;
  /** Bounty Run: what a prize is, and how many hunts the campaign allows. */
  prize_label: string;
  max_races: number;
  starts_at: Date;
  ends_at: Date;
  created_at: Date;
  updated_at: Date;
};

export type DerivedStatus = "scheduled" | "live" | "ended" | "suspended";

/** The event names the viewer sends; anything else is dropped at the door. */
export const AR_EVENT_TYPES = ["open", "permission_denied", "outside", "activated", "photo"] as const;
export type ArEventType = (typeof AR_EVENT_TYPES)[number];

export const AR_TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

export function derivedStatus(row: Pick<ArCampaignRow, "status" | "starts_at" | "ends_at">, now = new Date()): DerivedStatus {
  if (row.status === "suspended") return "suspended";
  if (now < new Date(row.starts_at)) return "scheduled";
  if (now >= new Date(row.ends_at)) return "ended";
  return "live";
}

export const arPublicUrl = (token: string) => `${SITE_URL}/d/ar/${token}`;
export const arPreviewUrl = (token: string, previewToken: string) => `${arPublicUrl(token)}?p=${previewToken}`;
export const arMapsUrl = (lat: number, lng: number) => `https://maps.google.com/?q=${lat},${lng}`;
/** Same-origin, login-free, cache-friendly: what a WebGL texture can load. */
export const arLogoUrl = (row: Pick<ArCampaignRow, "logo_bucket" | "logo_path">) =>
  r2ProxyUrl(row.logo_bucket, row.logo_path);

export async function resolveArCampaign(token: string): Promise<ArCampaignRow | null> {
  if (!AR_TOKEN_RE.test(token)) return null;
  const [row] = await sql<ArCampaignRow[]>`SELECT * FROM ar_campaigns WHERE token = ${token}`;
  return row ?? null;
}

/** Counts of real visits (the buyer's own preview sessions are left out). */
export async function campaignCounts(campaignId: string): Promise<Record<string, number>> {
  const rows = await sql<{ type: string; n: number }[]>`
    SELECT type, count(*)::int AS n FROM ar_campaign_events
    WHERE campaign_id = ${campaignId} AND NOT is_preview GROUP BY type`;
  const out: Record<string, number> = {};
  for (const r of rows) out[r.type] = r.n;
  return out;
}

export type ArCampaignView = {
  id: string;
  shootId: string;
  brandName: string;
  tagline: string;
  status: DerivedStatus;
  suspended: boolean;
  startsAt: string;
  endsAt: string;
  lat: number;
  lng: number;
  radiusM: number;
  publicUrl: string;
  previewUrl: string;
  logoUrl: string;
  mapsUrl: string;
  counts: { opens: number; activations: number; photos: number };
  /** Bounty Run: the race link and how the prizes are going. */
  raceUrl: string;
  prizeLabel: string;
  bounty: { prizes: number; prizesLeft: number; races: number; finished: number };
};

export function viewOf(row: ArCampaignRow, counts: Record<string, number>, bounty = { prizes: 0, prizesLeft: 0, races: 0, finished: 0 }): ArCampaignView {
  return {
    raceUrl: `${SITE_URL}/d/race/${row.token}`,
    prizeLabel: row.prize_label ?? "",
    bounty,
    id: row.id,
    shootId: row.shoot_id,
    brandName: row.brand_name,
    tagline: row.tagline,
    status: derivedStatus(row),
    suspended: row.status === "suspended",
    startsAt: new Date(row.starts_at).toISOString(),
    endsAt: new Date(row.ends_at).toISOString(),
    lat: row.lat,
    lng: row.lng,
    radiusM: row.radius_m,
    publicUrl: arPublicUrl(row.token),
    previewUrl: arPreviewUrl(row.token, row.preview_token),
    logoUrl: arLogoUrl(row),
    mapsUrl: arMapsUrl(row.lat, row.lng),
    counts: {
      opens: counts.open ?? 0,
      activations: counts.activated ?? 0,
      photos: counts.photo ?? 0,
    },
  };
}

/** The buyer's own campaign (userId), or any campaign for an admin (null). */
export async function campaignForShoot(shootId: string, userId: string | null): Promise<ArCampaignView | null> {
  const rows = userId
    ? await sql<ArCampaignRow[]>`SELECT * FROM ar_campaigns WHERE shoot_id = ${shootId} AND user_id = ${userId}`
    : await sql<ArCampaignRow[]>`SELECT * FROM ar_campaigns WHERE shoot_id = ${shootId}`;
  const row = rows[0];
  if (!row) return null;
  const [counts, bounty] = await Promise.all([campaignCounts(row.id), bountyCountsOf(row.id)]);
  return viewOf(row, counts, bounty);
}

/** Prize and hunt counts, kept here so the studio and admin read them the same way. */
export async function bountyCountsOf(campaignId: string) {
  const [p] = await sql<{ n: number; left: number }[]>`
    SELECT count(*)::int AS n, count(*) FILTER (WHERE claimed_at IS NULL)::int AS left FROM race_prizes WHERE campaign_id = ${campaignId}`;
  const [r] = await sql<{ n: number; f: number }[]>`
    SELECT count(*)::int AS n, count(*) FILTER (WHERE status = 'finished')::int AS f FROM races WHERE campaign_id = ${campaignId}`;
  return { prizes: p?.n ?? 0, prizesLeft: p?.left ?? 0, races: r?.n ?? 0, finished: r?.f ?? 0 };
}
