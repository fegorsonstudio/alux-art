import "server-only";
import crypto from "node:crypto";
import sharp from "sharp";
import sql from "@/lib/db";
import { r2Download, r2Upload, r2Delete, r2ProxyUrl } from "@/lib/r2";
import { tellAdmin, sendAdminImage } from "@/lib/telegram";
import { SITE_URL } from "@/lib/site-url";
import { arMapsUrl, arPreviewUrl, arPublicUrl } from "@/lib/ar/campaign";

/**
 * Turns a paid `ar_experience` shoot into a live campaign.
 *
 * Called from the generation worker in place of the photo pipeline (see the
 * fork in lib/generate.ts): no identity analysis, no planner, no fal call, no
 * shoot_images rows. The buyer's logo is copied out of identity-images — which
 * the 48-hour purge empties — into template-images, which is never swept and
 * is served login-free by /api/media, so the phone page can draw it onto the
 * balloons for as long as the campaign runs.
 *
 * Idempotent: a retried start finds the existing row and only re-marks the
 * shoot complete. Never throws; a failure marks the shoot FAILED with a plain
 * reason, exactly as the loop product does.
 */

export type ArBooking = {
  kind: "ar_experience";
  brandName: string;
  tagline: string;
  logoPath: string;
  logoBucket: string;
  colors: [string, string];
  lat: number;
  lng: number;
  radiusM: number;
  /** YYYY-MM-DD, Lagos midnight. */
  startsAt: string;
};

type WorkerResult = { done: true; completed: number; failed: number; remaining: 0; total: 1 };

const HEX = /^#[0-9a-f]{6}$/;
const DAY_MS = 86_400_000;

const token = () => crypto.randomUUID().replace(/-/g, "");

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function readBooking(enhance: Record<string, unknown> | null): ArBooking {
  const e = (enhance ?? {}) as Partial<ArBooking>;
  if (e.kind !== "ar_experience") throw new Error("This order is not an AR campaign");
  const brandName = String(e.brandName ?? "").trim();
  if (!brandName || brandName.length > 40) throw new Error("Brand name missing");
  const logoPath = String(e.logoPath ?? "");
  if (!logoPath) throw new Error("Logo missing");
  const colors = Array.isArray(e.colors) ? e.colors.map((c) => String(c).toLowerCase()) : [];
  if (colors.length !== 2 || !colors.every((c) => HEX.test(c))) throw new Error("Colours missing");
  const lat = Number(e.lat), lng = Number(e.lng), radiusM = Math.round(Number(e.radiusM));
  if (!(lat >= -90 && lat <= 90) || !(lng >= -180 && lng <= 180)) throw new Error("Location missing");
  if (!(radiusM >= 100 && radiusM <= 1000)) throw new Error("Radius out of range");
  const startsAt = String(e.startsAt ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startsAt)) throw new Error("Start date missing");
  return {
    kind: "ar_experience", brandName,
    tagline: String(e.tagline ?? "").trim().slice(0, 60),
    logoPath, logoBucket: String(e.logoBucket ?? "identity-images"),
    colors: [colors[0], colors[1]], lat, lng, radiusM, startsAt,
  };
}

async function campaignDays(): Promise<number> {
  const [row] = await sql<{ value: string }[]>`SELECT value FROM app_config WHERE key = 'ar_campaign_days'`;
  const n = parseInt(row?.value ?? "", 10);
  return n >= 1 && n <= 3650 ? n : 30;
}

export async function fulfilArCampaign(
  shootId: string,
  userId: string,
  enhance: Record<string, unknown> | null,
): Promise<WorkerResult> {
  const tag = `[ar] ${shootId.slice(0, 8)}`;
  try {
    const booking = readBooking(enhance);

    let [row] = await sql<{ id: string; token: string; preview_token: string; logo_path: string; starts_at: Date; ends_at: Date }[]>`
      SELECT id, token, preview_token, logo_path, starts_at, ends_at FROM ar_campaigns WHERE shoot_id = ${shootId}`;

    let fresh = false;
    if (!row) {
      const days = await campaignDays();
      const campaignId = crypto.randomUUID();
      const logoPath = `ar/${campaignId}/logo.png`;

      // PNG, at most 1024px, alpha kept, EXIF dropped (sharp strips metadata
      // unless asked to keep it). A JPEG logo simply becomes an opaque PNG.
      const { buffer } = await r2Download(booking.logoBucket, booking.logoPath);
      const png = await sharp(buffer).rotate()
        .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
        .png().toBuffer();
      await r2Upload("template-images", logoPath, png, "image/png");

      const startsAt = new Date(`${booking.startsAt}T00:00:00+01:00`);
      const endsAt = new Date(startsAt.getTime() + days * DAY_MS);

      await sql`
        INSERT INTO ar_campaigns
          (id, shoot_id, user_id, token, preview_token, status, brand_name, tagline,
           logo_bucket, logo_path, color_primary, color_secondary, lat, lng, radius_m,
           starts_at, ends_at)
        VALUES
          (${campaignId}, ${shootId}, ${userId}, ${token()}, ${token()}, 'active',
           ${booking.brandName}, ${booking.tagline}, 'template-images', ${logoPath},
           ${booking.colors[0]}, ${booking.colors[1]}, ${booking.lat}, ${booking.lng},
           ${booking.radiusM}, ${startsAt}, ${endsAt})
        ON CONFLICT (shoot_id) DO NOTHING`;
      [row] = await sql`SELECT id, token, preview_token, logo_path, starts_at, ends_at FROM ar_campaigns WHERE shoot_id = ${shootId}`;
      if (!row) throw new Error("Campaign row did not save");
      if (row.id !== campaignId) {
        // Two starts raced; the other one's row won. Drop the copy nobody points at.
        await r2Delete("template-images", [logoPath]).catch(() => undefined);
      } else {
        fresh = true;
      }
    }

    await sql`UPDATE shoots SET status = 'COMPLETE', progress = 100,
        pipeline_stage = 'AR campaign ready', completed_at = NOW(), updated_at = NOW()
      WHERE id = ${shootId}`;

    if (fresh) {
      const [owner] = await sql<{ owner_email: string | null }[]>`SELECT owner_email FROM shoots WHERE id = ${shootId}`;
      const fmt = (d: Date) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });
      const text =
        `🎈 <b>New AR balloon campaign</b>\n` +
        `<b>${esc(booking.brandName)}</b>${booking.tagline ? ` — ${esc(booking.tagline)}` : ""}\n` +
        `Buyer: ${esc(owner?.owner_email ?? "unknown")}\n` +
        `Where: ${arMapsUrl(booking.lat, booking.lng)} (${booking.radiusM} m)\n` +
        `Runs: ${fmt(row.starts_at)} – ${fmt(row.ends_at)}\n` +
        `Public: ${arPublicUrl(row.token)}\n` +
        `Preview anywhere: ${arPreviewUrl(row.token, row.preview_token)}\n` +
        `Admin: ${SITE_URL}/admin/ar`;
      await tellAdmin(text);
      await sendAdminImage(`${SITE_URL}${r2ProxyUrl("template-images", row.logo_path)}`, `${esc(booking.brandName)} logo`, "logo.png");
    }

    console.log(`${tag} campaign ready${fresh ? "" : " (already existed)"}`);
    return { done: true, completed: 1, failed: 0, remaining: 0, total: 1 };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`${tag} failed: ${msg}`);
    await sql`UPDATE shoots SET status = 'FAILED',
        pipeline_stage = ${`AR campaign failed: ${msg}`.slice(0, 200)}, updated_at = NOW()
      WHERE id = ${shootId}`.catch(() => undefined);
    return { done: true, completed: 0, failed: 1, remaining: 0, total: 1 };
  }
}
