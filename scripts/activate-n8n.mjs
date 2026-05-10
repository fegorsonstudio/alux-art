const N8N_URL = "https://fegorson.app.n8n.cloud";
const N8N_API_KEY = process.env.N8N_API_KEY;
const WORKFLOW_ID = "x5irbG7HZugTNh99";

if (!N8N_API_KEY) {
  console.error("N8N_API_KEY is required. Run with your environment loaded, e.g. `node --env-file=.env.local scripts/activate-n8n.mjs`.");
  process.exit(1);
}

async function api(path, method = "GET", body = null) {
  const res = await fetch(`${N8N_URL}/api/v1${path}`, {
    method,
    headers: { "X-N8N-API-KEY": N8N_API_KEY, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
}

const { ok, data } = await api(`/workflows/${WORKFLOW_ID}/activate`, "POST");
if (ok) {
  console.log(`✓ Workflow "${data.name}" is now ACTIVE`);
  console.log(`  Webhook URL: https://fegorson.app.n8n.cloud/webhook/photoshoot`);
} else {
  // Already active or other error
  const { data: wf } = await api(`/workflows/${WORKFLOW_ID}`);
  if (wf.active) {
    console.log(`✓ Workflow "${wf.name}" was already active`);
  } else {
    console.error("Failed to activate:", data);
  }
}
