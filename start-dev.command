#!/usr/bin/env bash
# DnD-App-v2 - double-click launcher for macOS / Linux (LOCAL dev, no tunnel).
# macOS: double-click in Finder (the .command extension opens it in Terminal).
# Linux: run ./start-dev.command (or double-click if your file manager allows).
set -euo pipefail

# Run from the folder this script lives in, however it was launched.
cd "$(cd "$(dirname "$0")" && pwd)"

# Make sure Homebrew-installed tools are visible when launched from Finder.
for p in /opt/homebrew/bin /usr/local/bin; do
  case ":$PATH:" in *":$p:"*) ;; *) [ -d "$p" ] && PATH="$p:$PATH" ;; esac
done

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found. Run ./install.sh first."
  read -r -p "Press Enter to close..." _
  exit 1
fi

echo "Starting in LOCAL DEV mode (no tunnel) with hot reload."
echo "Open http://localhost:5173 in your browser."
echo "(Press Ctrl+C in this window to stop.)"
echo
npm run dev
