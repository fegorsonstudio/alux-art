const TOKEN = process.env.VERCEL_TOKEN;

if (!TOKEN) {
  console.error("VERCEL_TOKEN is required. Run with your environment loaded, e.g. `node --env-file=.env.local scripts/vercel-setup.mjs`.");
  process.exit(1);
}

// Read .env.local
import { readFileSync } from "fs";
import { resolve } from "path";

const envFile = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
const envVars = {};
for (const line of envFile.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  const value = trimmed.slice(eq + 1).trim();
  if (key && value) envVars[key] = value;
}

console.log(`Found ${Object.keys(envVars).length} env vars to set\n`);

// Get/create Vercel project
async function api(path, method = "GET", body = null) {
  const res = await fetch(`https://api.vercel.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok && res.status !== 409) {
    throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(data)}`);
  }
  return { ok: res.ok, status: res.status, data };
}

// Get current user to find team/scope
const { data: user } = await api("/v2/user");
const username = user.user?.username;
console.log(`✓ Logged in as: ${username}`);

// Check if project already exists
let projectId;
const { data: existing, status: checkStatus } = await api(`/v9/projects/virtual-photo-studio`).catch(() => ({ data: {}, status: 404 }));
if (checkStatus === 200 && existing.id) {
  projectId = existing.id;
  console.log(`✓ Project found: ${existing.name} (${projectId})`);
} else {
  // Create project
  const { data: created } = await api("/v10/projects", "POST", {
    name: "virtual-photo-studio",
    framework: "nextjs",
  });
  projectId = created.id;
  console.log(`✓ Project created: virtual-photo-studio (${projectId})`);
}

// Set all env vars (targets: production, preview, development)
const targets = ["production", "preview", "development"];
let set = 0;
for (const [key, value] of Object.entries(envVars)) {
  try {
    // Delete existing first to avoid conflicts
    await api(`/v9/projects/${projectId}/env?key=${encodeURIComponent(key)}`, "DELETE").catch(() => {});

    await api(`/v10/projects/${projectId}/env`, "POST", {
      key,
      value,
      type: key.startsWith("NEXT_PUBLIC_") ? "plain" : "encrypted",
      target: targets,
    });
    set++;
  } catch (e) {
    console.warn(`  ⚠ ${key}: ${e.message}`);
  }
}
console.log(`✓ Set ${set} environment variables`);

// Output project details for CLI deploy
console.log(`\nProject ID: ${projectId}`);
console.log(`Ready to deploy.\n`);

// Write .vercel/project.json so CLI knows the project
import { mkdirSync, writeFileSync } from "fs";
mkdirSync(".vercel", { recursive: true });
writeFileSync(".vercel/project.json", JSON.stringify({ projectId, orgId: user.user?.id }, null, 2));
console.log("✓ .vercel/project.json written");
