import { readFileSync } from "fs";

const N8N_URL = "https://fegorson.app.n8n.cloud";
const N8N_API_KEY = process.env.N8N_API_KEY;

if (!N8N_API_KEY) {
  console.error("N8N_API_KEY is required. Run with your environment loaded, e.g. `node --env-file=.env.local scripts/import-n8n.mjs`.");
  process.exit(1);
}

const WORKFLOW_FILES = [
  "C:\\Users\\FUJITSU\\Documents\\Codex\\2026-05-04\\files-mentioned-by-the-user-alux\\n8n-photoshoot-pipeline.json",
  "C:\\Users\\FUJITSU\\Documents\\Codex\\2026-05-04\\files-mentioned-by-the-user-alux\\n8n-workflow-alux-art.json",
];

async function api(path, method = "GET", body = null) {
  const res = await fetch(`${N8N_URL}/api/v1${path}`, {
    method,
    headers: {
      "X-N8N-API-KEY": N8N_API_KEY,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text) };
  } catch {
    return { ok: res.ok, status: res.status, data: text };
  }
}

// Test connection
const { ok, data: me } = await api("/workflows?limit=1");
if (!ok) {
  console.error("Failed to connect to n8n:", me);
  process.exit(1);
}
console.log("✓ Connected to n8n cloud\n");

for (const filePath of WORKFLOW_FILES) {
  const name = filePath.split("\\").pop();
  try {
    const workflow = JSON.parse(readFileSync(filePath, "utf8"));

    // Check if a workflow with this name already exists
    const { data: existing } = await api(`/workflows?name=${encodeURIComponent(workflow.name)}&limit=5`);
    const found = existing?.data?.find(w => w.name === workflow.name);

    if (found) {
      console.log(`⟳ "${workflow.name}" already exists (id: ${found.id}) — skipping`);
      continue;
    }

    // Import the workflow
    const { ok: created, data: result } = await api("/workflows", "POST", {
      name: workflow.name,
      nodes: workflow.nodes ?? [],
      connections: workflow.connections ?? {},
      settings: workflow.settings ?? {},
      staticData: workflow.staticData ?? null,
    });

    if (created && result.id) {
      // Activate it
      await api(`/workflows/${result.id}/activate`, "POST");
      console.log(`✓ Imported & activated: "${result.name}" (id: ${result.id})`);
    } else {
      console.warn(`⚠ Import response for "${name}":`, JSON.stringify(result).slice(0, 200));
    }
  } catch (e) {
    console.error(`✗ Failed to import ${name}:`, e.message);
  }
}

// List all active workflows
const { data: all } = await api("/workflows?active=true&limit=20");
console.log(`\n✓ Active workflows in n8n (${all?.data?.length ?? 0}):`);
for (const w of all?.data ?? []) {
  console.log(`  • ${w.name} — id: ${w.id}`);
}

// Try to get webhook URLs
const { data: allWf } = await api("/workflows?limit=20");
console.log("\n📡 Webhook nodes found:");
for (const w of allWf?.data ?? []) {
  const nodes = w.nodes ?? [];
  const webhooks = nodes.filter(n => n.type === "n8n-nodes-base.webhook");
  for (const wh of webhooks) {
    const path = wh.parameters?.path ?? "unknown";
    console.log(`  ${w.name} → https://fegorson.app.n8n.cloud/webhook/${path}`);
  }
}
