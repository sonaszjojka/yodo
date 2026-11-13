#!/usr/bin/env bash
# Refuses a release tag whose commit is not on `main`, or that is not the
# highest release tag (ADR 0049), so an older tag can't publish over a newer
# release. Needs a checkout with full history and tags (fetch-depth: 0).
# Usage: check-release-tag.sh  (reads GITHUB_SHA and GITHUB_REF_NAME)
set -euo pipefail

git fetch --no-tags origin main
if ! git merge-base --is-ancestor "$GITHUB_SHA" origin/main; then
  echo "::error::$GITHUB_REF_NAME is not on main"
  exit 1
fi
highest=$(git tag --list 'v[0-9]*.[0-9]*.[0-9]*' | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -n 1)
if [ "$highest" != "$GITHUB_REF_NAME" ]; then
  echo "::error::$GITHUB_REF_NAME is not the highest release tag ($highest)"
  exit 1
fi
