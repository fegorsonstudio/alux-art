export const SITE_URL: string =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.SITE_URL ??
  "https://aluxartandframes.shop";

/**
 * The app calling itself (worker continuations, webhook → /start). Straight to
 * the local server, not out through Cloudflare and back: the internal secret
 * never crosses the internet, and a slot is not cut off by Cloudflare's
 * 100-second limit. Override with INTERNAL_BASE_URL if the port ever changes.
 */
export const INTERNAL_BASE_URL: string =
  process.env.INTERNAL_BASE_URL ?? `http://127.0.0.1:${process.env.PORT ?? "3000"}`;
