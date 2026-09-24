#!/usr/bin/env bash
# Sync latest upstream (iTwin/itwinjs-core) master into the itwinjs-core/ directory
# of THIS repository (tiangong-kaiwu is the single git repo; itwinjs-core/ is a
# vendor prefix maintained with git-subtree squash lineage).
#
# Usage (from repo root):
#   bash scripts/sync-from-upstream.sh
#
# If merge conflicts occur, resolve them (pnpm-lock.yaml / rush configs: take
# upstream's version), then: git add -A && git commit --no-edit
set -euo pipefail

UPSTREAM_REMOTE=upstream
UPSTREAM_URL=https://github.com/iTwin/itwinjs-core.git
PREFIX=itwinjs-core

if ! git remote get-url "$UPSTREAM_REMOTE" >/dev/null 2>&1; then
  git remote add "$UPSTREAM_REMOTE" "$UPSTREAM_URL"
fi

echo "==> Fetching upstream master..."
git fetch "$UPSTREAM_REMOTE" master

echo "==> Subtree-pulling into $PREFIX/ (squash lineage)..."
if GIT_MERGE_AUTOEDIT=no git subtree pull --prefix="$PREFIX" --squash "$UPSTREAM_REMOTE" master; then
  echo ""
  echo "==> Sync clean. Review with: git log --oneline -- $PREFIX | tail -5"
  echo "    Record the upstream sha in docs/UPSTREAM_SYNC.md"
else
  echo ""
  echo "!!! Merge conflicts detected. Resolve them, then:"
  echo "    git add -A && git commit --no-edit"
  echo "    (pnpm-lock.yaml / rush.json / common/config/rush/*: take upstream's version)"
  exit 1
fi
