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
node "$APP_DIR/scripts/migrate.mjs"

echo "=== Reloading PM2 ==="
pm2 reload aluxart

echo "Done. $(pm2 show aluxart | grep status)"
