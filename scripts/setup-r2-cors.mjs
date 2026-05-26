// Run once to configure CORS on all R2 buckets so browsers can fetch images directly.
// Usage: node scripts/setup-r2-cors.mjs
import { S3Client, PutBucketCorsCommand } from "@aws-sdk/client-s3";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local manually
const envPath = resolve(process.cwd(), ".env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const r2 = new S3Client({
  region: "auto",
  endpoint: env.R2_ENDPOINT,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

const siteUrl = env.NEXT_PUBLIC_SITE_URL ?? "https://aluxartandframes.shop";

const corsConfig = {
  CORSRules: [{
    AllowedOrigins: [siteUrl, "http://localhost:3000"],
    AllowedMethods: ["GET", "HEAD", "PUT"],
    AllowedHeaders: ["*"],
    MaxAgeSeconds: 3600,
  }],
};

const buckets = [
  "generated-4k",
  "identity-images",
  "inspiration-images",
  "template-images",
  "character-bases",
  "shoot-zips",
];

for (const bucket of buckets) {
  try {
    await r2.send(new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: corsConfig }));
    console.log(`✓ CORS set on ${bucket}`);
  } catch (err) {
    console.error(`✗ ${bucket}:`, err.message);
  }
}

console.log("\nDone. Browsers can now fetch images directly from R2.");
