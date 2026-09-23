#!/usr/bin/env bash
# Moved: upstream sync is a repo-root tool in the single-repo (tiangong-kaiwu) layout.
exec bash "$(git rev-parse --show-toplevel)/scripts/sync-from-upstream.sh" "$@"
