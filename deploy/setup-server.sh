#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 server for Ballpark.
# Run as root:  bash setup-server.sh your-domain.example
# Safe to run again: it never touches the data in /var/lib/ballpark.
set -euo pipefail

DOMAIN="${1:?Usage: bash setup-server.sh your-domain.example}"

apt-get update
apt-get install -y caddy ufw curl ca-certificates
# Ballpark keeps its data in SQLite, which is built into Node.js 22.5 and later. Ubuntu's own package is older,
# so Node.js 24 comes from NodeSource (the usual source for current Node.js packages).
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'Number(process.versions.node.split(".")[0])')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi

# Dedicated user with no login; the app lives in /opt/ballpark, the data in /var/lib/ballpark.
id ballpark >/dev/null 2>&1 || useradd --system --home /opt/ballpark --shell /usr/sbin/nologin ballpark
mkdir -p /opt/ballpark /var/lib/ballpark
chown -R ballpark:ballpark /var/lib/ballpark
chmod 750 /var/lib/ballpark

cat > /etc/systemd/system/ballpark.service <<'EOF'
[Unit]
Description=Ballpark trivia server
After=network.target

[Service]
User=ballpark
WorkingDirectory=/opt/ballpark
Environment=PORT=3000
Environment=HOST=127.0.0.1
Environment=DATA_DIR=/var/lib/ballpark
ExecStart=/usr/bin/node /opt/ballpark/server.js
Restart=always
RestartSec=2
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/ballpark
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

# Caddy gets and renews the HTTPS certificate by itself.
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
	reverse_proxy 127.0.0.1:3000
}
EOF

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

systemctl daemon-reload
systemctl enable ballpark
systemctl restart caddy

echo
echo "Server is set up for https://$DOMAIN"
echo "Next: run deploy.ps1 from your PC to upload the app."
