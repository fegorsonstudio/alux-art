# Virtual Photo Studio Factory — Project Source of Truth

## 🔄 Active AI Handoff Status
**Current Task:** Debugging identity image uploads.
**The Bug:** Images successfully load on the frontend but immediately disappear. 
**Suspected Cause:** Misconfiguration or error in the `storage_bucket` logic (check frontend upload component in `app/` and backend handling in `studio.py`).
**Agent Shift:** * Claude Code is rate-limited until May 12, 7:00 AM (WAT). 
* **Codex is currently active.** Codex should spin up a worktree, analyze the upload logic, and fix the disappearing image bug. 

---

## 🤖 AI Collaboration Protocol (Claude + Codex)
Since multiple AI agents operate on this project:
1. **Always read this file first** to get the latest status.
2. **Update the Active Status** above before ending a session or hitting a rate limit. Note exactly what is broken and where you left off.
3. **Use Git as the Bridge:** All successful fixes must be committed (e.g., `git commit -m "Codex fixed storage bucket bug"`). When the next agent takes over, they should check the latest commit history to sync up.

---

## Tech Stack

| Layer      | Technology                                          |
|------------|-----------------------------------------------------|
| Logic      | n8n (cloud: fegorson.app.n8n.cloud)                 |
| AI Engine  | Fal.ai (ComfyUI via queue API)                      |
| Frontend   | Next.js 14 App Router (TypeScript)                  |
| Payments   | Paystack                                            |
| Source     | GitHub                                              |
| Deployment | Vercel                                              |

---

## Identity Lock Rule (CRITICAL — Non-Negotiable)

For every ComfyUI / Fal.ai generation request:

- **MUST** prioritize facial features from the provided reference image
- **MUST** include an `IPAdapterFaceID` or `InstantIDModelLoader` node in every workflow JSON payload
- Maintain subject identity across ALL style, pose, lighting, and background changes
- **NEVER** alter core facial structure, eye spacing, nose shape, or jawline
- `studio.py` enforces this at runtime: it raises `ValueError` if no matching node is found

### ComfyUI Workflow JSON Convention

The injection point in any workflow template must look like this:

```json
{
  "class_type": "IPAdapterFaceID",
  "inputs": {
    "image": "<REFERENCE_IMAGE_URL>"
  }
}
studio.py searches all nodes for class_type containing "IPAdapter" or "InstantID" and replaces inputs.image with the provided reference URL. Always use one of these node types — never omit facial identity preservation.Architecture: Single-Door WebhookONE master n8n webhook URL handles all photoshoot requestsWebhook URL: stored in NEXT_PUBLIC_N8N_WEBHOOK_URL env varAll requests POST: { "type": "headshot" | "fashion" | "product" | ..., "referenceImageUrl": "...", "sessionId": "...", "payload": {} }n8n routes via a Switch node on {{ $json.body.type }}Never create separate webhooks per photoshoot typeSecurity RulesALL API keys live only in .env.local — never hardcoded, never committed.gitignore must exist before any git addServer-side keys (PAYSTACK_SECRET_KEY, FAL_KEY, N8N_API_KEY) must never reach the browserPublic keys (NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY, NEXT_PUBLIC_N8N_WEBHOOK_URL) may be client-sidelib/paystack.ts is server-side only — never import it in client componentsFile StructurePlaintextclaude apps/
├── claude.md                    <- this file
├── .env.local                   <- all secrets (gitignored)
├── .gitignore
├── studio.py                    <- Python CLI for Fal.ai ComfyUI dispatch
├── app/                         <- Next.js App Router
|   ├── layout.tsx
|   └── page.tsx
├── lib/
|   ├── n8n.ts                   <- POST to master n8n webhook (client-safe)
|   └── paystack.ts              <- Verify Paystack payments (server-side only)
├── public/
└── package.json
Python CLI (studio.py)BashUsage: python studio.py <workflow.json> <reference_image_url>
Reads a ComfyUI workflow JSON template from diskInjects the reference image URL into the IP-Adapter / InstantID nodePOSTs to https://queue.fal.run/fal-ai/comfy with Authorization: Key $FAL_KEYPolls status every 3 seconds until complete, then prints result image URL(s)Raises if no IP-Adapter/InstantID node exists (Identity Lock Rule enforcement)Environment Variables ReferenceVariableUsed BySideN8N_API_KEYn8n MCP serverServerPAYSTACK_SECRET_KEYlib/paystack.tsServerNEXT_PUBLIC_PAYSTACK_PUBLIC_KEYPaystack.js checkoutClientFAL_KEYstudio.pyServer/CLIGITHUB_PATGitHub MCP serverServerNEXT_PUBLIC_N8N_WEBHOOK_URLlib/n8n.tsClient