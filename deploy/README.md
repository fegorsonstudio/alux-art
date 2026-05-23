# Hetzner VPS Deployment Guide

## Step 1 — Order the server on Hetzner

1. Go to https://console.hetzner.com
2. Create a project called "Alux Art"
3. Add Server:
   - Location: **Nuremberg** or **Helsinki**
   - Image: **Ubuntu 24.04 LTS**
   - Type: Shared → **CX22** (2 vCPU, 4 GB, 40 GB, €4.49/mo)
   - Add your SSH public key
   - Name: `aluxart-prod`
4. Note the server IP (shown after creation)

## Step 2 — Point your DNS to the new server

In Cloudflare (or wherever aluxartandframes.shop is managed):
- Add/update A record: `aluxartandframes.shop` → `<SERVER_IP>`
- Add/update A record: `www.aluxartandframes.shop` → `<SERVER_IP>`
- Set TTL to 60 for fast propagation

Do this BEFORE running the app — Certbot needs DNS to resolve for SSL.

## Step 3 — Run the base setup (once, as root)

```bash
ssh root@<SERVER_IP>
curl -fsSL https://raw.githubusercontent.com/fegorsonstudio/alux-art/main/deploy/setup-vps.sh | bash
```

Or copy the file manually:
```bash
scp deploy/setup-vps.sh root@<SERVER_IP>:/root/
ssh root@<SERVER_IP> bash /root/setup-vps.sh
```

## Step 4 — Deploy the app

```bash
ssh root@<SERVER_IP>

# Clone the repo
cd /var/www/aluxart
git clone https://github.com/fegorsonstudio/alux-art.git .

# Add environment variables
nano .env.local
# Paste ALL your current .env.local contents here

# Install Nginx config
cp deploy/nginx.conf /etc/nginx/sites-available/aluxart
ln -s /etc/nginx/sites-available/aluxart /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# Get SSL certificate (DNS must already be pointing to this IP)
certbot --nginx -d aluxartandframes.shop -d www.aluxartandframes.shop

# Build and start the app
bash deploy/deploy.sh
```

## Step 5 — Add the cron job

```bash
crontab -e
# Paste the line from deploy/crontab.txt
# Replace YOUR_CRON_SECRET with your actual CRON_SECRET env var value
```

## Step 6 — Verify

```bash
pm2 status          # should show aluxart as online
curl -I https://aluxartandframes.shop   # should return HTTP 200
```

Open the site in browser, log in, confirm everything works.

## Ongoing deploys

Every time you push to main:
```bash
ssh root@<SERVER_IP>
cd /var/www/aluxart
bash deploy/deploy.sh
```

Or set up GitHub Actions (see below for auto-deploy on push).

## Auto-deploy with GitHub Actions (optional)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Hetzner

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: root
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /var/www/aluxart
            bash deploy/deploy.sh
```

Add secrets in GitHub repo settings:
- `VPS_HOST` = your server IP
- `VPS_SSH_KEY` = your private SSH key (the one matching what you put on Hetzner)

## Costs

| Service | Cost |
|---------|------|
| Hetzner CX22 | €4.49/mo |
| Cloudflare R2 (when migrated) | $0.015/GB |
| Supabase (stays for now) | Free tier |
| **Total** | **~€4.50/mo** vs Vercel's hobby tier |

## Rollback

If something goes wrong, just re-point the Cloudflare DNS A record back to Vercel's IP while you fix it. Vercel deployment is still live until you delete it.
