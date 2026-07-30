# media.aluxartandframes.shop — buyer download hostname

Serves 4K images and shoot ZIPs from **our own domain** instead of
`*.r2.cloudflarestorage.com`, without giving up Cloudflare's edge speed and
without making the buckets public.

## Why it is built this way

Measured on one real 18MB image (2026-07-28):

| Route | Speed | Time |
|---|---|---|
| server → R2 | 24 MB/s | 0.7s |
| buyer → R2 direct | 529 KB/s | 33s |
| buyer → our domain, proxied through the app | 47 KB/s | 6.5 min |
| buyer → VPS, Cloudflare bypassed | 20 KB/s | ~15 min |

The VPS is a slow path for our buyers, so **files must not be proxied through the
app** — that was tried in `d1f5d07` and reverted in `213b11c`. This Worker keeps
edge delivery (buckets are bound straight to it) while the URL reads as ours.

The buckets stay **private**. Every request must carry an HMAC signature over
(bucket, path, expiry) that only the app can mint, so links cannot be forged and
stop working after an hour — the same protection the old signed R2 links gave.

## Deploying (one time)

From `workers/media/`:

```bash
npx wrangler login                       # opens the browser; click Allow
npx wrangler secret put MEDIA_SIGNING_SECRET   # paste the value generated below
npx wrangler deploy
```

Generate the shared secret once:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Then put **the same value** on the VPS in `/home/aluxart/app/.env.local`:

```
MEDIA_DOMAIN=media.aluxartandframes.shop
MEDIA_SIGNING_SECRET=<the same secret>
```

and restart: `pm2 restart aluxart --update-env`.

`custom_domain = true` in `wrangler.toml` makes Cloudflare create the DNS record
and certificate on deploy, so there is nothing to click in the dashboard.

## Turning it on and off

The app reads `MEDIA_DOMAIN` and `MEDIA_SIGNING_SECRET` at request time
(`lib/media-url.ts`). With either one missing it falls back to the existing signed
R2 URL, so:

- **before deploy** — downloads behave exactly as they do today
- **to roll back** — remove the two variables and restart; no code change needed

## Verifying after deploy

```bash
# Should be 403 — no signature.
curl -s -o /dev/null -w '%{http_code}\n' https://media.aluxartandframes.shop/generated-4k/any/path.png
```

Then download an image from the app and confirm: the URL is on
`media.aluxartandframes.shop`, the file is the full size, and it arrives in about
30 seconds rather than minutes.
