#!/usr/bin/env bash
# DnD-App-v2 - installer for macOS / Linux.
# Checks for + installs Git, Node.js and cloudflared, clones/updates the repo,
# installs dependencies, and offers to launch. Safe to re-run to update.
set -euo pipefail

REPO_URL="https://github.com/vcons002-ship-it/DnD-App-v2.git"
BRANCH="claude/app-concept-architecture-sJbvy"
INSTALL_DIR="$HOME/DnD-App-v2"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }

# Pick a package manager for installs.
PM=""
if command -v brew >/dev/null 2>&1; then PM="brew"
elif command -v apt-get >/dev/null 2>&1; then PM="apt"
fi

ensure() { # ensure <command> <brew-formula> <apt-package>
  local cmd="$1" brewf="$2" aptp="$3"
  if command -v "$cmd" >/dev/null 2>&1; then
    echo "[OK] $cmd already installed."
    return
  fi
  say "Installing $cmd ..."
  case "$PM" in
    brew) brew install "$brewf" ;;
    apt)  sudo apt-get update -y && sudo apt-get install -y "$aptp" ;;
    *) echo "Please install '$cmd' manually, then re-run."; exit 1 ;;
  esac
}

ensure git  git           git
ensure node node          nodejs
# cloudflared package names differ; only brew has a simple formula.
if ! command -v cloudflared >/dev/null 2>&1; then
  if [ "$PM" = "brew" ]; then brew install cloudflared
  else echo "[note] Install cloudflared for remote access: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"; fi
fi

if [ -d "$INSTALL_DIR/.git" ]; then
  say "Updating existing install at $INSTALL_DIR"
  git -C "$INSTALL_DIR" fetch origin "$BRANCH"
  git -C "$INSTALL_DIR" checkout "$BRANCH"
  git -C "$INSTALL_DIR" pull origin "$BRANCH"
else
  say "Cloning repository to $INSTALL_DIR"
  git clone --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi

say "Installing dependencies"
( cd "$INSTALL_DIR" && npm install )
[ -f "$INSTALL_DIR/.env" ] || cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env" 2>/dev/null || true

say "Done! Installed to $INSTALL_DIR"
echo "To play:  cd \"$INSTALL_DIR\" && npm start"
read -r -p "Start the app now? [y/N] " a
case "$a" in [yY]*) ( cd "$INSTALL_DIR" && npm start ) ;; esac
