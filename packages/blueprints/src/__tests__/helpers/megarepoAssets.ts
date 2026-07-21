import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Resolve a file under the sofie megarepo `assets/` directory.
 * Prefer `SOFIE_MEGAREPO_ASSETS`, then nested megarepo paths from this helpers folder.
 */
export function resolveMegarepoAsset(filename: string): string {
	const here = dirname(fileURLToPath(import.meta.url))
	const candidates = [
		// Explicit override (CI / standalone checkout)
		process.env.SOFIE_MEGAREPO_ASSETS ? resolve(process.env.SOFIE_MEGAREPO_ASSETS, filename) : undefined,
		// Nested in tojemoc/sofie: …/helpers → ../../../../../../assets
		resolve(here, '../../../../../../assets', filename),
		// Legacy in-repo path (removed; kept last for clear error context)
		resolve(here, '../../../../../assets', filename),
	].filter((p): p is string => Boolean(p))

	for (const filePath of candidates) {
		if (existsSync(filePath)) return filePath
	}

	throw new Error(
		`Megarepo asset not found (${filename}). Canonical copy lives in the sofie megarepo at assets/. ` +
			`Set SOFIE_MEGAREPO_ASSETS to that directory when not nested under the megarepo. Tried:\n` +
			candidates.map((p) => `  - ${p}`).join('\n')
	)
}
