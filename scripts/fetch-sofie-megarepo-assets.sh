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
#
# Promotion: download into a complete generation directory, then atomically
# point `current` at it. Consumers must use SOFIE_MEGAREPO_ASSETS → …/current so
# they never observe a mixed old/new tree.
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
PINNED_SOFIE_ASSETS_REF="37bc380f3062b3503ac4beadbbed68e801e80f0b" # smoke: intro 8s, l3d-tema, ILU avízo

CURL_OPTS=(
	-fsSL
	--connect-timeout 10
	--max-time 60
	--retry 3
	--retry-delay 2
	--retry-connrefused
)

GENERATIONS="${DEST}/generations"
mkdir -p "$GENERATIONS"
GEN_DIR="${GENERATIONS}/${PINNED_SOFIE_ASSETS_REF}"
CURRENT_LINK="${DEST}/current"

# Stage a full generation; never publish file-by-file into the live pointer.
STAGE="$(mktemp -d "${GENERATIONS}/.fetch-XXXXXX")"
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

# Install the complete generation (replace same-SHA dir only after stage is full).
rm -rf "$GEN_DIR"
mv "$STAGE" "$GEN_DIR"
# STAGE no longer exists; disable cleanup of the promoted tree.
STAGE=""
trap - EXIT INT TERM

# Atomically switch the consumer pointer; keep prior generation until this succeeds.
LINK_STAGE="${DEST}/.current-new-$$"
ln -sfn "generations/${PINNED_SOFIE_ASSETS_REF}" "$LINK_STAGE"
mv -Tf "$LINK_STAGE" "$CURRENT_LINK"

# Drop other generation dirs now that current points at the new tree.
for gen in "$GENERATIONS"/*; do
	[ -d "$gen" ] || continue
	[ "$(basename "$gen")" = "$PINNED_SOFIE_ASSETS_REF" ] && continue
	rm -rf "$gen"
done

EXPORT_PATH="$CURRENT_LINK"
if [ -n "${GITHUB_ENV:-}" ]; then
	echo "SOFIE_MEGAREPO_ASSETS=$EXPORT_PATH" >>"$GITHUB_ENV"
fi
echo "Fetched sofie megarepo assets from ${PINNED_SOFIE_ASSETS_REF} into $EXPORT_PATH" >&2
# stdout: eval-compatible for local shells (CI relies on GITHUB_ENV above)
printf 'export SOFIE_MEGAREPO_ASSETS=%q\n' "$EXPORT_PATH"
