import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/** Mirrors Rundown Editor import validation in typeManifestsForm.tsx */
function verifyRundownEditorPieceTypesImport(data: unknown): data is Array<{
	id: string
	entityType: string
	name: string
	payload: unknown[]
}> {
	return (
		Array.isArray(data) &&
		data.every(
			(entry) =>
				typeof entry === 'object' &&
				entry !== null &&
				'id' in entry &&
				'entityType' in entry &&
				'name' in entry &&
				'payload' in entry
		)
	)
}

describe('sofie-rundown-editor-piece-types.json', () => {
	it('matches Rundown Editor piece type import validation', () => {
		const filePath = resolve(import.meta.dirname, '../../../../assets/sofie-rundown-editor-piece-types.json')
		const data: unknown = JSON.parse(readFileSync(filePath, 'utf8'))

		expect(verifyRundownEditorPieceTypesImport(data)).toBe(true)
		expect(data.every((entry) => entry.entityType === 'piece')).toBe(true)
	})
})
