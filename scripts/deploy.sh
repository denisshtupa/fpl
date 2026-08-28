#!/usr/bin/env bash
# Deploy the FPL app to Netlify production from the main branch.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PROD="${1:-}"
if [[ "${PROD}" != "--prod" && "${PROD}" != "prod" && "${PROD}" != "" ]]; then
  echo "Usage: npm run deploy [-- --prod]"
  echo "  (default is production deploy)"
  exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "${BRANCH}" != "main" ]]; then
  echo "Switching to main (currently on ${BRANCH})…"
  git checkout main
fi

echo "Pulling latest main…"
git pull --ff-only origin main

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean. Commit or stash changes before deploying."
  git status --short
  exit 1
fi

echo "Building and deploying to Netlify production…"
npx --yes netlify-cli deploy --prod --build

echo
echo "Done. Live site: https://fpl-3i-league.netlify.app"
