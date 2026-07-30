import "server-only";

/**
 * media-url.ts — mints short-lived download links on our own hostname.
 *
 * Buyers were seeing *.r2.cloudflarestorage.com when they downloaded. Proxying
 * the file through the app hides that but is 10x slower for our buyers (measured:
 * 33s becomes 6-9 minutes on an 18MB image), so the file has to keep coming from
 * Cloudflare's edge. The Worker in workers/media serves it from our own domain
 * with the bucket still private; this module signs the pass it checks.
 *
 * DORMANT BY DEFAULT. With MEDIA_DOMAIN or MEDIA_SIGNING_SECRET unset, every
 * function here returns null and callers fall back to the existing signed R2 URL,
 * so shipping this changes nothing until both are configured.
 */

const enc = new TextEncoder();

function base64Url(bytes: ArrayBuffer): string {
  return Buffer.from(bytes).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** True when the media Worker is configured, so downloads can use our hostname. */
export function mediaDomainConfigured(): boolean {
  return Boolean(process.env.MEDIA_DOMAIN && process.env.MEDIA_SIGNING_SECRET);
}

/**
 * A signed URL on our own domain, or null when the Worker is not configured —
 * callers must fall back to r2SignedDownloadUrl in that case.
 */
export async function signedMediaUrl(
  bucket: string,
  path: string,
  opts: { filename?: string; expiresIn?: number } = {}
): Promise<string | null> {
  const domain = process.env.MEDIA_DOMAIN;
  const secret = process.env.MEDIA_SIGNING_SECRET;
  if (!domain || !secret) return null;

  const expiresIn = opts.expiresIn ?? 3600;
  const exp = Math.floor(Date.now() / 1000) + expiresIn;

  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  // Signing the bucket and path together stops a valid signature for one file
  // being replayed against another.
  const sig = base64Url(
    await crypto.subtle.sign("HMAC", key, enc.encode(`${bucket}\n${path}\n${exp}`))
  );

  const host = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const params = new URLSearchParams({ exp: String(exp), sig });
  if (opts.filename) params.set("fn", opts.filename);

  return `https://${host}/${encodeURIComponent(bucket)}/${encodedPath}?${params.toString()}`;
}
