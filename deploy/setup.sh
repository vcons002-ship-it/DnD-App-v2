#!/usr/bin/env bash
# deploy/setup.sh — idempotent provisioner for a fresh Debian 12 GCP e2-micro.
#
# Run from the repo root, AFTER creating .env (see deploy/README.md):
#   sudo bash deploy/setup.sh
#
# Does, skipping anything already done:
#   1. 2 GB swapfile        (1 GB RAM is too tight for the Vite/tsc build)
#   2. Node 20 + git + build-essential + python3  (better-sqlite3 native build)
#   3. npm install + npm run build  (produces client/dist the server serves)
#   4. installs & enables the dndapp systemd service (auto-start, auto-restart)
#
# It does NOT touch app code, your local machine, or Caddy/DuckDNS (those are
# interactive — see README steps 2 and 4).

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo: sudo bash deploy/setup.sh" >&2
  exit 1
fi

# Resolve the repo root (this script lives in deploy/) and the invoking user.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RUN_USER="${SUDO_USER:-$(id -un)}"
RUN_HOME="$(getent passwd "$RUN_USER" | cut -d: -f6)"

echo "==> Repo:  $REPO_ROOT"
echo "==> User:  $RUN_USER"

if [[ ! -f "$REPO_ROOT/.env" ]]; then
  echo "ERROR: $REPO_ROOT/.env not found. Copy .env.example to .env and set" >&2
  echo "       PUBLIC_URL=https://YOURNAME.duckdns.org first (see deploy/README.md)." >&2
  exit 1
fi

# --- 1. Swapfile -------------------------------------------------------------
if ! swapon --show | grep -q '/swapfile'; then
  echo "==> Creating 2 GB swapfile"
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
else
  echo "==> Swapfile already present, skipping"
fi

# --- 2. System packages + Node 20 -------------------------------------------
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y git build-essential python3 ca-certificates curl

NEED_NODE=1
if command -v node >/dev/null 2>&1; then
  MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
  [[ "$MAJOR" -ge 20 ]] && NEED_NODE=0
fi
if [[ "$NEED_NODE" -eq 1 ]]; then
  echo "==> Installing Node.js 20 (NodeSource)"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
else
  echo "==> Node $(node -v) already satisfies >=20, skipping"
fi

# --- 3. Install deps + build (as the repo owner, not root) -------------------
echo "==> npm install + build (this is the slow part on an e2-micro)"
chown -R "$RUN_USER":"$RUN_USER" "$REPO_ROOT"
sudo -u "$RUN_USER" bash -lc "cd '$REPO_ROOT' && npm install && npm run build"

# --- 4. systemd service ------------------------------------------------------
NPM_BIN="$(command -v npm)"
echo "==> Installing systemd service (dndapp)"
cat > /etc/systemd/system/dndapp.service <<UNIT
[Unit]
Description=DnD-App-v2 virtual tabletop
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$REPO_ROOT
ExecStart=$NPM_BIN run start -w server
Restart=always
RestartSec=3
TimeoutStartSec=120
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now dndapp

echo
echo "==> Done. App service status:"
systemctl --no-pager --lines=0 status dndapp || true
echo
echo "Next: set up Caddy for HTTPS (deploy/README.md step 4), then open"
echo "      your PUBLIC_URL/dm in a browser."
