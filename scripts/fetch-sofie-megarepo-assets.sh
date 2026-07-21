#!/usr/bin/env bash
# Fetch canonical sofie megarepo assets/ for standalone CI / local use.
# Writes SOFIE_MEGAREPO_ASSETS to $GITHUB_ENV when present.
set -euo pipefail

DEST="${1:-${GITHUB_WORKSPACE:-.}/.sofie-assets}"
mkdir -p "$DEST"
BASE="https://raw.githubusercontent.com/tojemoc/sofie"
FILES=(
	spravy-v3-smoke-rundown.json
	sofie-rundown-editor-piece-types.json
	sofie-rundown-editor-part-types.json
	sofie-rundown-editor-segment-types.json
)

# Prefer the assets feature branch until it lands on main.
for ref in cursor/megarepo-assets-home-3555 main; do
	ok=1
	for f in "${FILES[@]}"; do
		if ! curl -fsSL -o "$DEST/$f" "$BASE/$ref/assets/$f"; then
			ok=0
			break
		fi
	done
	if [ "$ok" -eq 1 ]; then
		if [ -n "${GITHUB_ENV:-}" ]; then
			echo "SOFIE_MEGAREPO_ASSETS=$DEST" >>"$GITHUB_ENV"
		fi
		export SOFIE_MEGAREPO_ASSETS="$DEST"
		echo "Fetched sofie megarepo assets from $ref into $DEST"
		exit 0
	fi
done

echo "Could not fetch sofie megarepo assets/ (tried cursor/megarepo-assets-home-3555 and main)" >&2
exit 1
