#!/usr/bin/env bash
# DnD-App-v2 - installer for macOS / Linux.
# Checks for + installs Git, Node.js and cloudflared, clones/updates the repo,
# installs dependencies, and offers to launch. Safe to re-run to update.
set -euo pipefail

REPO_URL="https://github.com/vcons002-ship-it/DnD-App-v2.git"
BRANCH="claude/Main"
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
  # Force the working tree to EXACTLY match the remote branch. Only tracked
  # source is touched — your .env, the sessions DB and uploads live in
  # gitignored folders (server/data, server/uploads) and are never altered.
  # A plain "git pull" silently fails after a local edit or aborted merge and
  # leaves you on stale code (you'd run an old build and not see new features),
  # so we hard-reset and then VERIFY we landed on the remote tip.
  git -C "$INSTALL_DIR" checkout -f "$BRANCH"
  git -C "$INSTALL_DIR" reset --hard "origin/$BRANCH"
  local_head="$(git -C "$INSTALL_DIR" rev-parse HEAD)"
  remote_head="$(git -C "$INSTALL_DIR" rev-parse "origin/$BRANCH")"
  if [ "$local_head" != "$remote_head" ]; then
    echo "[ERROR] Could not update to the latest code (still on $local_head)."
    echo "Delete the folder $INSTALL_DIR and re-run this installer for a clean copy."
    echo "(Your sessions live in server/data and are unaffected by reinstalling the code.)"
    exit 1
  fi
  echo "Updated to latest (${local_head:0:7})."
else
  say "Cloning repository to $INSTALL_DIR"
  git clone --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi

# Keep our committed package-lock.json on any merge — `npm install` rewrites it
# locally and a plain pull would otherwise conflict on it (see .gitattributes
# `package-lock.json merge=ours`).
git -C "$INSTALL_DIR" config merge.ours.driver true || true

say "Installing dependencies"
( cd "$INSTALL_DIR" && npm install )
[ -f "$INSTALL_DIR/.env" ] || cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env" 2>/dev/null || true

say "Done! Installed to $INSTALL_DIR"
echo "To play later: open that folder and double-click  start.command"
echo "(Local-only testing without a tunnel: start-dev.command)"
echo "Or from a terminal:  cd \"$INSTALL_DIR\" && npm start"
read -r -p "Start the app now? [y/N] " a
case "$a" in [yY]*) ( cd "$INSTALL_DIR" && npm start ) ;; esac
