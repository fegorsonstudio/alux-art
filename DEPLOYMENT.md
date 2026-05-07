# Alux Art Production Deployment

Use two Railway/Fly/Render services from the same repository.

## Web Service

Purpose: serve the app, API, Paystack webhook, and health checks.

Environment:

```text
NODE_ENV=production
ALUX_PROCESS_ROLE=web
```

Start command:

```text
node server.js
```

Health check:

```text
/api/health
```

## Worker Service

Purpose: poll Supabase for `QUEUED` shoots, generate images, upload files, and package ZIPs.

Environment:

```text
NODE_ENV=production
ALUX_PROCESS_ROLE=worker
```

Start command:

```text
node server.js
```

Do not attach a public domain to the worker service.

## Required Environment Variables

Set the same production secrets on both services:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
GEMINI_API_KEY
PAYSTACK_SECRET_KEY
PAYSTACK_PUBLIC_KEY
ADMIN_EMAIL
```

Optional Gemini tuning:

```text
GEMINI_IMAGE_SIZE=2K
REFERENCE_IMAGE_LIMIT=6
```

## Why Two Services

Image generation and ZIP packaging can block the Node event loop. Keeping the web process separate prevents Railway `502 Application failed to respond` errors while the worker is busy.
