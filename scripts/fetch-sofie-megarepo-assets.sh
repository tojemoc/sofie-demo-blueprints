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
# Trust model: refs are immutable commit SHAs (not branch names). Content integrity
# is pinned by those SHAs via raw.githubusercontent.com/<sha>/… — no separate
# checksum files. Bump REFS intentionally when megarepo assets change.
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

# Newest-first immutable sofie commits that contain assets/.
REFS=(
	df2411f1df014591da381c5d3bd8cc0b347b6ab0 # sofie#20 flat clips|loops|wipes smoke paths
	7c67e3a83f4856c827a5a22b742d8d7d03d04a89 # ILU prerendered/bypass toggle + smoke
	cde9c49ec257fb8b354e28c65c49fce518bb26d9 # sofie#17 smoke Intro znelka / no headline wipes
	cdc2d3b66407e920159a1f5772c616d0056ca990 # main @ DoubleBox wipes + assets
	f6543791f8eebe55be53b9563ee2463c4787179a # #12 initial megarepo assets home
)

CURL_OPTS=(
	-fsSL
	--connect-timeout 10
	--max-time 60
	--retry 3
	--retry-delay 2
	--retry-connrefused
)

for ref in "${REFS[@]}"; do
	ok=1
	for f in "${FILES[@]}"; do
		if ! curl "${CURL_OPTS[@]}" -o "$DEST/$f" "$BASE/$ref/assets/$f"; then
			ok=0
			break
		fi
	done
	if [ "$ok" -eq 1 ]; then
		if [ -n "${GITHUB_ENV:-}" ]; then
			echo "SOFIE_MEGAREPO_ASSETS=$DEST" >>"$GITHUB_ENV"
		fi
		echo "Fetched sofie megarepo assets from $ref into $DEST" >&2
		# stdout: eval-compatible for local shells (CI relies on GITHUB_ENV above)
		printf 'export SOFIE_MEGAREPO_ASSETS=%q\n' "$DEST"
		exit 0
	fi
done

echo "Could not fetch sofie megarepo assets/ (tried pinned SHAs: ${REFS[*]})" >&2
exit 1
