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
command -v node >/dev/null 2>&1 || { echo "node is required on PATH (native version check)"; exit 1; }
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
  if [ -d "$PREFIX/editor" ]; then
    echo ""
    echo "!!! upstream brought back $PREFIX/editor/ — editor is luban-cad first-party since 2026-10-22"
    echo "    (see docs/UPSTREAM_SYNC.md「editor/ 收编检查单」):"
    echo "      1) git rm -r $PREFIX/editor ; git rm $PREFIX/common/api/editor-*.api.md $PREFIX/common/api/summary/editor-*.exports.csv"
    echo "      2) drop the three editor/* entries from $PREFIX/rush.json"
    echo "      3) drop '@itwin/editor-*' deps from full-stack-tests/core and test-apps/display-test-app"
    echo "      4) CI=true rush update   # regenerate lockfile (upstream's has editor importers)"
    echo "      5) rush build --to @itwin/core-frontend --to @itwin/core-backend"
  fi
  NATIVE_AFTER=$(native_ver)
  if [ "$NATIVE_BEFORE" != "$NATIVE_AFTER" ]; then
    echo ""
    echo "!!! native package version changed: $NATIVE_BEFORE -> $NATIVE_AFTER"
    echo "    Follow the private native dependency repo's sync/build process before"
    echo "    replacing the local binary, then rerun the public replacement script."
  else
    echo "==> native package stays at $NATIVE_AFTER — no private follow-up needed."
  fi
else
  echo ""
  echo "!!! Merge conflicts detected. Resolve them, then:"
  echo "    git add -A && git commit --no-edit"
  echo "    (pnpm-lock.yaml / rush.json / common/config/rush/*: take upstream's version)"
  echo "    Then check whether the native package changed in itwinjs-core/core/backend/package.json"
  echo "    (the version tail-check only runs on clean syncs); follow the private repo process."
  exit 1
fi
