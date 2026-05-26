#!/usr/bin/env bash
# ─── Predikt VPS Setup Script ─────────────────────────────────────────────────
# Run once on a fresh Ubuntu 22.04 / 24.04 VPS as root or with sudo.
# Usage: bash scripts/setup-vps.sh

set -euo pipefail

echo "==> [1/7] System update"
apt-get update -y && apt-get upgrade -y

echo "==> [2/7] Install Node.js 20 LTS"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

echo "==> [3/7] Install PM2 globally"
npm install -g pm2

echo "==> [4/7] Install Redis"
apt-get install -y redis-server
# Bind to localhost only (security)
sed -i 's/^bind .*/bind 127.0.0.1 ::1/' /etc/redis/redis.conf
# Enable persistence (AOF)
sed -i 's/^appendonly no/appendonly yes/' /etc/redis/redis.conf
systemctl enable redis-server
systemctl restart redis-server
echo "    Redis status: $(redis-cli ping)"

echo "==> [5/7] Install Nginx + Certbot"
apt-get install -y nginx certbot python3-certbot-nginx

echo "==> [6/7] Create logs directory"
mkdir -p /root/predikt/logs
chmod 755 /root/predikt/logs

echo "==> [7/7] Configure PM2 startup"
pm2 startup systemd -u root --hp /root
echo ""
echo "=========================================="
echo "  VPS base setup complete."
echo "  Next steps:"
echo "  1. Upload your project: git clone https://github.com/v0dar/Predikt /root/predikt"
echo "  2. cd /root/predikt && npm install && npm run build"
echo "  3. Copy .env.example to .env and fill in all values"
echo "  4. pm2 start ecosystem.config.cjs --env production"
echo "  5. pm2 save"
echo "  6. Configure nginx.conf and run certbot"
echo "=========================================="
