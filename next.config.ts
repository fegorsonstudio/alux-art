import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Build output dir. Defaults to ".next" (runtime). Override with NEXT_DIST_DIR to
  // build into a scratch dir for zero-downtime atomic-swap deploys.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  outputFileTracingRoot: path.join(__dirname),
  allowedDevOrigins: ["172.20.10.2"],
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.r2.cloudflarestorage.com",
      },
    ],
  },
  async rewrites() {
    return [
      { source: "/llms.txt", destination: "/api/llms" },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // static.cloudflareinsights.com: Cloudflare injects its analytics
              // beacon into every page. Without it here the CSP blocked the
              // script, so Cloudflare Insights was reporting nothing at all and
              // every page logged a console error.
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://static.cloudflareinsights.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https: blob:",
              "font-src 'self' data:",
              // The beacon POSTs its measurements back to the same host.
              "connect-src 'self' https://static.cloudflareinsights.com https://cloudflareinsights.com https://www.google-analytics.com https://api.anthropic.com https://fal.run https://fal.media https://region1.google-analytics.com https://owdfoxglbxrqhgqbvkon.supabase.co wss://owdfoxglbxrqhgqbvkon.supabase.co",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
