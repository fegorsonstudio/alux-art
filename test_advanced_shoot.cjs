/**
 * Advanced shoot test: uploads 7 images, creates a shoot, triggers Vercel production,
 * then polls until complete and prints all 10 slot prompts.
 *
 * Usage:  node test_advanced_shoot.cjs
 */

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

// Inline .env.local loader (dotenv not installed)
(function loadEnv() {
  const envPath = path.join(__dirname, ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) process.env[key] = val;
  }
})();

// ─── Config ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;
const SITE_URL = (process.argv[2] || process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
const OWNER_EMAIL = "fegorsonphotography@gmail.com";

// ─── Files to upload ──────────────────────────────────────────────────────────
const FILES = [
  // Identity images  → identity-images bucket
  { localPath: "C:\\Users\\FUJITSU\\Desktop\\identity images\\IMG_3467.JPG",   bucket: "identity-images", purpose: "identity", name: "IMG_3467.JPG",  contentType: "image/jpeg" },
  { localPath: "C:\\Users\\FUJITSU\\Desktop\\identity images\\IMG_4796.JPG",   bucket: "identity-images", purpose: "identity", name: "IMG_4796.JPG",  contentType: "image/jpeg" },
  { localPath: "C:\\Users\\FUJITSU\\Desktop\\identity images\\IMG_4797.JPG",   bucket: "identity-images", purpose: "identity", name: "IMG_4797.JPG",  contentType: "image/jpeg" },
  // Inspiration image → inspiration-images bucket
  { localPath: "C:\\Users\\FUJITSU\\Desktop\\inspiration\\IMG_5860.JPG",       bucket: "inspiration-images", purpose: "inspiration", name: "IMG_5860_inspiration.JPG", contentType: "image/jpeg" },
  // Tagged references → inspiration-images bucket (same bucket as inspiration)
  { localPath: "C:\\Users\\FUJITSU\\Desktop\\Outfit\\IMG_5860.JPG",            bucket: "inspiration-images", purpose: "tagged", tag: "OUTFIT",     name: "IMG_5860_outfit.JPG",    contentType: "image/jpeg" },
  { localPath: "C:\\Users\\FUJITSU\\Desktop\\Background\\aluxart-slot9-mood (2).png", bucket: "inspiration-images", purpose: "tagged", tag: "BACKGROUND", name: "aluxart_background.png", contentType: "image/png" },
  { localPath: "C:\\Users\\FUJITSU\\Desktop\\hair style\\IMG_3467.JPG",        bucket: "inspiration-images", purpose: "tagged", tag: "HAIRSTYLE",  name: "IMG_3467_hairstyle.JPG", contentType: "image/jpeg" },
];

// Quote to test the 10th slot (SVG quote card)
const QUOTE = {
  text: "She wears confidence like a second skin.",
  attribution: "— Studio Notes",
};

// Attach an existing USER_APPROVED character base to skip the base-lock flow.
// This is purely for prompt-quality testing — base-lock is a separate concern.
// Set to null to let the full base-lock flow run instead.
const SKIP_BASE_LOCK_CHARACTER_BASE_ID = "5e073a6e-c96f-48c3-8ad2-e8d2e8fece39";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
if (!SITE_URL) {
  console.error("Usage: node test_advanced_shoot.cjs <vercel-production-url>");
  console.error("  e.g. node test_advanced_shoot.cjs https://your-app.vercel.app");
  process.exit(1);
}
if (!INTERNAL_SECRET) {
  console.error("Missing INTERNAL_API_SECRET in .env.local");
  process.exit(1);
}

const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchJson(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === "https:" ? https : http;
    const reqOpts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: opts.method || "GET",
      headers: opts.headers || {},
    };
    if (opts.body) {
      reqOpts.headers["Content-Length"] = Buffer.byteLength(opts.body);
    }
    const req = mod.request(reqOpts, (res) => {
      let data = "";
      res.on("data", c => { data += c; });
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

// ─── Upload a single file directly to Supabase Storage ───────────────────────
async function uploadToStorage(file) {
  const fileBuffer = fs.readFileSync(file.localPath);
  const size = fileBuffer.length;
  const uniqueId = crypto.randomUUID();
  const storagePath = `${uniqueId}-${file.name}`;

  log(`  Uploading ${file.name} (${(size / 1024).toFixed(1)} KB) → ${file.bucket}/${storagePath}`);

  const { error } = await service.storage
    .from(file.bucket)
    .upload(storagePath, fileBuffer, { contentType: file.contentType, upsert: false });

  if (error) throw new Error(`Storage upload failed for ${file.name}: ${error.message}`);

  return { ...file, storagePath, size };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  log("=== Advanced Shoot Test ===");

  // 1. Resolve user_id from email
  log("Step 1: Resolving user ID...");
  const { data: users, error: userErr } = await service.auth.admin.listUsers();
  if (userErr) throw new Error(`listUsers failed: ${userErr.message}`);
  const user = users.users.find(u => u.email === OWNER_EMAIL);
  if (!user) throw new Error(`User not found: ${OWNER_EMAIL}`);
  const userId = user.id;
  log(`  userId: ${userId}`);

  // 2. Upload all files
  log("Step 2: Uploading files to Supabase Storage...");
  const uploaded = [];
  for (const file of FILES) {
    const result = await uploadToStorage(file);
    uploaded.push(result);
  }
  log(`  Uploaded ${uploaded.length} files.`);

  // 3. Create shoot record
  log("Step 3: Creating shoot record...");
  const shootId = crypto.randomUUID();
  const now = new Date().toISOString();
  const { error: shootErr } = await service.from("shoots").insert({
    id: shootId,
    user_id: userId,
    owner_email: OWNER_EMAIL,
    mode: "advanced",
    aspect_ratio: "4:5",
    currency: "NGN",
    status: "QUEUED",
    progress: 0,
    pipeline_stage: "Queued",
    package_size: 10,
    identity_profile: "",
    shoot_brief: "",
    quote: QUOTE,
    ...(SKIP_BASE_LOCK_CHARACTER_BASE_ID ? {
      character_base_id: SKIP_BASE_LOCK_CHARACTER_BASE_ID,
      base_lock_status: "USER_APPROVED",
    } : {}),
    created_at: now,
    updated_at: now,
  });
  if (shootErr) throw new Error(`Shoot insert failed: ${shootErr.message}`);
  log(`  Shoot created: ${shootId}`);

  // 4. Insert shoot_references
  log("Step 4: Creating shoot references...");
  const refs = uploaded.map(f => ({
    id: crypto.randomUUID(),
    shoot_id: shootId,
    user_id: userId,
    purpose: f.purpose,
    tag: f.tag ?? null,
    name: f.name,
    type: f.contentType,
    size: f.size,
    storage_bucket: f.bucket,
    storage_path: f.storagePath,
    created_at: now,
  }));
  const { error: refsErr } = await service.from("shoot_references").insert(refs);
  if (refsErr) throw new Error(`shoot_references insert failed: ${refsErr.message}`);
  log(`  Inserted ${refs.length} references.`);

  // 5. Insert shoot_images (10 slots)
  log("Step 5: Creating 10 image slots...");
  const slots = Array.from({ length: 10 }, (_, i) => ({
    id: crypto.randomUUID(),
    shoot_id: shootId,
    user_id: userId,
    slot: i + 1,
    kind: i + 1 === 10 ? "quote" : "portrait",
    status: "PENDING",
    created_at: now,
    updated_at: now,
  }));
  const { error: slotsErr } = await service.from("shoot_images").insert(slots);
  if (slotsErr) throw new Error(`shoot_images insert failed: ${slotsErr.message}`);
  log(`  Inserted 10 image slots.`);

  // 6. Trigger Vercel production start
  log(`Step 6: Triggering start on ${SITE_URL}...`);
  const startUrl = `${SITE_URL}/api/shoots/${shootId}/start`;
  const startRes = await fetchJson(startUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": INTERNAL_SECRET,
    },
    body: JSON.stringify({ resolution: "1K" }),
  });
  log(`  Start response (${startRes.status}): ${JSON.stringify(startRes.body)}`);
  if (startRes.status >= 400) {
    throw new Error(`Start failed: ${JSON.stringify(startRes.body)}`);
  }

  // 7. Poll until complete (max 15 minutes)
  log("Step 7: Polling shoot status (max 15 min)...");
  const maxAttempts = 90;
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(10_000);
    const { data: shoot, error: pollErr } = await service
      .from("shoots")
      .select("status, progress, pipeline_stage, shoot_brief")
      .eq("id", shootId)
      .single();

    if (pollErr) { log(`  Poll error: ${pollErr.message}`); continue; }

    log(`  [${i + 1}/${maxAttempts}] status=${shoot.status} progress=${shoot.progress}% stage="${shoot.pipeline_stage}"`);

    if (shoot.status === "COMPLETE" || shoot.status === "FAILED") {
      log(`\n=== Shoot finished: ${shoot.status} ===\n`);

      if (shoot.shoot_brief) {
        try {
          const brief = JSON.parse(shoot.shoot_brief);
          const prompts = brief.prompts;

          if (Array.isArray(prompts)) {
            log(`Found ${prompts.length} prompts in brief:\n`);
            for (const p of prompts) {
              const label = p.is_quote_card ? "QUOTE CARD" : `Portrait ${p.prompt_index}`;
              console.log(`\n${"═".repeat(70)}`);
              console.log(`PROMPT ${p.prompt_index} — ${label}`);
              console.log("═".repeat(70));
              if (p.fully_consolidated_prompt) {
                console.log("\nFULLY CONSOLIDATED PROMPT:");
                console.log(p.fully_consolidated_prompt);
              }
              if (p.svg_layout_instructions) {
                console.log("\nSVG LAYOUT INSTRUCTIONS:");
                console.log(p.svg_layout_instructions);
              }
              if (p.negative_prompts) {
                console.log("\nNEGATIVE PROMPTS:");
                console.log(p.negative_prompts);
              }
            }
            console.log(`\n${"═".repeat(70)}\n`);
          } else {
            log("No prompts array found in brief. Raw brief:");
            console.log(JSON.stringify(brief, null, 2));
          }

          if (brief.upload_error_warning) {
            console.log(`\n⚠ UPLOAD ERROR WARNING: ${brief.upload_error_warning}`);
          }
        } catch (e) {
          log("Could not parse shoot_brief JSON:");
          console.log(shoot.shoot_brief.slice(0, 2000));
        }
      } else {
        log("shoot_brief is empty — generation may have failed before briefing.");
      }

      // Print per-slot prompts from shoot_images table
      log("\nPer-slot prompts from shoot_images.prompt:");
      const { data: images } = await service
        .from("shoot_images")
        .select("slot, status, prompt, provider_error")
        .eq("shoot_id", shootId)
        .order("slot");
      if (images) {
        for (const img of images) {
          console.log(`\nSlot ${img.slot} (${img.status}):`);
          if (img.prompt) console.log(img.prompt.slice(0, 500));
          if (img.provider_error) console.log(`  ERROR: ${img.provider_error}`);
        }
      }

      log(`\nDone! View shoot in admin panel: ${SITE_URL}`);
      log(`Shoot ID: ${shootId}`);
      return;
    }
  }

  log("Timed out waiting for completion. Check Vercel logs.");
  log(`Shoot ID: ${shootId}`);
}

main().catch(err => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
