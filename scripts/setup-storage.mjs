import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. Run with your environment loaded, e.g. `node --env-file=.env.local scripts/setup-storage.mjs`.");
  process.exit(1);
}

const supabase = createClient(
  supabaseUrl,
  serviceRoleKey,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const BUCKETS = [
  { name: "identity-images",      public: false },
  { name: "inspiration-images",   public: false },
  { name: "custom-references",    public: false },
  { name: "generated-previews",   public: false },
  { name: "generated-4k",         public: false },
  { name: "quote-instagram",      public: false },
  { name: "shoot-zips",           public: false },
];

for (const bucket of BUCKETS) {
  const { data, error } = await supabase.storage.createBucket(bucket.name, {
    public: bucket.public,
    fileSizeLimit: 52428800, // 50MB
  });
  if (error && error.message !== "The resource already exists") {
    console.error(`✗ ${bucket.name}:`, error.message);
  } else {
    console.log(`✓ ${bucket.name}`);
  }
}
console.log("\nDone.");
