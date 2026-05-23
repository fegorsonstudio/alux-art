#!/bin/bash
# Run from /var/www/aluxart as the aluxart user (or root)
# Usage: bash deploy/deploy.sh

set -e

APP_DIR="/var/www/aluxart"
cd "$APP_DIR"

echo "=== Deploying Alux Art ==="

# Pull latest code
git pull origin main

# Install dependencies
npm ci --production=false

# Build Next.js
npm run build

# Start or reload with PM2
if pm2 list | grep -q "aluxart"; then
  pm2 reload aluxart --update-env
else
  pm2 start npm --name "aluxart" -- start
  pm2 save
  pm2 startup systemd -u aluxart --hp /home/aluxart | tail -1 | bash || true
fi

echo "=== Deploy complete ==="
pm2 status aluxart
