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
corepack prepare yarn@4.12.0 --activate

yarn install

if [ ! -f assets/spravy-v3-smoke-rundown.json ]; then
  echo "Missing blueprints test fixtures under assets/ — cannot run yarn test:blueprints" >&2
  exit 1
fi

yarn test:blueprints
