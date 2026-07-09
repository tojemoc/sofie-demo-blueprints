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

if [ ! -f assets/spravy-v3-smoke-rundown.json ]; then
  echo "Warning: missing blueprints test fixtures under assets/ — yarn test:blueprints will fail until present." >&2
fi

echo "Cloud bootstrap complete. Run yarn test:blueprints separately to verify tests."
