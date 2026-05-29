#!/bin/bash
# Pull latest code and redeploy — run from VPS as the aluxart user
# Usage: bash ~/app/scripts/deploy.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Pulling latest ==="
git -C "$APP_DIR" pull

echo "=== Installing deps ==="
npm --prefix "$APP_DIR" ci

echo "=== Building ==="
npm --prefix "$APP_DIR" run build

echo "=== Running new migrations ==="
if [ -f "$APP_DIR/.env.local" ]; then
  set -a; source "$APP_DIR/.env.local"; set +a
fi
node "$APP_DIR/scripts/migrate-vps.mjs"

echo "=== Reloading PM2 ==="
pm2 reload aluxart

echo "Done. $(pm2 show aluxart | grep status)"
