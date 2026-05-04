# Alux Art

AI photoshoot orchestration platform built from the PRD in `alux-art-ai-photoshoot-orchestration-platform-6b6fac91.md`.

This local build is a self-contained full-stack implementation with no external dependencies. It uses:

- Native Node.js HTTP server
- File-backed JSON persistence in `data/db.json`
- Local generated image storage in `storage/`
- SPA frontend in `public/`
- Simulated Google OAuth, Paystack, AI generation, 4K upscaling, R2 signed URLs, and queue workers
- Real OpenAI image generation when `OPENAI_API_KEY` is set
- Real Server-Sent Events for gallery progress
- Generated exact-dimension 4K PNG artifacts and ZIP packaging

## Run

```powershell
npm run dev
```

Open:

```text
http://localhost:3000
```

Admin login email:

```text
fegorsonphotography@gmail.com
```

## OpenAI Image Generation

The app uses real OpenAI image generation when this environment variable is set in the same PowerShell window that starts the server:

```powershell
$env:OPENAI_API_KEY="your_new_private_key_here"
npm run dev
```

Optional settings:

```powershell
$env:OPENAI_IMAGE_MODEL="openai/gpt-5.4-image-2"
$env:OPENAI_IMAGE_QUALITY="low"
```

Default model routing:

```text
Primary: openai/gpt-5.4-image-2
Secondary: google/gemini-3.1-flash-image-preview
```

The local direct OpenAI caller sends OpenAI-prefixed model IDs to OpenAI after removing the `openai/` prefix. Google-prefixed model IDs are stored for routing/admin configuration, but need a Google provider adapter before they can generate images directly.

Set this to force local mock generation:

```powershell
$env:OPENAI_IMAGE_GENERATION="mock"
```

Privacy note: this first real OpenAI integration sends only generated text prompts to OpenAI. It does not send uploaded identity or inspiration images yet. Reference-image sending should be added with an explicit user consent step.

## Implemented Flows

- Google-only sign-in simulation
- Admin-only route at `#admin`
- Fast and Advanced shoot modes
- Identity upload requirement: minimum 3 images
- Saved identity upload library per user
- Reuse or remove previous identity uploads
- Inspiration upload requirement: minimum 1 image
- Tagged Advanced references: outfit, hairstyle, makeup, background, lighting, accessory, color grade
- AI quote generation simulation and custom quote editing
- NGN/USD pricing and user currency toggle
- Admin payment bypass and user Paystack simulation
- Queue-style generation with SSE progress
- 10 output slots per shoot
- Slot distribution: 8 identity portraits, 1 mood image, 1 quote graphic
- Exact 4K target dimensions per aspect ratio
- Server-side generated Web/SVG previews for gallery speed
- Full 4K PNG download files
- ZIP download package generated after shoot completion
- Quote-specific Instagram 1080 download
- Download logs
- OpenAI image provider with local fallback
- Admin pricing control
- Admin model slot selection
- Admin user ban/unban controls
- Admin shoot monitoring, storage, revenue, download, and upscaling metrics

## API Surface

- `POST /api/auth/google`
- `POST /api/logout`
- `GET /api/me`
- `PATCH /api/me/preferences`
- `GET /api/config`
- `GET /api/pricing`
- `GET /api/identity-library`
- `POST /api/identity-library`
- `DELETE /api/identity-library/:imageId`
- `POST /api/shoots`
- `GET /api/shoots/:shootId`
- `POST /api/shoots/:shootId/pay`
- `GET /api/shoots/:shootId/events`
- `GET /api/shoots/:shootId/images/:imageId?download=1`
- `GET /api/shoots/:shootId/download-zip`
- `GET /api/shoots/:shootId/quote-instagram-download`
- `GET /api/admin/overview`
- `PATCH /api/admin/pricing`
- `PATCH /api/admin/model-slots`
- `PATCH /api/admin/users`

## Production Swap Points

The app is intentionally structured around provider boundaries. Replace the local simulations with production services in these areas:

- Google OAuth: replace `/api/auth/google` simulation with NextAuth or OAuth callback validation.
- Paystack: replace `/api/shoots/:shootId/pay` simulation with initialize + webhook verification.
- Queue: replace in-process worker timers with BullMQ and Redis.
- Storage: replace local `storage/` writes with Cloudflare R2 signed PUT/GET URLs.
- AI: replace generated PNG placeholders with vision analysis, prompt engineering, image providers, Real-ESRGAN, and Sharp compositing.
- Database: replace `data/db.json` with Supabase Postgres and RLS policies.
