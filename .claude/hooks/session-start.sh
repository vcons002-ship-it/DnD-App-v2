#!/bin/bash
# SessionStart hook for Claude Code on the web.
#
# Purpose:
#   1. Recover from an ephemeral container that reverted to a STALE commit by
#      syncing the checkout up to the latest pushed work on the current branch.
#   2. Ensure dependencies are installed so tests/linters run immediately.
#
# Safe + idempotent: only resets when the tree is clean AND we're strictly behind
# origin (our HEAD is an ancestor of the remote tip), so local commits not yet on
# origin are never clobbered.
set -uo pipefail

# Only relevant inside the remote (ephemeral) web container.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# --- 1) Sync the workspace to the latest remote (recover from a revert) -------
branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
if [ -n "$branch" ] && [ "$branch" != "HEAD" ]; then
  if git diff --quiet && git diff --cached --quiet; then
    if git fetch origin "$branch" -q 2>/dev/null; then
      local_head="$(git rev-parse HEAD)"
      remote_head="$(git rev-parse "origin/$branch" 2>/dev/null || true)"
      if [ -n "$remote_head" ] && [ "$local_head" != "$remote_head" ] \
         && git merge-base --is-ancestor "$local_head" "$remote_head"; then
        echo "session-start: '$branch' was behind origin — syncing to latest pushed work."
        git reset --hard -q "origin/$branch"
      fi
    fi
  else
    echo "session-start: uncommitted changes present — skipping git sync (won't clobber)."
  fi
fi

# --- 2) Make sure dependencies are present (idempotent; fast when cached) ------
npm install --no-audit --no-fund || echo "session-start: npm install failed (continuing)."
