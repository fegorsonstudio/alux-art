# Virtual Photo Studio Factory — Project Source of Truth

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
```

`studio.py` searches all nodes for `class_type` containing `"IPAdapter"` or `"InstantID"` and replaces `inputs.image` with the provided reference URL. Always use one of these node types — never omit facial identity preservation.

---

## Architecture: Single-Door Webhook

- **ONE** master n8n webhook URL handles all photoshoot requests
- Webhook URL: stored in `NEXT_PUBLIC_N8N_WEBHOOK_URL` env var
- All requests POST: `{ "type": "headshot" | "fashion" | "product" | ..., "referenceImageUrl": "...", "sessionId": "...", "payload": {} }`
- n8n routes via a **Switch node** on `{{ $json.body.type }}`
- **Never** create separate webhooks per photoshoot type

---

## Security Rules

- ALL API keys live **only** in `.env.local` — never hardcoded, never committed
- `.gitignore` must exist before any `git add`
- Server-side keys (`PAYSTACK_SECRET_KEY`, `FAL_KEY`, `N8N_API_KEY`) must never reach the browser
- Public keys (`NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`, `NEXT_PUBLIC_N8N_WEBHOOK_URL`) may be client-side
- `lib/paystack.ts` is server-side only — never import it in client components

---

## File Structure

```
claude apps/
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
```

---

## Python CLI (studio.py)

```
Usage: python studio.py <workflow.json> <reference_image_url>
```

- Reads a ComfyUI workflow JSON template from disk
- Injects the reference image URL into the IP-Adapter / InstantID node
- POSTs to `https://queue.fal.run/fal-ai/comfy` with `Authorization: Key $FAL_KEY`
- Polls status every 3 seconds until complete, then prints result image URL(s)
- Raises if no IP-Adapter/InstantID node exists (Identity Lock Rule enforcement)

---

## Environment Variables Reference

| Variable                          | Used By              | Side       |
|-----------------------------------|----------------------|------------|
| `N8N_API_KEY`                     | n8n MCP server       | Server     |
| `PAYSTACK_SECRET_KEY`             | lib/paystack.ts      | Server     |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | Paystack.js checkout | Client     |
| `FAL_KEY`                         | studio.py            | Server/CLI |
| `GITHUB_PAT`                      | GitHub MCP server    | Server     |
| `NEXT_PUBLIC_N8N_WEBHOOK_URL`     | lib/n8n.ts           | Client     |
