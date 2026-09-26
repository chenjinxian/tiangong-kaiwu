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
NATIVE_PKG='@bentley/imodeljs-native'
native_ver() { node -p "require('./itwinjs-core/core/backend/package.json').dependencies['@bentley/imodeljs-native']"; }
NATIVE_BEFORE=$(native_ver)

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
  NATIVE_AFTER=$(native_ver)
  if [ "$NATIVE_BEFORE" != "$NATIVE_AFTER" ]; then
    echo ""
    echo "!!! $NATIVE_PKG version changed: $NATIVE_BEFORE -> $NATIVE_AFTER"
    echo "    imodel-native must catch up before the local binary can replace npm's:"
    echo "      1) cd D:/Github/imodel-native && ./sync-from-upstream.ps1   # merge upstream/main into dev/source-build"
    echo "      2) cmake --preset win-x64-release && cmake --build --preset win-x64-release"
    echo "      3) rush update + rush build, then: powershell -File scripts/replace-imodeljs-native.ps1"
    echo "    (scripts/replace-imodeljs-native.ps1 enforces the version gate)"
  else
    echo "==> $NATIVE_PKG stays at $NATIVE_AFTER — no imodel-native follow-up needed."
  fi
else
  echo ""
  echo "!!! Merge conflicts detected. Resolve them, then:"
  echo "    git add -A && git commit --no-edit"
  echo "    (pnpm-lock.yaml / rush.json / common/config/rush/*: take upstream's version)"
  exit 1
fi
