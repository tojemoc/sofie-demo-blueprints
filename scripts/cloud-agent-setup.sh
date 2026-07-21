#!/usr/bin/env bash
# Cloud agent bootstrap for sofie-demo-blueprints.
# Run from repo root during environment setup or first agent turn.
set -euo pipefail

export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

if command -v nvm >/dev/null 2>&1 || [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  if [ -f .node-version ]; then
    nvm install "$(tr -d '[:space:]' < .node-version)"
    nvm use "$(tr -d '[:space:]' < .node-version)"
  else
    nvm install 22
    nvm use 22
  fi
fi

corepack enable
YARN_VERSION="$(node -p "require('./package.json').packageManager.replace(/^yarn@/, '')")"
corepack prepare "yarn@${YARN_VERSION}" --activate

yarn install

# Smoke rundown lives in the sofie megarepo (assets/), not this repo.
SMOKE_FIXTURE=""
if [ -n "${SOFIE_MEGAREPO_ASSETS:-}" ] && [ -f "${SOFIE_MEGAREPO_ASSETS}/spravy-v3-smoke-rundown.json" ]; then
  SMOKE_FIXTURE="${SOFIE_MEGAREPO_ASSETS}/spravy-v3-smoke-rundown.json"
elif [ -f ../assets/spravy-v3-smoke-rundown.json ]; then
  # Nested as blueprints/ under tojemoc/sofie
  SMOKE_FIXTURE="../assets/spravy-v3-smoke-rundown.json"
  export SOFIE_MEGAREPO_ASSETS="$(cd ../assets && pwd)"
fi

if [ -z "$SMOKE_FIXTURE" ]; then
  echo "Warning: spravy-v3-smoke-rundown.json not found — expected in sofie megarepo assets/. Set SOFIE_MEGAREPO_ASSETS or nest this clone under sofie/blueprints/. yarn test:blueprints may fail." >&2
fi

echo "Cloud bootstrap complete. Run yarn test:blueprints separately to verify tests."
