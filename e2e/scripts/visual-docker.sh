#!/usr/bin/env bash
# Runs the export visual suite in the pinned Playwright image (ADR 0044), the
# same image CI's `visual` job uses, so baselines made here match CI.
# Usage: scripts/visual-docker.sh [extra playwright args, e.g. --update-snapshots]
set -euo pipefail

cd "$(dirname "$0")/.."
root="$(cd .. && pwd)"

# The image tag must equal the installed @playwright/test version.
version="$(node -p "require('@playwright/test/package.json').version")"
image="mcr.microsoft.com/playwright:v${version}-noble"

# The build is plain static files, so the host can make it.
(cd ../web && npm run build)

# amd64 is CI's architecture; Apple-silicon Macs run it under emulation.
# Dependencies are installed fresh inside the container (npm ci), in
# anonymous volumes, so the host's macOS node_modules are never touched.
docker run --rm --platform linux/amd64 --ipc=host \
  -v "${root}:/work" \
  -v /work/e2e/node_modules \
  -w /work/e2e \
  "${image}" \
  bash -c 'npm ci --no-audit --no-fund && npx playwright test -c playwright.visual.config.ts "$@"' _ "$@"
