#!/usr/bin/env bash
set -euo pipefail

# Usage: ./deploy.sh [branch]
BRANCH=${1:-main}
REPO_DIR="/home/aluxart/app"
LOGFILE="/tmp/deploy-${BRANCH}-$(date +%s).log"

echo "Deploying branch: ${BRANCH}" | tee -a "$LOGFILE"

if [ ! -d "$REPO_DIR" ]; then
  echo "Error: repo directory $REPO_DIR does not exist. Update REPO_DIR in this script." | tee -a "$LOGFILE"
  exit 1
fi

cd "$REPO_DIR"

echo "Fetching origin..." | tee -a "$LOGFILE"
git fetch origin --prune | tee -a "$LOGFILE"

echo "Checking out ${BRANCH}..." | tee -a "$LOGFILE"
git checkout "${BRANCH}" | tee -a "$LOGFILE"

echo "Pulling latest..." | tee -a "$LOGFILE"
git pull origin "${BRANCH}" | tee -a "$LOGFILE"

echo "Installing dependencies..." | tee -a "$LOGFILE"
npm ci --prefer-offline --no-audit --progress=false | tee -a "$LOGFILE"

echo "Building production assets..." | tee -a "$LOGFILE"
npm run build | tee -a "$LOGFILE"

# Restart process manager - adjust if you use a different process manager or app name
if command -v pm2 >/dev/null 2>&1; then
  echo "Reloading PM2 app aluxart..." | tee -a "$LOGFILE"
  pm2 reload aluxart | tee -a "$LOGFILE"
else
  echo "PM2 not found. Please restart your process manager manually (systemd, docker, etc)." | tee -a "$LOGFILE"
fi

# Basic health check
echo "Waiting 2s for server to warm up..." | tee -a "$LOGFILE"
sleep 2

if command -v curl >/dev/null 2>&1; then
  echo "Performing health check: GET http://localhost:3000/" | tee -a "$LOGFILE"
  curl -I --max-time 5 http://localhost:3000/ | tee -a "$LOGFILE" || true
fi

echo "Deploy finished. Log: $LOGFILE" | tee -a "$LOGFILE"
