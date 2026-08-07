#!/usr/bin/env bash
# Fetch canonical sofie megarepo assets/ for standalone CI / local use.
#
# Local (export survives in the current shell):
#   eval "$(bash scripts/fetch-sofie-megarepo-assets.sh)"
#   # optional dest: eval "$(bash scripts/fetch-sofie-megarepo-assets.sh /tmp/sofie-assets)"
#
# CI: run as usual — also appends SOFIE_MEGAREPO_ASSETS to $GITHUB_ENV when set.
# Status messages go to stderr; the only stdout line is `export SOFIE_MEGAREPO_ASSETS=…`
# so `eval "$(…)"` is safe.
#
# Trust model: a single immutable sofie commit SHA (not a branch, not a fallback
# list). Fail closed if that revision cannot be fetched — never silently use an
# older incompatible asset tree. Bump PINNED_SOFIE_ASSETS_REF when megarepo
# assets change (keep in sync with sofie docs/integration/MEGAREPO-ASSETS-FETCH.md).
set -euo pipefail

DEST="${1:-${GITHUB_WORKSPACE:-.}/.sofie-assets}"
mkdir -p "$DEST"
DEST="$(cd "$DEST" && pwd)"
BASE="https://raw.githubusercontent.com/tojemoc/sofie"
FILES=(
	spravy-v3-smoke-rundown.json
	sofie-rundown-editor-piece-types.json
	sofie-rundown-editor-part-types.json
	sofie-rundown-editor-segment-types.json
)

# Single pin — fail closed (no older REFS fallback).
PINNED_SOFIE_ASSETS_REF="4e50c3d7a8af669572b199983ecf8c2d0e86af45" # sofie#26 DoubleBox ILU

CURL_OPTS=(
	-fsSL
	--connect-timeout 10
	--max-time 60
	--retry 3
	--retry-delay 2
	--retry-connrefused
)

# Stage under DEST so a failed fetch never leaves a mixed/partial tree for
# resolveMegarepoAsset() / SOFIE_MEGAREPO_ASSETS consumers.
STAGE="$(mktemp -d "${DEST}/.fetch-XXXXXX")"
cleanup_partial() {
	rm -rf "${STAGE}"
}
trap 'cleanup_partial' EXIT INT TERM

for f in "${FILES[@]}"; do
	if ! curl "${CURL_OPTS[@]}" -o "$STAGE/$f" "$BASE/${PINNED_SOFIE_ASSETS_REF}/assets/$f"; then
		echo "Could not fetch sofie megarepo assets/ from pinned SHA ${PINNED_SOFIE_ASSETS_REF} ($f)" >&2
		cleanup_partial
		exit 1
	fi
done

for f in "${FILES[@]}"; do
	mv -f "$STAGE/$f" "$DEST/$f"
done

trap - EXIT INT TERM
cleanup_partial

if [ -n "${GITHUB_ENV:-}" ]; then
	echo "SOFIE_MEGAREPO_ASSETS=$DEST" >>"$GITHUB_ENV"
fi
echo "Fetched sofie megarepo assets from ${PINNED_SOFIE_ASSETS_REF} into $DEST" >&2
# stdout: eval-compatible for local shells (CI relies on GITHUB_ENV above)
printf 'export SOFIE_MEGAREPO_ASSETS=%q\n' "$DEST"
