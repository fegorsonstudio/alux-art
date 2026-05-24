#!/bin/bash
# Alux Art VPS setup script
# Run as root on a fresh Ubuntu 22.04 / 24.04 server
# Usage: bash setup-vps.sh
set -euo pipefail

APP_USER="aluxart"
APP_DIR="/home/$APP_USER/app"
DOMAIN="aluxartandframes.shop"
DB_NAME="aluxart"
DB_USER="aluxart"
DB_PASS="aluxart_db_2026"
NODE_VERSION="20"
APP_PORT="3000"

echo "=== 1. System packages ==="
apt-get update -y
apt-get install -y curl git build-essential nginx certbot python3-certbot-nginx postgresql postgresql-contrib ufw

echo "=== 2. Node.js $NODE_VERSION ==="
curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
apt-get install -y nodejs

echo "=== 3. PM2 ==="
npm install -g pm2

echo "=== 4. App user ==="
id "$APP_USER" &>/dev/null || useradd -m -s /bin/bash "$APP_USER"

echo "=== 5. PostgreSQL ==="
systemctl enable postgresql
systemctl start postgresql

# Create DB and user (idempotent)
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

echo "=== 6. Firewall ==="
ufw allow ssh
ufw allow 'Nginx Full'
ufw --force enable

echo "=== 7. Clone / update repo ==="
if [ -d "$APP_DIR/.git" ]; then
  echo "Repo already cloned — pulling latest"
  sudo -u "$APP_USER" git -C "$APP_DIR" pull
else
  sudo -u "$APP_USER" git clone https://github.com/fegorsonstudio/alux-art.git "$APP_DIR"
fi

echo ""
echo "=== 8. .env file ==="
echo "IMPORTANT: copy your .env.local to $APP_DIR/.env.local then run:"
echo "  bash $APP_DIR/scripts/setup-vps.sh --deploy"
echo ""
echo "  Required overrides in .env.local on VPS:"
echo "    DATABASE_URL=postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME"
echo "    NEXT_PUBLIC_SUPABASE_URL=<same as dev>"
echo "    SUPABASE_SERVICE_ROLE_KEY=<same as dev>"
echo "    (all other vars same as dev .env.local)"
echo ""

if [[ "${1:-}" != "--deploy" ]]; then
  echo "Setup step 1 complete. Copy .env.local, then re-run: bash setup-vps.sh --deploy"
  exit 0
fi

echo "=== 9. Install deps + build ==="
sudo -u "$APP_USER" bash -c "cd $APP_DIR && npm ci"
sudo -u "$APP_USER" bash -c "cd $APP_DIR && npm run build"

echo "=== 10. Run DB migrations ==="
sudo -u "$APP_USER" bash -c "cd $APP_DIR && node scripts/migrate.mjs"

echo "=== 11. PM2 process ==="
sudo -u "$APP_USER" bash -c "
  cd $APP_DIR
  pm2 delete aluxart 2>/dev/null || true
  pm2 start npm --name aluxart -- start
  pm2 save
"
pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" | tail -1 | bash || true

echo "=== 12. Nginx ==="
cat > /etc/nginx/sites-available/aluxart <<NGINXCONF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    # Increase proxy timeouts for long-running generation requests
    proxy_read_timeout 310s;
    proxy_send_timeout 310s;
    proxy_connect_timeout 10s;

    location /api/shoots {
        # SSE endpoint needs buffering off
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection '';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 310s;
    }

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINXCONF

ln -sf /etc/nginx/sites-available/aluxart /etc/nginx/sites-enabled/aluxart
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "=== 13. SSL (Let's Encrypt) ==="
certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos -m fegorsonphotography@gmail.com

echo "=== 14. Cleanup cron ==="
(crontab -u "$APP_USER" -l 2>/dev/null; echo "0 * * * * curl -sf -H 'Authorization: Bearer aluxart-internal-2025' https://$DOMAIN/api/cron/cleanup-expired >> /tmp/cleanup.log 2>&1") \
  | sort -u | crontab -u "$APP_USER" -

echo ""
echo "=== DONE ==="
echo "App: https://$DOMAIN"
echo "PM2 status: sudo -u $APP_USER pm2 list"
echo "Logs: sudo -u $APP_USER pm2 logs aluxart"
echo ""
echo "Next step: migrate data from Supabase"
echo "  cd $APP_DIR && node scripts/migrate-db-to-vps.mjs"
