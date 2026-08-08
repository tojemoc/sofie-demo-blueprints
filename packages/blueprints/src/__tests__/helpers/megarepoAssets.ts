import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Resolve a file under the sofie megarepo `assets/` directory.
 * Prefer `SOFIE_MEGAREPO_ASSETS` (from `scripts/fetch-sofie-megarepo-assets.sh`,
 * which pins a single sofie SHA, promotes a complete generation, then points
 * `current` at it), then the nested megarepo path.
 * Does not fall back to other revisions or legacy in-repo copies.
 */
export function resolveMegarepoAsset(filename: string): string {
	const here = dirname(fileURLToPath(import.meta.url))
	const candidates = [
		// Explicit override (CI / standalone) — must be the `current` generation pointer
		process.env.SOFIE_MEGAREPO_ASSETS ? resolve(process.env.SOFIE_MEGAREPO_ASSETS, filename) : undefined,
		// Nested in tojemoc/sofie: …/helpers → ../../../../../../assets
		resolve(here, '../../../../../../assets', filename),
	].filter((p): p is string => Boolean(p))

	for (const filePath of candidates) {
		if (existsSync(filePath)) return filePath
	}

	throw new Error(
		`Megarepo asset not found (${filename}). Canonical copy lives in the sofie megarepo at assets/. ` +
			`Run scripts/fetch-sofie-megarepo-assets.sh (single pinned SHA; fail-closed generation + current) or nest under sofie/. Tried:\n` +
			candidates.map((p) => `  - ${p}`).join('\n')
	)
}
