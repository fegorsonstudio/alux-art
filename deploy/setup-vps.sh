#!/bin/bash
# Run this once on a fresh Ubuntu 24.04 Hetzner server as root
# Usage: bash setup-vps.sh

set -e

echo "=== Alux Art VPS Setup ==="

# 1. System update
apt-get update -y && apt-get upgrade -y

# 2. Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# 3. Install PM2, Nginx, Certbot
npm install -g pm2
apt-get install -y nginx certbot python3-certbot-nginx git

# 4. Create app user (don't run the app as root)
useradd -m -s /bin/bash aluxart || true
usermod -aG sudo aluxart

# 5. Create app directory
mkdir -p /var/www/aluxart
chown aluxart:aluxart /var/www/aluxart

# 6. Firewall
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo "=== Base setup complete ==="
echo "Next: copy your repo and .env.local to /var/www/aluxart"
echo "Then run: bash deploy.sh"
